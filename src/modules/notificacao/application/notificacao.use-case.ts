import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventoDeAviso } from '../domain/modelos';

export interface AvisoLido {
  id: string;
  eventType: string;
  title: string;
  message: string | null;
  read: boolean;
  createdAt: string;
}

@Injectable()
export class NotificacaoUseCase {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async publicar(userId: string, evento: EventoDeAviso, vars: Record<string, string>, payload: Record<string, string> = {}): Promise<void> {
    const locais = await this.dados.query<{ locale: string }[]>(
      `SELECT locale FROM identity.user_preferences WHERE user_id = $1`,
      [userId],
    );
    const locale = locais[0]?.locale ?? 'pt-BR';
    const modelos = await this.dados.query<{ title_template: string; body_template: string }[]>(
      `SELECT title_template, body_template
       FROM notification.notification_templates
       WHERE event_type = $1 AND locale = $2 AND channel = 'in_app' AND is_active
       LIMIT 1`,
      [evento, locale],
    );
    const modelo = modelos[0] ?? (await this.modeloPadrao(evento));
    if (!modelo) return;
    const title = preencher(modelo.title_template, vars);
    const message = preencher(modelo.body_template, vars);
    const criadas = await this.dados.query<{ id: string }[]>(
      `INSERT INTO notification.notifications (user_id, event_type, title, message, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [userId, evento, title, message, JSON.stringify(payload)],
    );
    const id = criadas[0].id;
    await this.dados.query(
      `INSERT INTO notification.notification_deliveries (notification_id, channel, status, sent_at)
       VALUES ($1, 'in_app', 'sent', clock_timestamp())`,
      [id],
    );
    await this.dados.query(
      `INSERT INTO notification.notification_deliveries (notification_id, channel, status, error_message)
       VALUES ($1, 'push', 'pending', 'A credencial do Firebase FCM ainda não está no ambiente.')`,
      [id],
    );
    await this.dados.query(
      `INSERT INTO notification.notification_events (notification_id, event_type, detail)
       VALUES ($1, 'created', $2::jsonb)`,
      [id, JSON.stringify({ locale, channel: 'in_app' })],
    );
  }

  async listar(userId: string): Promise<AvisoLido[]> {
    const linhas = await this.dados.query<{ id: string; event_type: string; title: string; message: string | null; read_at: Date | null; created_at: Date }[]>(
      `SELECT id, event_type, title, message, read_at, created_at
       FROM notification.notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );
    return linhas.map((linha) => ({
      id: linha.id,
      eventType: linha.event_type,
      title: linha.title,
      message: linha.message,
      read: linha.read_at !== null,
      createdAt: new Date(linha.created_at).toISOString(),
    }));
  }

  async marcarLidas(userId: string): Promise<void> {
    const linhas = await this.dados.query<{ id: string }[] | [{ id: string }[], number]>(
      `UPDATE notification.notifications
       SET read_at = clock_timestamp()
       WHERE user_id = $1 AND read_at IS NULL
       RETURNING id`,
      [userId],
    );
    const ids = linhasRetornadas<{ id: string }>(linhas);
    for (const linha of ids) {
      await this.dados.query(
        `INSERT INTO notification.notification_events (notification_id, event_type) VALUES ($1, 'read')`,
        [linha.id],
      );
    }
  }

  async registrarToken(userId: string, platform: string, pushToken: string, deviceId: string | null): Promise<{ id: string }> {
    const existentes = await this.dados.query<{ id: string }[]>(
      `SELECT id FROM notification.device_push_tokens WHERE user_id = $1 AND push_token = $2`,
      [userId, pushToken],
    );
    if (existentes.length > 0) {
      await this.dados.query(
        `UPDATE notification.device_push_tokens SET is_active = true, last_used_at = clock_timestamp(), platform = $2, device_id = $3 WHERE id = $1`,
        [existentes[0].id, platform, deviceId],
      );
      return { id: existentes[0].id };
    }
    const criados = await this.dados.query<{ id: string }[]>(
      `INSERT INTO notification.device_push_tokens (user_id, device_id, platform, push_token, is_active, last_used_at)
       VALUES ($1, $2, $3, $4, true, clock_timestamp())
       RETURNING id`,
      [userId, deviceId, platform, pushToken],
    );
    return { id: criados[0].id };
  }

  private async modeloPadrao(evento: string): Promise<{ title_template: string; body_template: string } | null> {
    const linhas = await this.dados.query<{ title_template: string; body_template: string }[]>(
      `SELECT title_template, body_template
       FROM notification.notification_templates
       WHERE event_type = $1 AND locale = 'pt-BR' AND channel = 'in_app' AND is_active
       LIMIT 1`,
      [evento],
    );
    return linhas[0] ?? null;
  }
}

function linhasRetornadas<T>(resultado: T[] | [T[], number]): T[] {
  return Array.isArray(resultado[0]) ? (resultado[0] as T[]) : (resultado as T[]);
}

function preencher(modelo: string, vars: Record<string, string>): string {
  return modelo.replace(/\{([a-z]+)\}/g, (_tudo, chave: string) => vars[chave] ?? '');
}
