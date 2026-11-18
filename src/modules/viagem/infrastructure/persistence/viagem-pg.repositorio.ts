import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { podeConvidar, podeRemover, visaoDe } from '../../domain/visao';
import {
  Carteira,
  ConviteAberto,
  ConviteNovo,
  ConviteParaEnviar,
  CriarViagem,
  DestinoLido,
  FiltroDaCarteira,
  IdiomaDoConvite,
  ModoDeComeco,
  Papel,
  PapelDoConvite,
  ParticipanteLido,
  StatusDoCartao,
  ViagemLida,
  ViagemRepositorio,
} from '../../domain/ports/viagem.port';

interface LinhaViagem {
  id: string;
  title: string;
  description: string | null;
  start_date: string | Date | null;
  end_date: string | Date | null;
  duration_days: number | null;
  day_count: number | string;
  status: StatusDoCartao;
  days_until: number | string | null;
  visibility: 'private' | 'public';
  start_mode: ModoDeComeco;
  adult_count: number;
  child_count: number;
  budget_amount: string | null;
  budget_currency: string | null;
  has_cover: boolean;
  destination_count: number | string;
  caller_role: Papel | null;
}

interface LinhaParticipante {
  id: string;
  trip_id: string;
  user_id: string | null;
  display_name: string;
  party_kind: 'adult' | 'child';
  role: Papel | null;
  joined: boolean;
}

interface LinhaDestino {
  id: string;
  trip_id: string;
  city_id: string | null;
  city_name: string | null;
  custom_name: string | null;
  arrival_date: string | Date | null;
  departure_date: string | Date | null;
  sort_order: number;
}

const STATUS = `CASE
  WHEN t.start_date IS NULL THEN 'draft'
  WHEN CURRENT_DATE < t.start_date THEN 'upcoming'
  WHEN CURRENT_DATE > t.end_date THEN 'finished'
  ELSE 'happening'
END`;

const DIAS = `CASE
  WHEN t.start_date IS NOT NULL THEN (t.end_date - t.start_date + 1)
  ELSE t.duration_days
END`;

const ACESSO = `(
  t.owner_user_id = $1
  OR EXISTS (
    SELECT 1 FROM travel.trip_participants acesso
    WHERE acesso.trip_id = t.id AND acesso.user_id = $1 AND acesso.removed_at IS NULL
  )
)`;

@Injectable()
export class ViagemPgRepositorio implements ViagemRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async hoje(): Promise<string> {
    const linhas = await this.dados.query<{ hoje: string }[]>(`SELECT CURRENT_DATE::text AS hoje`);
    return String(linhas[0]?.hoje).slice(0, 10);
  }

  async teto(chave: string): Promise<number | null> {
    const linhas = await this.dados.query<{ setting_value: unknown }[]>(
      `SELECT setting_value FROM platform.system_settings WHERE setting_key = $1`,
      [chave],
    );
    const valor = linhas[0]?.setting_value;
    const numero = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;
    return Number.isInteger(numero) && numero >= 1 ? numero : null;
  }

  async nomesDasCidades(ids: string[]): Promise<Map<string, string> | null> {
    if (ids.length === 0) return new Map();
    const unicos = [...new Set(ids)];
    const linhas = await this.dados.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM geography.cities WHERE id = ANY($1::uuid[])`,
      [unicos],
    );
    if (linhas.length !== unicos.length) return null;
    return new Map(linhas.map((linha) => [linha.id, linha.name]));
  }

  async moedaAtiva(codigo: string): Promise<boolean> {
    const linhas = await this.dados.query<{ code: string }[]>(
      `SELECT code FROM finance.currency_definitions WHERE code = $1 AND is_active`,
      [codigo],
    );
    return linhas.length > 0;
  }

  async criar(entrada: CriarViagem): Promise<{ id: string; convites: ConviteParaEnviar[] } | 'pessoa' | 'duplicado'> {
    try {
      return await this.dados.transaction(async (tx) => {
      const criadas = await tx.query<{ id: string }[]>(
        `INSERT INTO travel.trips (
           owner_user_id, title, description, start_date, end_date, duration_days, visibility, start_mode,
           adult_count, child_count, budget_amount, budget_currency
         ) VALUES ($1, $2, $3, $4, $5, $6, 'private', $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          entrada.ownerId,
          entrada.title,
          entrada.description,
          entrada.startDate,
          entrada.endDate,
          entrada.durationDays,
          entrada.startMode,
          entrada.adultCount,
          entrada.childCount,
          entrada.budgetAmount,
          entrada.budgetCurrency,
        ],
      );
      const id = criadas[0].id;
      const perfis = await tx.query<{ display_name: string }[]>(
        `SELECT display_name FROM identity.user_profiles WHERE user_id = $1`,
        [entrada.ownerId],
      );
      const nomeDoDono = perfis[0]?.display_name ?? 'Viajante 1';
      await gravarParticipantes(tx, id, entrada.ownerId, nomeDoDono, entrada.adultCount, entrada.childCount);
      const convites = await gravarConvites(tx, id, entrada.ownerId, nomeDoDono, entrada.title, entrada.invites);
      for (const [ordem, destino] of entrada.destinations.entries()) {
        await tx.query(
          `INSERT INTO travel.trip_destinations (trip_id, city_id, custom_name, sort_order) VALUES ($1, $2, $3, $4)`,
          [id, destino.cityId, destino.customName, ordem],
        );
      }
      return { id, convites };
      });
    } catch (erro) {
      return falhaDeConvite(erro);
    }
  }

  async convidar(userId: string, viagemId: string, convites: ConviteNovo[]): Promise<ConviteParaEnviar[] | 'ausente' | 'semConvite' | 'pessoa' | 'duplicado'> {
    const papel = await papelDe(this.dados, viagemId, userId, false);
    if (papel === 'ausente') return 'ausente';
    if (!podeConvidar(papel)) return 'semConvite';
    try {
      return await this.dados.transaction(async (tx) => {
        const viagem = await tx.query<{ title: string }[]>(`SELECT title FROM travel.trips WHERE id = $1 AND deleted_at IS NULL AND is_active`, [viagemId]);
        const perfis = await tx.query<{ display_name: string }[]>(`SELECT display_name FROM identity.user_profiles WHERE user_id = $1`, [userId]);
        return gravarConvites(tx, viagemId, userId, perfis[0]?.display_name ?? 'Viajante 1', viagem[0]?.title ?? '', convites);
      });
    } catch (erro) {
      return falhaDeConvite(erro);
    }
  }

  async abrirConvite(userId: string, token: string): Promise<ConviteAberto | 'convite' | 'alheio' | 'usado'> {
    const aberto = await this.comToken(userId, token, async (tx, convite) => {
      void tx;
      return abertoDe(convite);
    });
    return aberto === 'pessoa' ? 'usado' : aberto;
  }

  async aceitarConvite(userId: string, token: string): Promise<{ tripId: string } | 'convite' | 'alheio' | 'usado' | 'pessoa'> {
    return this.comToken(userId, token, async (tx, convite) => {
      await tx.query(
        `UPDATE travel.trip_invitations
         SET status = 'accepted', accepted_at = clock_timestamp(), invited_user_id = $2
         WHERE id = $1`,
        [convite.id, userId],
      );
      await tx.query(
        `UPDATE travel.trip_participants
         SET user_id = $2, joined_at = clock_timestamp()
         WHERE id = $1 AND removed_at IS NULL`,
        [convite.participant_id, userId],
      );
      return { tripId: convite.trip_id };
    });
  }

  async recusarConvite(userId: string, token: string): Promise<'ok' | 'convite' | 'alheio' | 'usado'> {
    const resultado = await this.comToken(userId, token, async (tx, convite) => {
      await tx.query(`UPDATE travel.trip_invitations SET status = 'declined', declined_at = clock_timestamp() WHERE id = $1`, [convite.id]);
      await tx.query(`UPDATE travel.trip_participants SET removed_at = clock_timestamp() WHERE id = $1 AND removed_at IS NULL`, [convite.participant_id]);
      return 'ok' as const;
    });
    return resultado === 'pessoa' ? 'usado' : resultado;
  }

  async alterarPapel(userId: string, viagemId: string, participanteId: string, papel: PapelDoConvite): Promise<'ok' | 'ausente' | 'papel' | 'crianca' | 'sumido'> {
    return this.dados.transaction(async (tx) => {
      const papelDeQuem = await papelDe(tx, viagemId, userId, true);
      if (papelDeQuem === 'ausente') return 'ausente';
      if (papelDeQuem !== 'owner') return 'papel';
      const alvo = await participanteAtivo(tx, viagemId, participanteId);
      if (!alvo) return 'sumido';
      if (alvo.party_kind === 'child') return 'crianca';
      if (alvo.role === 'owner') return 'papel';
      await tx.query(`UPDATE travel.trip_participants SET role = $2::travel.participant_role WHERE id = $1`, [participanteId, papel]);
      return 'ok';
    });
  }

  async remover(userId: string, viagemId: string, participanteId: string): Promise<'ok' | 'ausente' | 'remover' | 'saida' | 'sumido'> {
    return this.dados.transaction(async (tx) => {
      const papelDeQuem = await papelDe(tx, viagemId, userId, true);
      if (papelDeQuem === 'ausente') return 'ausente';
      if (!podeRemover(papelDeQuem)) return 'remover';
      const alvo = await participanteAtivo(tx, viagemId, participanteId);
      if (!alvo) return 'sumido';
      if (alvo.role === 'owner') return 'saida';
      await tx.query(`UPDATE travel.trip_participants SET removed_at = clock_timestamp() WHERE id = $1`, [participanteId]);
      return 'ok';
    });
  }

  async sair(userId: string, viagemId: string): Promise<'ok' | 'ausente' | 'saida'> {
    return this.dados.transaction(async (tx) => {
      const papelDeQuem = await papelDe(tx, viagemId, userId, true);
      if (papelDeQuem === 'ausente') return 'ausente';
      if (papelDeQuem === 'owner') return 'saida';
      await tx.query(
        `UPDATE travel.trip_participants SET removed_at = clock_timestamp()
         WHERE trip_id = $1 AND user_id = $2 AND removed_at IS NULL`,
        [viagemId, userId],
      );
      return 'ok';
    });
  }

  async publicar(userId: string, viagemId: string, visibility: 'private' | 'public'): Promise<'ok' | 'ausente' | 'publicar'> {
    const papelDeQuem = await papelDe(this.dados, viagemId, userId, false);
    if (papelDeQuem === 'ausente') return 'ausente';
    if (papelDeQuem !== 'owner') return 'publicar';
    await this.dados.query(`UPDATE travel.trips SET visibility = $2::travel.trip_visibility, updated_at = now() WHERE id = $1`, [viagemId, visibility]);
    return 'ok';
  }

  async clonar(userId: string, viagemId: string): Promise<string | 'ausente' | 'privada'> {
    return this.dados.transaction(async (tx) => {
      const origens = await tx.query<{ id: string; visibility: string }[]>(
        `SELECT id, visibility::text FROM travel.trips WHERE id = $1 AND deleted_at IS NULL AND is_active`,
        [viagemId],
      );
      if (origens.length === 0) return 'ausente';
      if (origens[0].visibility !== 'public') return 'privada';
      const criadas = await tx.query<{ id: string }[]>(
        `INSERT INTO travel.trips (
           owner_user_id, title, description, start_date, end_date, duration_days, visibility, start_mode,
           adult_count, child_count, budget_amount, budget_currency
         )
         SELECT $2, title, description, start_date, end_date, duration_days, 'private', start_mode,
                adult_count, child_count, budget_amount, budget_currency
         FROM travel.trips WHERE id = $1
         RETURNING id`,
        [viagemId, userId],
      );
      const novoId = criadas[0].id;
      const perfis = await tx.query<{ display_name: string }[]>(`SELECT display_name FROM identity.user_profiles WHERE user_id = $1`, [userId]);
      const origem = await tx.query<{ adult_count: number; child_count: number }[]>(`SELECT adult_count, child_count FROM travel.trips WHERE id = $1`, [novoId]);
      await gravarParticipantes(tx, novoId, userId, perfis[0]?.display_name ?? 'Viajante 1', origem[0].adult_count, origem[0].child_count);
      await tx.query(
        `INSERT INTO travel.trip_destinations (trip_id, city_id, custom_name, arrival_date, departure_date, sort_order)
         SELECT $2, city_id, custom_name, arrival_date, departure_date, sort_order
         FROM travel.trip_destinations WHERE trip_id = $1
         ORDER BY sort_order, id`,
        [viagemId, novoId],
      );
      await copiarRoteiro(tx, viagemId, novoId, userId);
      await tx.query(
        `INSERT INTO travel.trip_clones (original_trip_id, cloned_trip_id, cloned_by_user_id) VALUES ($1, $2, $3)`,
        [viagemId, novoId, userId],
      );
      return novoId;
    });
  }

  async passarPosse(userId: string, viagemId: string, participanteId: string): Promise<'ok' | 'ausente' | 'posse' | 'entrada' | 'sumido'> {
    return this.dados.transaction(async (tx) => {
      const papelDeQuem = await papelDe(tx, viagemId, userId, true);
      if (papelDeQuem === 'ausente') return 'ausente';
      if (papelDeQuem !== 'owner') return 'posse';
      const alvo = await participanteAtivo(tx, viagemId, participanteId);
      if (!alvo) return 'sumido';
      if (!alvo.user_id || alvo.user_id === userId) return 'entrada';
      const dono = await tx.query<{ id: string }[]>(
        `SELECT id FROM travel.trip_participants
         WHERE trip_id = $1 AND user_id = $2 AND role = 'owner' AND removed_at IS NULL`,
        [viagemId, userId],
      );
      if (dono.length === 0) return 'posse';
      await tx.query(
        `INSERT INTO travel.trip_ownership_transfers (trip_id, from_user_id, to_user_id) VALUES ($1, $2, $3)`,
        [viagemId, userId, alvo.user_id],
      );
      await tx.query(`UPDATE travel.trips SET owner_user_id = $2, updated_at = now() WHERE id = $1`, [viagemId, alvo.user_id]);
      await tx.query(`UPDATE travel.trip_participants SET role = 'supreme_traveler'::travel.participant_role WHERE id = $1`, [dono[0].id]);
      await tx.query(`UPDATE travel.trip_participants SET role = 'owner'::travel.participant_role WHERE id = $1`, [participanteId]);
      return 'ok';
    });
  }

  async carteira(donoId: string, filtro: FiltroDaCarteira): Promise<Carteira> {
    const viagens = await this.listar(donoId, filtro);
    const totais = await this.dados.query<{ todas: string; proximas: string; rascunhos: string }[]>(
      `SELECT
         count(*)::text AS todas,
         count(*) FILTER (WHERE ${STATUS} IN ('upcoming', 'happening'))::text AS proximas,
         count(*) FILTER (WHERE ${STATUS} = 'draft')::text AS rascunhos
       FROM travel.trips t
       WHERE t.deleted_at IS NULL AND t.is_active AND ${ACESSO}`,
      [donoId],
    );
    return {
      counts: {
        all: Number(totais[0]?.todas ?? 0),
        upcoming: Number(totais[0]?.proximas ?? 0),
        drafts: Number(totais[0]?.rascunhos ?? 0),
      },
      trips: viagens,
    };
  }

  async ficha(donoId: string, viagemId: string): Promise<ViagemLida | null> {
    const viagens = await this.listar(donoId, 'todas', viagemId);
    return viagens[0] ?? null;
  }

  async guardarCapa(donoId: string, viagemId: string, chave: string): Promise<string | null | 'ausente' | 'proibido'> {
    return this.dados.transaction(async (tx) => {
      const papel = await papelDe(tx, viagemId, donoId, true);
      if (papel === 'ausente') return 'ausente';
      if (!visaoDe(papel).edit) return 'proibido';
      const atuais = await tx.query<{ cover_storage_key: string | null }[]>(
        `SELECT cover_storage_key FROM travel.trips WHERE id = $1`,
        [viagemId],
      );
      await tx.query(`UPDATE travel.trips SET cover_storage_key = $2, updated_at = now() WHERE id = $1`, [viagemId, chave]);
      return atuais[0]?.cover_storage_key ?? null;
    });
  }

  async chaveDaCapa(donoId: string, viagemId: string): Promise<string | null | 'ausente'> {
    const papel = await papelDe(this.dados, viagemId, donoId, false);
    if (papel === 'ausente') return 'ausente';
    const linhas = await this.dados.query<{ cover_storage_key: string | null }[]>(
      `SELECT cover_storage_key FROM travel.trips WHERE id = $1 AND deleted_at IS NULL AND is_active`,
      [viagemId],
    );
    return linhas[0]?.cover_storage_key ?? null;
  }

  async renomear(userId: string, viagemId: string, participanteId: string, nome: string): Promise<'ok' | 'ausente' | 'proibido' | 'duplicado'> {
    const papel = await papelDe(this.dados, viagemId, userId, false);
    if (papel === 'ausente') return 'ausente';
    if (!visaoDe(papel).edit) return 'proibido';
    try {
      const linhas = linhasDe(
        await this.dados.query<{ id: string }[] | [{ id: string }[], number]>(
          `UPDATE travel.trip_participants
           SET display_name = $3
           WHERE id = $1 AND trip_id = $2 AND removed_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM travel.trip_participants outro
               WHERE outro.trip_id = $2 AND outro.removed_at IS NULL AND outro.id <> $1
                 AND lower(outro.display_name) = lower($3)
             )
           RETURNING id`,
          [participanteId, viagemId, nome],
        ),
      );
      return linhas.length === 0 ? await this.motivoDoNome(viagemId, participanteId) : 'ok';
    } catch (erro) {
      if (codigoDe(erro) === '23505') return 'duplicado';
      throw erro;
    }
  }

  private async comToken<T>(
    userId: string,
    token: string,
    efeito: (tx: { query: DataSource['query'] }, convite: LinhaConvite) => Promise<T>,
  ): Promise<T | 'convite' | 'alheio' | 'usado' | 'pessoa'> {
    try {
      return await this.dados.transaction(async (tx) => {
        const linhas = await tx.query<LinhaConvite[]>(
          `SELECT i.id, i.trip_id, i.participant_id, i.status::text AS status, i.invited_email,
                  i.role::text AS role, tr.title, lower(caller.email) AS caller_email
           FROM travel.trip_invitation_tokens tok
           JOIN travel.trip_invitations i ON i.id = tok.invitation_id
           JOIN travel.trips tr ON tr.id = i.trip_id AND tr.deleted_at IS NULL AND tr.is_active
           JOIN identity.users caller ON caller.id = $2 AND caller.deleted_at IS NULL
           WHERE tok.token_hash = $1
           FOR UPDATE OF tok`,
          [hashDe(token), userId],
        );
        const convite = linhas[0];
        if (!convite) return 'convite';
        if (convite.caller_email !== convite.invited_email.toLowerCase()) return 'alheio';
        if (convite.status !== 'pending') return 'usado';
        await tx.query(
          `UPDATE travel.trip_invitation_tokens SET opened_at = COALESCE(opened_at, clock_timestamp()) WHERE invitation_id = $1`,
          [convite.id],
        );
        return efeito(tx, convite);
      });
    } catch (erro) {
      if (codigoDe(erro) === '23505') return 'pessoa';
      throw erro;
    }
  }

  private async motivoDoNome(viagemId: string, participanteId: string): Promise<'ausente' | 'duplicado'> {
    const linhas = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM travel.trip_participants
       WHERE id = $1 AND trip_id = $2 AND removed_at IS NULL`,
      [participanteId, viagemId],
    );
    return linhas.length === 0 ? 'ausente' : 'duplicado';
  }

  private async listar(donoId: string, filtro: FiltroDaCarteira, viagemId?: string): Promise<ViagemLida[]> {
    const filtroSql =
      filtro === 'proximas' ? `AND ${STATUS} IN ('upcoming', 'happening')` : filtro === 'rascunhos' ? `AND ${STATUS} = 'draft'` : '';
    const linhas = await this.dados.query<LinhaViagem[]>(
      `SELECT t.id, t.title, t.description, t.start_date::text AS start_date, t.end_date::text AS end_date,
              t.duration_days, ${DIAS} AS day_count, ${STATUS} AS status,
              CASE WHEN ${STATUS} = 'upcoming' THEN (t.start_date - CURRENT_DATE) ELSE NULL END AS days_until,
              t.visibility, t.start_mode, t.adult_count, t.child_count, t.budget_amount::text AS budget_amount,
              t.budget_currency, (t.cover_storage_key IS NOT NULL) AS has_cover,
              (SELECT count(*) FROM travel.trip_destinations d WHERE d.trip_id = t.id) AS destination_count,
              (SELECT p.role::text FROM travel.trip_participants p
               WHERE p.trip_id = t.id AND p.user_id = $1 AND p.removed_at IS NULL
               LIMIT 1) AS caller_role
       FROM travel.trips t
       WHERE t.deleted_at IS NULL AND t.is_active AND ${ACESSO}
         AND ($2::uuid IS NULL OR t.id = $2)
         ${filtroSql}
       ORDER BY t.start_date ASC NULLS LAST, t.id`,
      [donoId, viagemId ?? null],
    );
    if (linhas.length === 0) return [];
    const destinos = await this.dados.query<LinhaDestino[]>(
      `SELECT d.id, d.trip_id, d.city_id, c.name AS city_name, d.custom_name,
              d.arrival_date::text AS arrival_date, d.departure_date::text AS departure_date, d.sort_order
       FROM travel.trip_destinations d
       LEFT JOIN geography.cities c ON c.id = d.city_id
       WHERE d.trip_id = ANY($1::uuid[])
       ORDER BY d.sort_order, d.id`,
      [linhas.map((linha) => linha.id)],
    );
    const porViagem = new Map<string, DestinoLido[]>();
    for (const destino of destinos) {
      const lista = porViagem.get(destino.trip_id) ?? [];
      lista.push({
        id: destino.id,
        cityId: destino.city_id,
        cityName: destino.city_name,
        customName: destino.custom_name,
        name: destino.city_name ?? destino.custom_name ?? '',
        arrivalDate: dataDe(destino.arrival_date),
        departureDate: dataDe(destino.departure_date),
        sortOrder: destino.sort_order,
      });
      porViagem.set(destino.trip_id, lista);
    }
    const participantes = await this.dados.query<LinhaParticipante[]>(
      `SELECT id, trip_id, user_id, display_name, party_kind::text AS party_kind, role::text AS role,
              (joined_at IS NOT NULL) AS joined
       FROM travel.trip_participants
       WHERE trip_id = ANY($1::uuid[]) AND removed_at IS NULL
       ORDER BY CASE WHEN role = 'owner' THEN 0 WHEN party_kind = 'child' THEN 2 ELSE 1 END, created_at, id`,
      [linhas.map((linha) => linha.id)],
    );
    const pessoas = new Map<string, ParticipanteLido[]>();
    for (const pessoa of participantes) {
      const lista = pessoas.get(pessoa.trip_id) ?? [];
      lista.push({
        id: pessoa.id,
        userId: pessoa.user_id,
        displayName: pessoa.display_name,
        partyKind: pessoa.party_kind,
        role: pessoa.role,
        joined: pessoa.joined,
      });
      pessoas.set(pessoa.trip_id, lista);
    }
    return linhas.map((linha) => ({
      id: linha.id,
      title: linha.title,
      description: linha.description,
      startDate: dataDe(linha.start_date),
      endDate: dataDe(linha.end_date),
      durationDays: linha.duration_days,
      dayCount: Number(linha.day_count),
      status: linha.status,
      daysUntil: linha.days_until === null ? null : Number(linha.days_until),
      visibility: linha.visibility,
      startMode: linha.start_mode,
      adultCount: linha.adult_count,
      childCount: linha.child_count,
      budgetAmount: linha.budget_amount === null ? null : Number(linha.budget_amount),
      budgetCurrency: linha.budget_currency?.trim() || null,
      hasCover: linha.has_cover,
      destinationCount: Number(linha.destination_count),
      destinations: porViagem.get(linha.id) ?? [],
      participants: pessoas.get(linha.id) ?? [],
      view: visaoDe(linha.caller_role ?? 'owner'),
    }));
  }
}

async function gravarParticipantes(
  tx: { query: DataSource['query'] },
  viagemId: string,
  donoId: string,
  nomeDoDono: string,
  adultos: number,
  criancas: number,
): Promise<void> {
  const usados = new Set([nomeDoDono.trim().toLowerCase()]);
  const proximo = (): string => {
    let numero = 1;
    while (usados.has(`viajante ${numero}`)) numero += 1;
    const nome = `Viajante ${numero}`;
    usados.add(nome.toLowerCase());
    return nome;
  };
  await tx.query(
    `INSERT INTO travel.trip_participants (trip_id, user_id, display_name, party_kind, role, joined_at, created_at)
     VALUES ($1, $2, $3, 'adult'::travel.party_kind, 'owner'::travel.participant_role, clock_timestamp(), clock_timestamp())`,
    [viagemId, donoId, nomeDoDono.trim() || proximo()],
  );
  for (let i = 1; i < adultos; i += 1) {
    await tx.query(
      `INSERT INTO travel.trip_participants (trip_id, display_name, party_kind, role, created_at)
       VALUES ($1, $2, 'adult'::travel.party_kind, 'supreme_traveler'::travel.participant_role, clock_timestamp())`,
      [viagemId, proximo()],
    );
  }
  for (let i = 0; i < criancas; i += 1) {
    await tx.query(
      `INSERT INTO travel.trip_participants (trip_id, display_name, party_kind, role, created_at)
       VALUES ($1, $2, 'child'::travel.party_kind, NULL, clock_timestamp())`,
      [viagemId, proximo()],
    );
  }
  await copiarMala(tx, viagemId);
}

async function copiarMala(tx: { query: DataSource['query'] }, viagemId: string, participanteId?: string): Promise<void> {
  await tx.query(
    `INSERT INTO organization.trip_packing_items (trip_id, participant_id, catalog_item_id, category_id, name)
     SELECT pessoa.trip_id, pessoa.id, item.id, item.category_id, item.name
     FROM travel.trip_participants pessoa
     JOIN organization.packing_catalog_items item ON item.is_default
     JOIN organization.packing_categories categoria ON categoria.id = item.category_id AND categoria.is_active
     WHERE pessoa.trip_id = $1
       AND ($2::uuid IS NULL OR pessoa.id = $2::uuid)
       AND NOT EXISTS (
         SELECT 1 FROM organization.trip_packing_items existente
         WHERE existente.participant_id = pessoa.id
           AND existente.catalog_item_id = item.id
           AND existente.deleted_at IS NULL
       )`,
    [viagemId, participanteId ?? null],
  );
}

async function copiarRoteiro(tx: { query: DataSource['query'] }, origemId: string, novoId: string, userId: string): Promise<void> {
  const roteiros = await tx.query<{ id: string; title: string | null; description: string | null }[]>(
    `SELECT id, title, description FROM itinerary.trip_itineraries
     WHERE trip_id = $1 AND is_active ORDER BY version DESC LIMIT 1`,
    [origemId],
  );
  if (roteiros.length === 0) return;
  const novos = await tx.query<{ id: string }[]>(
    `INSERT INTO itinerary.trip_itineraries (trip_id, version, title, description, is_active, created_by_user_id)
     VALUES ($1, 1, $2, $3, true, $4) RETURNING id`,
    [novoId, roteiros[0].title, roteiros[0].description, userId],
  );
  const roteiroNovo = novos[0].id;
  await tx.query(
    `INSERT INTO itinerary.itinerary_days (itinerary_id, trip_destination_id, day_number, date, title, notes, sort_order)
     SELECT $2, destino.id, dia.day_number, dia.date, dia.title, dia.notes, dia.sort_order
     FROM itinerary.itinerary_days dia
     LEFT JOIN travel.trip_destinations origem_destino ON origem_destino.id = dia.trip_destination_id
     LEFT JOIN travel.trip_destinations destino
       ON destino.trip_id = $3 AND destino.sort_order = origem_destino.sort_order
      AND destino.city_id IS NOT DISTINCT FROM origem_destino.city_id
      AND destino.custom_name IS NOT DISTINCT FROM origem_destino.custom_name
     WHERE dia.itinerary_id = $1`,
    [roteiros[0].id, roteiroNovo, novoId],
  );
  await tx.query(
    `INSERT INTO itinerary.itinerary_stops (
       itinerary_day_id, place_id, title, description, start_time, end_time, duration_minutes,
       estimated_cost, estimated_currency, sort_order, notes
     )
     SELECT dia_novo.id, parada.place_id, parada.title, parada.description, parada.start_time, parada.end_time,
            parada.duration_minutes, parada.estimated_cost, parada.estimated_currency, parada.sort_order, parada.notes
     FROM itinerary.itinerary_stops parada
     JOIN itinerary.itinerary_days dia_velho ON dia_velho.id = parada.itinerary_day_id
     JOIN itinerary.itinerary_days dia_novo ON dia_novo.itinerary_id = $2 AND dia_novo.day_number = dia_velho.day_number
     WHERE dia_velho.itinerary_id = $1`,
    [roteiros[0].id, roteiroNovo],
  );
  await tx.query(
    `INSERT INTO itinerary.itinerary_transfers (
       itinerary_day_id, from_stop_id, to_stop_id, transport_type, duration_seconds, distance_meters, geometry, provider_reference, notes
     )
     SELECT dia_novo.id, de_nova.id, para_nova.id, deslocamento.transport_type, deslocamento.duration_seconds,
            deslocamento.distance_meters, deslocamento.geometry, deslocamento.provider_reference, deslocamento.notes
     FROM itinerary.itinerary_transfers deslocamento
     JOIN itinerary.itinerary_days dia_velho ON dia_velho.id = deslocamento.itinerary_day_id
     JOIN itinerary.itinerary_days dia_novo ON dia_novo.itinerary_id = $2 AND dia_novo.day_number = dia_velho.day_number
     LEFT JOIN itinerary.itinerary_stops de_velha ON de_velha.id = deslocamento.from_stop_id
     LEFT JOIN itinerary.itinerary_stops de_nova ON de_nova.itinerary_day_id = dia_novo.id AND de_nova.sort_order = de_velha.sort_order
     LEFT JOIN itinerary.itinerary_stops para_velha ON para_velha.id = deslocamento.to_stop_id
     LEFT JOIN itinerary.itinerary_stops para_nova ON para_nova.itinerary_day_id = dia_novo.id AND para_nova.sort_order = para_velha.sort_order
     WHERE dia_velho.itinerary_id = $1`,
    [roteiros[0].id, roteiroNovo],
  );
  await tx.query(`UPDATE travel.trips SET source_itinerary_id = $2 WHERE id = $1`, [novoId, roteiroNovo]);
}

async function participanteAtivo(
  tx: { query: DataSource['query'] },
  viagemId: string,
  participanteId: string,
): Promise<{ role: Papel | null; party_kind: 'adult' | 'child'; user_id: string | null } | null> {
  const linhas = await tx.query<{ role: Papel | null; party_kind: 'adult' | 'child'; user_id: string | null }[]>(
    `SELECT role::text AS role, party_kind::text AS party_kind, user_id
     FROM travel.trip_participants
     WHERE id = $1 AND trip_id = $2 AND removed_at IS NULL`,
    [participanteId, viagemId],
  );
  return linhas[0] ?? null;
}

async function papelDe(
  tx: { query: DataSource['query'] },
  viagemId: string,
  userId: string,
  travar: boolean,
): Promise<Papel | 'ausente'> {
  const linhas = await tx.query<{ role: Papel | null }[]>(
    `SELECT p.role::text AS role
     FROM travel.trips t
     LEFT JOIN travel.trip_participants p ON p.trip_id = t.id AND p.user_id = $2 AND p.removed_at IS NULL
     WHERE t.id = $1 AND t.deleted_at IS NULL AND t.is_active
       AND (t.owner_user_id = $2 OR p.id IS NOT NULL)
     ${travar ? 'FOR UPDATE OF t' : ''}`,
    [viagemId, userId],
  );
  if (linhas.length === 0) return 'ausente';
  return linhas[0].role ?? 'owner';
}

function linhasDe<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? resultado[0] : (resultado as T[]);
}

function codigoDe(erro: unknown): string | undefined {
  return typeof erro === 'object' && erro !== null && 'code' in erro ? String((erro as { code: unknown }).code) : undefined;
}

interface LinhaConvite {
  id: string;
  trip_id: string;
  participant_id: string;
  status: string;
  invited_email: string;
  role: PapelDoConvite;
  title: string;
  caller_email: string;
}

class FalhaNaViagem extends Error {
  constructor(readonly falha: 'pessoa' | 'duplicado') {
    super(falha);
  }
}

async function gravarConvites(
  tx: { query: DataSource['query'] },
  viagemId: string,
  convidadoPor: string,
  nomeDeQuemConvida: string,
  titulo: string,
  convites: ConviteNovo[],
): Promise<ConviteParaEnviar[]> {
  const enviados: ConviteParaEnviar[] = [];
  const idiomaDeQuemConvida = await idiomaDe(tx, convidadoPor);
  for (const convite of convites) {
    const email = convite.email.trim().toLowerCase();
    const nome = nomeDoEmail(convite.email);
    const ocupado = await tx.query<{ id: string }[]>(
      `SELECT id FROM travel.trip_participants
       WHERE trip_id = $1 AND removed_at IS NULL AND lower(display_name) = lower($2)`,
      [viagemId, nome],
    );
    if (ocupado.length > 0) throw new FalhaNaViagem('duplicado');
    const pendente = await tx.query<{ id: string }[]>(
      `SELECT id FROM travel.trip_invitations
       WHERE trip_id = $1 AND lower(invited_email) = $2 AND status = 'pending'`,
      [viagemId, email],
    );
    if (pendente.length > 0) throw new FalhaNaViagem('pessoa');
    const contas = await tx.query<{ id: string; locale: IdiomaDoConvite }[]>(
      `SELECT u.id,
              CASE WHEN pref.locale IN ('pt-BR', 'pt-PT', 'en', 'es') THEN pref.locale ELSE 'pt-BR' END AS locale
       FROM identity.users u
       LEFT JOIN identity.user_preferences pref ON pref.user_id = u.id
       WHERE lower(u.email) = $1 AND u.deleted_at IS NULL`,
      [email],
    );
    const conta = contas[0];
    if (conta) {
      const jaEsta = await tx.query<{ id: string }[]>(
        `SELECT id FROM travel.trip_participants WHERE trip_id = $1 AND user_id = $2 AND removed_at IS NULL`,
        [viagemId, conta.id],
      );
      if (jaEsta.length > 0) throw new FalhaNaViagem('pessoa');
    }
    const pessoas = await tx.query<{ id: string }[]>(
      `INSERT INTO travel.trip_participants (trip_id, display_name, party_kind, role, created_at)
       VALUES ($1, $2, 'adult'::travel.party_kind, $3::travel.participant_role, clock_timestamp())
       RETURNING id`,
      [viagemId, nome, convite.role],
    );
    await copiarMala(tx, viagemId, pessoas[0].id);
    const convitesGravados = await tx.query<{ id: string }[]>(
      `INSERT INTO travel.trip_invitations (
         trip_id, participant_id, invited_by_user_id, invited_email, invited_user_id, channel, role
       ) VALUES (
         $1, $2, $3, $4, $5, 'email'::travel.invitation_channel, $6::travel.participant_role
       )
       RETURNING id`,
      [viagemId, pessoas[0].id, convidadoPor, email, conta?.id ?? null, convite.role],
    );
    const token = randomBytes(32).toString('base64url');
    await tx.query(`INSERT INTO travel.trip_invitation_tokens (invitation_id, token_hash) VALUES ($1, $2)`, [convitesGravados[0].id, hashDe(token)]);
    enviados.push({
      email,
      token,
      idioma: conta ? conta.locale : idiomaDeQuemConvida,
      nomeDeQuemConvida,
      titulo,
    });
  }
  return enviados;
}

async function idiomaDe(tx: { query: DataSource['query'] }, userId: string): Promise<IdiomaDoConvite> {
  const linhas = await tx.query<{ locale: string }[]>(`SELECT locale FROM identity.user_preferences WHERE user_id = $1`, [userId]);
  const locale = linhas[0]?.locale;
  if (locale === 'pt-BR' || locale === 'pt-PT' || locale === 'en' || locale === 'es') return locale;
  return 'pt-BR';
}

function nomeDoEmail(email: string): string {
  const limpo = email.trim();
  return limpo.slice(0, limpo.indexOf('@')).slice(0, 120);
}

function hashDe(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function abertoDe(convite: LinhaConvite): ConviteAberto {
  return { tripId: convite.trip_id, tripTitle: convite.title, role: convite.role, status: 'pending' };
}

function falhaDeConvite(erro: unknown): 'pessoa' | 'duplicado' {
  if (erro instanceof FalhaNaViagem) return erro.falha;
  if (codigoDe(erro) === '23505') return 'pessoa';
  throw erro;
}

function dataDe(valor: string | Date | null): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}
