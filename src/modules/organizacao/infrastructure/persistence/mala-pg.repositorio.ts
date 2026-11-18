import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  FalhaMala,
  ItemMalaEditado,
  ItemMalaNovo,
  MalaDaPessoa,
  MalaRepositorio,
  MalasLidas,
} from '../../domain/mala.port';
import { acessoDaViagem } from '../acesso';

interface LinhaMala {
  participant_id: string;
  display_name: string;
  user_id: string | null;
  owner_user_id: string;
  item_id: string | null;
  category_id: string | null;
  category_name: string | null;
  name: string | null;
  quantity: number | null;
  is_packed: boolean | null;
  notes: string | null;
  viewer_id: string | null;
  viewer_name: string | null;
}

@Injectable()
export class MalaPgRepositorio implements MalaRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async listar(userId: string, viagemId: string): Promise<MalasLidas | 'ausente'> {
    if ((await acessoDaViagem(this.dados, viagemId, userId)) === 'ausente') return 'ausente';
    return this.montar(userId, viagemId);
  }

  async adicionar(userId: string, viagemId: string, participanteId: string, item: ItemMalaNovo): Promise<MalasLidas | FalhaMala> {
    const dono = await this.podeEditar(userId, viagemId, participanteId);
    if (dono !== 'ok') return dono;
    const grupos = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM organization.packing_categories WHERE is_active ORDER BY sort_order DESC, name DESC LIMIT 1`,
    );
    if (grupos.length === 0) return 'categoria';
    await this.dados.query(
      `INSERT INTO organization.trip_packing_items (trip_id, participant_id, category_id, name, quantity, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [viagemId, participanteId, grupos[0].id, item.name, item.quantity, item.notes],
    );
    return this.montar(userId, viagemId);
  }

  async editar(userId: string, viagemId: string, itemId: string, item: ItemMalaEditado): Promise<MalasLidas | FalhaMala> {
    const dono = await this.donoDoItem(userId, viagemId, itemId);
    if (dono !== 'ok') return dono;
    await this.dados.query(
      `UPDATE organization.trip_packing_items
       SET name = $3, quantity = $4, notes = $5, is_packed = $6, updated_at = clock_timestamp()
       WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
      [itemId, viagemId, item.name, item.quantity, item.notes, item.isPacked],
    );
    return this.montar(userId, viagemId);
  }

  async remover(userId: string, viagemId: string, itemId: string): Promise<MalasLidas | FalhaMala> {
    const dono = await this.donoDoItem(userId, viagemId, itemId);
    if (dono !== 'ok') return dono;
    await this.dados.query(
      `UPDATE organization.trip_packing_items SET deleted_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE id = $1 AND deleted_at IS NULL`,
      [itemId],
    );
    return this.montar(userId, viagemId);
  }

  async esvaziar(userId: string, viagemId: string, participanteId: string): Promise<MalasLidas | FalhaMala> {
    const dono = await this.podeEditar(userId, viagemId, participanteId);
    if (dono !== 'ok') return dono;
    await this.dados.query(
      `UPDATE organization.trip_packing_items
       SET deleted_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE trip_id = $1 AND participant_id = $2 AND deleted_at IS NULL`,
      [viagemId, participanteId],
    );
    return this.montar(userId, viagemId);
  }

  async definirVistantes(userId: string, viagemId: string, participanteId: string, vistantes: string[]): Promise<MalasLidas | FalhaMala> {
    const dono = await this.podeEditar(userId, viagemId, participanteId);
    if (dono !== 'ok') return dono;
    const unicos = [...new Set(vistantes)];
    if (unicos.includes(participanteId)) return 'pessoa';
    if (unicos.length > 0) {
      const pessoas = await this.dados.query<{ id: string }[]>(
        `SELECT id FROM travel.trip_participants
         WHERE trip_id = $1 AND removed_at IS NULL AND id = ANY($2::uuid[])`,
        [viagemId, unicos],
      );
      if (pessoas.length !== unicos.length) return 'pessoa';
    }
    await this.dados.transaction(async (tx) => {
      await tx.query(`DELETE FROM organization.packing_list_viewers WHERE owner_participant_id = $1`, [participanteId]);
      for (const vistante of unicos) {
        await tx.query(
          `INSERT INTO organization.packing_list_viewers (owner_participant_id, viewer_participant_id) VALUES ($1, $2)`,
          [participanteId, vistante],
        );
      }
    });
    return this.montar(userId, viagemId);
  }

  private async podeEditar(userId: string, viagemId: string, participanteId: string): Promise<'ok' | FalhaMala> {
    const acesso = await acessoDaViagem(this.dados, viagemId, userId);
    if (acesso === 'ausente') return 'ausente';
    const pessoas = await this.dados.query<{ user_id: string | null; owner_user_id: string }[]>(
      `SELECT pessoa.user_id, viagem.owner_user_id
       FROM travel.trip_participants pessoa
       JOIN travel.trips viagem ON viagem.id = pessoa.trip_id
       WHERE pessoa.id = $1 AND pessoa.trip_id = $2 AND pessoa.removed_at IS NULL
         AND viagem.deleted_at IS NULL AND viagem.is_active`,
      [participanteId, viagemId],
    );
    if (pessoas.length === 0) return 'sumido';
    const pessoa = pessoas[0];
    const edita = pessoa.user_id === userId || (pessoa.user_id === null && pessoa.owner_user_id === userId);
    return edita ? 'ok' : 'proibido';
  }

  private async donoDoItem(userId: string, viagemId: string, itemId: string): Promise<'ok' | FalhaMala> {
    const itens = await this.dados.query<{ participant_id: string }[]>(
      `SELECT participant_id FROM organization.trip_packing_items
       WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
      [itemId, viagemId],
    );
    if (itens.length === 0) return 'sumido';
    return this.podeEditar(userId, viagemId, itens[0].participant_id);
  }

  private async montar(userId: string, viagemId: string): Promise<MalasLidas> {
    const linhas = await this.dados.query<LinhaMala[]>(
      `SELECT pessoa.id AS participant_id, pessoa.display_name, pessoa.user_id, viagem.owner_user_id,
              item.id AS item_id, item.category_id, categoria.name AS category_name, item.name,
              item.quantity, item.is_packed, item.notes,
              vistante.id AS viewer_id, vistante.display_name AS viewer_name
       FROM travel.trip_participants pessoa
       JOIN travel.trips viagem ON viagem.id = pessoa.trip_id
       LEFT JOIN organization.trip_packing_items item
         ON item.participant_id = pessoa.id AND item.deleted_at IS NULL
       LEFT JOIN organization.packing_categories categoria ON categoria.id = item.category_id
       LEFT JOIN organization.packing_list_viewers visto ON visto.owner_participant_id = pessoa.id
       LEFT JOIN travel.trip_participants vistante
         ON vistante.id = visto.viewer_participant_id AND vistante.removed_at IS NULL
       WHERE pessoa.trip_id = $1 AND pessoa.removed_at IS NULL AND viagem.deleted_at IS NULL AND viagem.is_active
         AND (
           pessoa.user_id = $2
           OR (pessoa.user_id IS NULL AND viagem.owner_user_id = $2)
           OR EXISTS (
             SELECT 1 FROM organization.packing_list_viewers autorizacao
             JOIN travel.trip_participants quem ON quem.id = autorizacao.viewer_participant_id
             WHERE autorizacao.owner_participant_id = pessoa.id
               AND quem.user_id = $2 AND quem.removed_at IS NULL
           )
         )
       ORDER BY pessoa.created_at, pessoa.id, categoria.sort_order NULLS LAST, item.created_at NULLS LAST, item.id, vistante.id`,
      [viagemId, userId],
    );
    const malas = new Map<string, MalaDaPessoa>();
    for (const linha of linhas) {
      let mala = malas.get(linha.participant_id);
      if (!mala) {
        mala = {
          participantId: linha.participant_id,
          displayName: linha.display_name,
          mine: linha.user_id === userId,
          canEdit: linha.user_id === userId || (linha.user_id === null && linha.owner_user_id === userId),
          viewers: [],
          items: [],
        };
        malas.set(linha.participant_id, mala);
      }
      if (linha.item_id && linha.category_id && linha.category_name && linha.name && !mala.items.some((item) => item.id === linha.item_id)) {
        mala.items.push({
          id: linha.item_id,
          categoryId: linha.category_id,
          categoryName: linha.category_name,
          name: linha.name,
          quantity: Number(linha.quantity),
          isPacked: linha.is_packed === true,
          notes: linha.notes,
        });
      }
      if (linha.viewer_id && linha.viewer_name && !mala.viewers.some((vistante) => vistante.participantId === linha.viewer_id)) {
        mala.viewers.push({ participantId: linha.viewer_id, displayName: linha.viewer_name });
      }
    }
    return { bags: [...malas.values()] };
  }
}
