import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { visaoDe } from '../../../viagem/domain/visao';
import { Papel } from '../../../viagem/domain/ports/viagem.port';
import { FINANCEIRO, FinanceiroRepositorio } from '../../domain/financeiro.port';
import {
  AcertoLido,
  FalhaGasto,
  GastoLido,
  GastoNovo,
  GastosRepositorio,
  PainelDeGastos,
  SaldoLido,
} from '../../domain/gasto.port';

@Injectable()
export class GastosPgRepositorio implements GastosRepositorio {
  constructor(
    @Inject(DataSource) private readonly dados: DataSource,
    @Inject(FINANCEIRO) private readonly financeiro: FinanceiroRepositorio,
  ) {}

  painel(userId: string, viagemId: string): Promise<PainelDeGastos | FalhaGasto> {
    return this.montar(userId, viagemId);
  }

  async criar(userId: string, viagemId: string, gasto: GastoNovo): Promise<PainelDeGastos | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    return this.dados.transaction(async (tx) => {
      const pronto = await preparar(tx, viagemId, gasto);
      if (typeof pronto === 'string') return pronto;
      const cambio = await this.garantirTaxa(userId, gasto.currency);
      if (cambio !== 'ok') return cambio;
      const hoje = await dataDeHoje(tx);
      const criados = await tx.query<{ id: string }[]>(
        `INSERT INTO finance.expenses (
           trip_id, created_by_user_id, paid_by_participant_id, category_id, title, description,
           amount_original, currency_original, fx_rate_date, expense_date, context, is_estimate
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::finance.expense_context, $12)
         RETURNING id`,
        [
          viagemId,
          userId,
          gasto.paidByParticipantId,
          gasto.categoryId,
          pronto.titulo,
          gasto.description ?? null,
          gasto.amount,
          gasto.currency,
          hoje,
          gasto.expenseDate ?? null,
          gasto.context,
          gasto.isEstimate ?? false,
        ],
      );
      await gravarCotas(tx, criados[0].id, gasto.splits);
      return this.montar(userId, viagemId, tx);
    });
  }

  async editar(userId: string, viagemId: string, gastoId: string, gasto: GastoNovo): Promise<PainelDeGastos | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    return this.dados.transaction(async (tx) => {
      const pronto = await preparar(tx, viagemId, gasto);
      if (typeof pronto === 'string') return pronto;
      const datas = await tx.query<{ fx_rate_date: string }[]>(
        `SELECT fx_rate_date::text FROM finance.expenses WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
        [gastoId, viagemId],
      );
      if (datas.length === 0) return 'ausente';
      const cambio = await this.garantirTaxa(userId, gasto.currency, datas[0].fx_rate_date);
      if (cambio !== 'ok') return cambio;
      const linhas = linhasDe(
        await tx.query(
          `UPDATE finance.expenses
           SET paid_by_participant_id = $3, category_id = $4, title = $5, description = $6,
               amount_original = $7, currency_original = $8, expense_date = $9,
               context = $10::finance.expense_context, is_estimate = $11, updated_at = now()
           WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL
           RETURNING id`,
          [
            gastoId,
            viagemId,
            gasto.paidByParticipantId,
            gasto.categoryId,
            pronto.titulo,
            gasto.description ?? null,
            gasto.amount,
            gasto.currency,
            gasto.expenseDate ?? null,
            gasto.context,
            gasto.isEstimate ?? false,
          ],
        ),
      );
      if (linhas.length === 0) return 'ausente';
      await tx.query(`DELETE FROM finance.expense_participants WHERE expense_id = $1`, [gastoId]);
      await gravarCotas(tx, gastoId, gasto.splits);
      return this.montar(userId, viagemId, tx);
    });
  }

  async excluir(userId: string, viagemId: string, gastoId: string): Promise<PainelDeGastos | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = linhasDe(
      await this.dados.query(`UPDATE finance.expenses SET deleted_at = now(), updated_at = now() WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL RETURNING id`, [
        gastoId,
        viagemId,
      ]),
    );
    if (linhas.length === 0) return 'ausente';
    return this.montar(userId, viagemId);
  }

  async guardarRecibo(userId: string, viagemId: string, gastoId: string, chave: string, mime: string): Promise<string | null | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const atuais = await this.dados.query<{ receipt_storage_key: string | null }[]>(
      `SELECT receipt_storage_key FROM finance.expenses WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
      [gastoId, viagemId],
    );
    if (atuais.length === 0) return 'ausente';
    await this.dados.query(
      `UPDATE finance.expenses SET receipt_storage_key = $2, receipt_mime = $3, updated_at = now() WHERE id = $1`,
      [gastoId, chave, mime],
    );
    const anterior = atuais[0].receipt_storage_key;
    return anterior && anterior !== chave ? anterior : null;
  }

  async chaveDoRecibo(userId: string, viagemId: string, gastoId: string): Promise<string | null | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const linhas = await this.dados.query<{ receipt_storage_key: string | null }[]>(
      `SELECT receipt_storage_key FROM finance.expenses WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
      [gastoId, viagemId],
    );
    if (linhas.length === 0) return 'ausente';
    return linhas[0].receipt_storage_key;
  }

  async acertar(
    userId: string,
    viagemId: string,
    payerId: string,
    receiverId: string,
    amount: number,
    currency: string,
  ): Promise<PainelDeGastos | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    if (payerId === receiverId || amount <= 0) return 'acerto';
    const pessoas = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM travel.trip_participants WHERE trip_id = $1 AND removed_at IS NULL AND id IN ($2, $3)`,
      [viagemId, payerId, receiverId],
    );
    if (pessoas.length < 2) return 'pessoa';
    const moedas = await this.dados.query<{ code: string }[]>(`SELECT code FROM finance.currency_definitions WHERE code = $1 AND is_active`, [currency]);
    if (moedas.length === 0) return 'moeda';
    const cambio = await this.garantirTaxa(userId, currency);
    if (cambio !== 'ok') return cambio;
    await this.dados.query(
      `INSERT INTO finance.settlements (trip_id, payer_participant_id, receiver_participant_id, amount, currency, settled_at)
       VALUES ($1, $2, $3, $4, $5, clock_timestamp())`,
      [viagemId, payerId, receiverId, amount, currency],
    );
    return this.montar(userId, viagemId);
  }

  async desfazerAcerto(userId: string, viagemId: string, acertoId: string): Promise<PainelDeGastos | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const atuais = await this.dados.query<{ undone_at: Date | null }[]>(
      `SELECT undone_at FROM finance.settlements WHERE id = $1 AND trip_id = $2`,
      [acertoId, viagemId],
    );
    if (atuais.length === 0) return 'ausente';
    if (atuais[0].undone_at) return 'acerto';
    await this.dados.query(`UPDATE finance.settlements SET undone_at = clock_timestamp() WHERE id = $1`, [acertoId]);
    return this.montar(userId, viagemId);
  }

  private async pode(userId: string, viagemId: string): Promise<'ok' | 'ausente' | 'semGasto'> {
    const linhas = await this.dados.query<{ role: Papel | null }[]>(
      `SELECT p.role::text AS role
       FROM travel.trips t
       LEFT JOIN travel.trip_participants p ON p.trip_id = t.id AND p.user_id = $2 AND p.removed_at IS NULL
       WHERE t.id = $1 AND t.deleted_at IS NULL AND t.is_active
         AND (t.owner_user_id = $2 OR p.id IS NOT NULL)`,
      [viagemId, userId],
    );
    if (linhas.length === 0) return 'ausente';
    if (!visaoDe(linhas[0].role ?? 'owner').expenses) return 'semGasto';
    return 'ok';
  }

  private async garantirTaxa(userId: string, moeda: string, data?: string): Promise<'ok' | 'cambio' | 'moeda'> {
    const exibicao = await moedaDe(this.dados, userId);
    if (moeda === exibicao) return 'ok';
    const hoje = data ?? String((await this.dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);
    const taxa = await this.financeiro.taxa(moeda, exibicao, hoje);
    if (taxa === 'moeda') return 'moeda';
    if (typeof taxa === 'string') return 'cambio';
    return 'ok';
  }

  private async montar(userId: string, viagemId: string, tx: { query: DataSource['query'] } = this.dados): Promise<PainelDeGastos | FalhaGasto> {
    const acesso = await this.pode(userId, viagemId);
    if (acesso !== 'ok') return acesso;
    const exibicao = await moedaDe(tx, userId);
    const viagem = await tx.query<{ budget_amount: string | null; budget_currency: string | null }[]>(
      `SELECT budget_amount::text, budget_currency FROM travel.trips WHERE id = $1`,
      [viagemId],
    );
    const gastos = await tx.query<LinhaGasto[]>(
      `SELECT e.id, e.title, e.description, e.category_id, c.slug, c.name AS category_name,
              e.amount_original::text, e.currency_original, e.fx_rate_date::text AS fx_rate_date,
              e.expense_date::text AS expense_date, e.context::text AS context, e.is_estimate,
              e.paid_by_participant_id, pagador.display_name AS paid_by_name,
              (e.receipt_storage_key IS NOT NULL) AS has_receipt
       FROM finance.expenses e
       JOIN finance.expense_categories c ON c.id = e.category_id
       JOIN travel.trip_participants pagador ON pagador.id = e.paid_by_participant_id
       WHERE e.trip_id = $1 AND e.deleted_at IS NULL
       ORDER BY e.created_at DESC, e.id`,
      [viagemId],
    );
    const cotas = await tx.query<LinhaCota[]>(
      `SELECT ep.expense_id, ep.participant_id, p.display_name, ep.allocation_type::text AS allocation_type,
              ep.allocation_value::text, ep.share_amount::text
       FROM finance.expense_participants ep
       JOIN travel.trip_participants p ON p.id = ep.participant_id
       JOIN finance.expenses e ON e.id = ep.expense_id
       WHERE e.trip_id = $1 AND e.deleted_at IS NULL
       ORDER BY p.display_name`,
      [viagemId],
    );
    const acertos = await tx.query<LinhaAcerto[]>(
      `SELECT s.id, s.payer_participant_id, pagador.display_name AS payer_name,
              s.receiver_participant_id, recebedor.display_name AS receiver_name,
              s.amount::text, s.currency, s.created_at::date::text AS rate_date, s.undone_at
       FROM finance.settlements s
       JOIN travel.trip_participants pagador ON pagador.id = s.payer_participant_id
       JOIN travel.trip_participants recebedor ON recebedor.id = s.receiver_participant_id
       WHERE s.trip_id = $1
       ORDER BY s.created_at DESC`,
      [viagemId],
    );
    const cache = new Map<string, number>();
    const converter = async (valor: number, moeda: string, data: string): Promise<number | 'cambio'> => {
      if (moeda.trim() === exibicao) return centavos(valor);
      const chave = `${moeda.trim()}|${data}`;
      let taxa = cache.get(chave);
      if (taxa === undefined) {
        const lida = await this.financeiro.taxa(moeda.trim(), exibicao, data);
        if (typeof lida === 'string') return 'cambio';
        taxa = lida.rate;
        cache.set(chave, taxa);
      }
      return centavos(valor * taxa);
    };
    const expenses: GastoLido[] = [];
    const porCategoria = new Map<string, { slug: string; name: string; total: number }>();
    const saldos = new Map<string, SaldoLido>();
    const somar = (id: string, nome: string, valor: number): void => {
      const atual = saldos.get(id) ?? { participantId: id, displayName: nome, net: 0 };
      atual.net = centavos(atual.net + valor);
      saldos.set(id, atual);
    };
    for (const linha of gastos) {
      const exibido = await converter(Number(linha.amount_original), linha.currency_original, linha.fx_rate_date);
      if (exibido === 'cambio') return 'cambio';
      const splits = cotas
        .filter((cota) => cota.expense_id === linha.id)
        .map((cota) => ({
          participantId: cota.participant_id,
          displayName: cota.display_name,
          allocationType: cota.allocation_type as GastoLido['splits'][number]['allocationType'],
          allocationValue: cota.allocation_value === null ? null : Number(cota.allocation_value),
          shareAmount: Number(cota.share_amount),
        }));
      expenses.push({
        id: linha.id,
        title: linha.title,
        description: linha.description,
        categoryId: linha.category_id,
        categorySlug: linha.slug,
        categoryName: linha.category_name,
        amountOriginal: Number(linha.amount_original),
        currencyOriginal: linha.currency_original.trim(),
        amountDisplay: exibido,
        expenseDate: linha.expense_date,
        context: linha.context as GastoLido['context'],
        isEstimate: linha.is_estimate,
        paidByParticipantId: linha.paid_by_participant_id,
        paidByName: linha.paid_by_name,
        hasReceipt: linha.has_receipt,
        splits,
      });
      const categoria = porCategoria.get(linha.slug) ?? { slug: linha.slug, name: linha.category_name, total: 0 };
      categoria.total = centavos(categoria.total + exibido);
      porCategoria.set(linha.slug, categoria);
      somar(linha.paid_by_participant_id, linha.paid_by_name, exibido);
      for (const cota of splits) {
        const cotaExibida = await converter(cota.shareAmount, linha.currency_original, linha.fx_rate_date);
        if (cotaExibida === 'cambio') return 'cambio';
        somar(cota.participantId, cota.displayName, -cotaExibida);
      }
    }
    const settlements: AcertoLido[] = [];
    for (const linha of acertos) {
      const exibido = await converter(Number(linha.amount), linha.currency, linha.rate_date);
      if (exibido === 'cambio') return 'cambio';
      settlements.push({
        id: linha.id,
        payerParticipantId: linha.payer_participant_id,
        payerName: linha.payer_name,
        receiverParticipantId: linha.receiver_participant_id,
        receiverName: linha.receiver_name,
        amount: Number(linha.amount),
        currency: linha.currency.trim(),
        amountDisplay: exibido,
        undone: linha.undone_at !== null,
      });
      if (!linha.undone_at) {
        somar(linha.payer_participant_id, linha.payer_name, exibido);
        somar(linha.receiver_participant_id, linha.receiver_name, -exibido);
      }
    }
    return {
      currency: exibicao,
      total: centavos([...porCategoria.values()].reduce((soma, item) => soma + item.total, 0)),
      budgetAmount: viagem[0]?.budget_amount === null || viagem[0]?.budget_amount === undefined ? null : Number(viagem[0].budget_amount),
      budgetCurrency: viagem[0]?.budget_currency?.trim() ?? null,
      categories: [...porCategoria.values()],
      balances: [...saldos.values()],
      expenses,
      settlements,
    };
  }
}

async function preparar(
  tx: { query: DataSource['query'] },
  viagemId: string,
  gasto: GastoNovo,
): Promise<{ titulo: string } | 'categoria' | 'moeda' | 'pessoa' | 'data'> {
  const categorias = await tx.query<{ name: string }[]>(`SELECT name FROM finance.expense_categories WHERE id = $1`, [gasto.categoryId]);
  if (categorias.length === 0) return 'categoria';
  const moedas = await tx.query<{ code: string }[]>(`SELECT code FROM finance.currency_definitions WHERE code = $1 AND is_active`, [gasto.currency]);
  if (moedas.length === 0) return 'moeda';
  const ids = [gasto.paidByParticipantId, ...gasto.splits.map((parte) => parte.participantId)];
  const pessoas = await tx.query<{ id: string }[]>(
    `SELECT id FROM travel.trip_participants WHERE trip_id = $1 AND removed_at IS NULL AND id = ANY($2::uuid[])`,
    [viagemId, ids],
  );
  if (new Set(pessoas.map((pessoa) => pessoa.id)).size !== new Set(ids).size) return 'pessoa';
  if (gasto.context === 'on_trip' && !gasto.expenseDate) return 'data';
  if (gasto.expenseDate) {
    const datas = await tx.query<{ start_date: string | null; end_date: string | null }[]>(
      `SELECT start_date::text, end_date::text FROM travel.trips WHERE id = $1`,
      [viagemId],
    );
    const inicio = datas[0]?.start_date;
    const fim = datas[0]?.end_date;
    if (inicio && fim && (gasto.expenseDate < inicio || gasto.expenseDate > fim)) return 'data';
  }
  const titulo = gasto.title?.trim() || categorias[0].name;
  return { titulo: titulo.slice(0, 255) };
}

async function gravarCotas(tx: { query: DataSource['query'] }, gastoId: string, partes: GastoNovo['splits']): Promise<void> {
  for (const parte of partes) {
    await tx.query(
      `INSERT INTO finance.expense_participants (expense_id, participant_id, allocation_type, allocation_value, share_amount)
       VALUES ($1, $2, $3::finance.allocation_type, $4, $5)`,
      [gastoId, parte.participantId, parte.allocationType, parte.allocationValue, parte.shareAmount],
    );
  }
}

async function moedaDe(tx: { query: DataSource['query'] }, userId: string): Promise<string> {
  const linhas = await tx.query<{ display_currency: string }[]>(`SELECT display_currency FROM identity.user_preferences WHERE user_id = $1`, [userId]);
  return linhas[0]?.display_currency?.trim() || 'BRL';
}

async function dataDeHoje(tx: { query: DataSource['query'] }): Promise<string> {
  return String((await tx.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`))[0].hoje).slice(0, 10);
}

function linhasDe<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

interface LinhaGasto {
  id: string;
  title: string;
  description: string | null;
  category_id: string;
  slug: string;
  category_name: string;
  amount_original: string;
  currency_original: string;
  fx_rate_date: string;
  expense_date: string | null;
  context: string;
  is_estimate: boolean;
  paid_by_participant_id: string;
  paid_by_name: string;
  has_receipt: boolean;
}

interface LinhaCota {
  expense_id: string;
  participant_id: string;
  display_name: string;
  allocation_type: string;
  allocation_value: string | null;
  share_amount: string;
}

interface LinhaAcerto {
  id: string;
  payer_participant_id: string;
  payer_name: string;
  receiver_participant_id: string;
  receiver_name: string;
  amount: string;
  currency: string;
  rate_date: string;
  undone_at: Date | null;
}
