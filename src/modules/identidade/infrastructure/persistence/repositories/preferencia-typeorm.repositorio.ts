import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PreferenciaGravada } from '../../../domain/preferencia';
import { PreferenciaRepositorio } from '../../../domain/ports/preferencia-repositorio.port';
import { LocaleOficial } from '../../../domain/value-objects/idioma.vo';

interface LinhaPreferencia {
  user_id: string;
  follow_device_locale: boolean;
  locale: LocaleOficial;
  follow_device_currency: boolean;
  display_currency: string;
  timezone: string | null;
}

@Injectable()
export class PreferenciaTypeOrmRepositorio implements PreferenciaRepositorio {
  constructor(@Inject(DataSource) private readonly dados: DataSource) {}

  async buscar(userId: string): Promise<PreferenciaGravada> {
    await this.dados.query(`INSERT INTO identity.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [
      userId,
    ]);
    const linhas = await this.dados.query<LinhaPreferencia[]>(
      `SELECT user_id, follow_device_locale, locale, follow_device_currency, display_currency, timezone
       FROM identity.user_preferences WHERE user_id = $1`,
      [userId],
    );
    const linha = linhas[0];
    if (!linha) {
      throw new Error('preferência ausente');
    }
    return {
      userId: linha.user_id,
      segueIdioma: linha.follow_device_locale,
      idioma: linha.locale,
      segueMoeda: linha.follow_device_currency,
      moeda: linha.display_currency.trim(),
      fuso: linha.timezone,
    };
  }

  async salvar(preferencia: PreferenciaGravada): Promise<void> {
    await this.dados.query(
      `UPDATE identity.user_preferences
       SET follow_device_locale = $2,
           locale = $3,
           follow_device_currency = $4,
           display_currency = $5,
           timezone = $6,
           updated_at = now()
       WHERE user_id = $1`,
      [
        preferencia.userId,
        preferencia.segueIdioma,
        preferencia.idioma,
        preferencia.segueMoeda,
        preferencia.moeda,
        preferencia.fuso,
      ],
    );
  }

  async moedasDeExibicao(): Promise<Set<string>> {
    const linhas = await this.dados.query<{ code: string }[]>(
      `SELECT code FROM finance.currency_definitions WHERE is_display AND is_active`,
    );
    return new Set(linhas.map((linha) => linha.code.trim()));
  }
}
