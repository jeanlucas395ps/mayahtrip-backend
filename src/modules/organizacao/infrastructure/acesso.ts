import { DataSource } from 'typeorm';
import { Papel } from '../../viagem/domain/ports/viagem.port';

export interface AcessoDaViagem {
  participantId: string;
  role: Papel;
  owner: boolean;
}

type Consulta = { query: DataSource['query'] };

export async function acessoDaViagem(tx: Consulta, viagemId: string, userId: string): Promise<AcessoDaViagem | 'ausente'> {
  const linhas = await tx.query<{ participant_id: string | null; role: Papel; owner: boolean }[]>(
    `SELECT pessoa.id AS participant_id, COALESCE(pessoa.role::text, 'owner') AS role, (t.owner_user_id = $2) AS owner
     FROM travel.trips t
     LEFT JOIN travel.trip_participants pessoa
       ON pessoa.trip_id = t.id AND pessoa.user_id = $2 AND pessoa.removed_at IS NULL
     WHERE t.id = $1 AND t.deleted_at IS NULL AND t.is_active
       AND (t.owner_user_id = $2 OR pessoa.id IS NOT NULL)
     LIMIT 1`,
    [viagemId, userId],
  );
  const linha = linhas[0];
  if (!linha?.participant_id) return 'ausente';
  return { participantId: linha.participant_id, role: linha.role, owner: linha.owner };
}
