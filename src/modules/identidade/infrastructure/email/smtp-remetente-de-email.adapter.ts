import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
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
 * ARCHITECTURE.md §3: SMTP Hostinger via **nodemailer**.
 *
 * Em `NODE_ENV=development`, se o SMTP estiver inacessível (rede bloqueando
 * 465/587), registra o código no log e devolve `codigoDev` para o app
 * local — só para o time testar cadastro/recuperação.
 *
 * Tenta a porta configurada e, em ETIMEDOUT/ECONNECTION, a alternativa
 * 465 ↔ 587.
 */
@Injectable()
export class SmtpRemetenteDeEmailAdapter implements RemetenteDeEmail {
  private readonly logger = new Logger(SmtpRemetenteDeEmailAdapter.name);
  private transportador: nodemailer.Transporter | null = null;

  constructor(
    @Inject(emailConfig.KEY) private readonly config: ConfigType<typeof emailConfig>,
    @Inject(signUpConfig.KEY) private readonly configCadastro: ConfigType<typeof signUpConfig>,
  ) {}

  private opcoes(porta: number): SMTPTransport.Options {
    return {
      host: this.config.host,
      port: porta,
      secure: porta === 465,
      requireTLS: porta === 587,
      auth: this.config.user ? { user: this.config.user, pass: this.config.password } : undefined,
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
      family: 4,
      tls: { minVersion: 'TLSv1.2' },
    };
  }

  private invalidarTransportador(): void {
    this.transportador = null;
  }

  private async obterTransportador(): Promise<nodemailer.Transporter> {
    if (this.transportador) return this.transportador;

    if (!this.config.user || !this.config.password) {
      this.logger.warn('SMTP sem usuário/senha — e-mails não serão autenticados no servidor.');
    }

    const primaria = this.config.port || 465;
    const secundaria = primaria === 465 ? 587 : 465;
    const tentativas = [primaria, secundaria];

    let ultimoErro: unknown;
    for (const porta of tentativas) {
      const transportador = nodemailer.createTransport(this.opcoes(porta));
      try {
        await transportador.verify();
        this.logger.log(`SMTP ok em ${this.config.host}:${porta}`);
        this.transportador = transportador;
        return transportador;
      } catch (erro) {
        ultimoErro = erro;
        this.logger.warn(
          `SMTP verify falhou em ${this.config.host}:${porta} (${erro instanceof Error ? erro.message : 'erro'})`,
        );
      }
    }

    throw ultimoErro instanceof Error ? ultimoErro : new Error('SMTP indisponível');
  }

  private get emDesenvolvimento(): boolean {
    return (process.env.NODE_ENV ?? 'development') !== 'production';
  }

  private logFalha(contexto: string, erro: unknown): void {
    if (erro instanceof Error) {
      this.logger.error(`${contexto}: ${erro.message}\n${erro.stack ?? ''}`);
      const extra = erro as Error & { code?: string; command?: string; response?: string; responseCode?: number };
      this.logger.error(
        `${contexto} detalhe code=${extra.code ?? 'n/a'} command=${extra.command ?? 'n/a'} responseCode=${extra.responseCode ?? 'n/a'} response=${extra.response ?? 'n/a'}`,
      );
      return;
    }
    this.logger.error(contexto, erro);
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
      const info = await this.enviarComRetry({
        from: this.config.from,
        to: params.paraEmail,
        subject: assunto,
        text: corpo,
      });
      this.logger.log(
        `E-mail de código aceito pelo SMTP para ${params.paraEmail} (messageId=${info.messageId ?? 'n/a'})`,
      );
      return { entregue: true };
    } catch (erro) {
      this.logFalha('Falha ao enviar e-mail de código de verificação', erro);
      if (this.emDesenvolvimento) {
        this.logger.warn(
          `[DEV] SMTP indisponível — código para ${params.paraEmail}: ${params.codigo} (válido ~${this.configCadastro.codeTtlMinutes} min)`,
        );
        return { entregue: false, codigoDev: params.codigo };
      }
      throw erro;
    }
  }

  /** Uma retentativa com transportador novo quando a conexão cai (ETIMEDOUT). */
  private async enviarComRetry(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      const transportador = await this.obterTransportador();
      return await transportador.sendMail(mail);
    } catch (erro) {
      this.invalidarTransportador();
      const transportador = await this.obterTransportador();
      return await transportador.sendMail(mail);
    }
  }

  async enviarConvite(params: EnviarConviteParams): Promise<void> {
    const i18n = await obterI18nDeEmail();
    const t = i18n.getFixedT(params.idioma.valor);
    const base = this.config.publicAppUrl.replace(/\/$/, '');
    const link = base ? `${base}/convite/${params.token}` : `/convite/${params.token}`;
    try {
      await this.enviarComRetry({
        from: this.config.from,
        to: params.paraEmail,
        subject: t('convite.assunto', { nome: params.nomeDeQuemConvida }),
        text: t('convite.corpo', { nome: params.nomeDeQuemConvida, viagem: params.viagem, link }),
      });
    } catch (erro) {
      this.logFalha('Falha ao enviar e-mail de convite', erro);
      if (this.emDesenvolvimento) {
        this.logger.warn(`[DEV] Convite não enviado (SMTP indisponível) para ${params.paraEmail}`);
        return;
      }
      throw erro;
    }
  }
}
