import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { emailConfig } from '../../../../config/email.config';
import { signUpConfig } from '../../../../config/sign-up.config';
import {
  EnviarCodigoDeVerificacaoParams,
  EnviarConviteParams,
  RemetenteDeEmail,
  ResultadoEnvioCodigo,
} from '../../domain/ports/remetente-de-email.port';
import { obterI18nDeEmail } from './i18n';

/**
 * Envio transacional via HTTPS (api.resend.com).
 *
 * Use quando a rede local bloqueia SMTP (portas 465/587) — HTTPS na 443
 * costuma passar. Ativa com `RESEND_API_KEY` no .env.
 *
 * Domínio do `from` precisa estar verificado no Resend (ou use
 * `onboarding@resend.dev` só para testes na conta dona da chave).
 */
@Injectable()
export class ResendRemetenteDeEmailAdapter implements RemetenteDeEmail {
  private readonly logger = new Logger(ResendRemetenteDeEmailAdapter.name);

  constructor(
    @Inject(emailConfig.KEY) private readonly config: ConfigType<typeof emailConfig>,
    @Inject(signUpConfig.KEY) private readonly configCadastro: ConfigType<typeof signUpConfig>,
    private readonly apiKey: string,
  ) {}

  private get emDesenvolvimento(): boolean {
    return (process.env.NODE_ENV ?? 'development') !== 'production';
  }

  private async postEmail(payload: { from: string; to: string[]; subject: string; text: string }): Promise<void> {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new Error(`Resend HTTP ${resposta.status}: ${corpo}`);
    }
  }

  async enviarCodigoDeVerificacao(params: EnviarCodigoDeVerificacaoParams): Promise<ResultadoEnvioCodigo> {
    const i18n = await obterI18nDeEmail();
    const t = i18n.getFixedT(params.idioma.valor);
    const assunto = t('codigoVerificacao.assunto');
    const corpo = t('codigoVerificacao.corpo', {
      nome: params.nome,
      codigo: params.codigo,
      minutos: this.configCadastro.codeTtlMinutes,
    });

    try {
      await this.postEmail({
        from: this.config.from,
        to: [params.paraEmail],
        subject: assunto,
        text: corpo,
      });
      this.logger.log(`E-mail de código aceito pelo Resend para ${params.paraEmail}`);
      return { entregue: true };
    } catch (erro) {
      this.logger.error('Falha ao enviar e-mail via Resend', erro instanceof Error ? erro.stack : erro);
      if (this.emDesenvolvimento) {
        this.logger.warn(
          `[DEV] Resend indisponível — código para ${params.paraEmail}: ${params.codigo} (válido ~${this.configCadastro.codeTtlMinutes} min)`,
        );
        return { entregue: false, codigoDev: params.codigo };
      }
      throw erro;
    }
  }

  async enviarConvite(params: EnviarConviteParams): Promise<void> {
    const i18n = await obterI18nDeEmail();
    const t = i18n.getFixedT(params.idioma.valor);
    const base = this.config.publicAppUrl.replace(/\/$/, '');
    const link = base ? `${base}/convite/${params.token}` : `/convite/${params.token}`;
    try {
      await this.postEmail({
        from: this.config.from,
        to: [params.paraEmail],
        subject: t('convite.assunto', { nome: params.nomeDeQuemConvida }),
        text: t('convite.corpo', { nome: params.nomeDeQuemConvida, viagem: params.viagem, link }),
      });
    } catch (erro) {
      this.logger.error('Falha ao enviar convite via Resend', erro instanceof Error ? erro.stack : erro);
      if (this.emDesenvolvimento) {
        this.logger.warn(`[DEV] Convite não enviado (Resend indisponível) para ${params.paraEmail}`);
        return;
      }
      throw erro;
    }
  }
}
