import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { emailConfig } from '../../../../config/email.config';
import { signUpConfig } from '../../../../config/sign-up.config';
import { EnviarCodigoDeVerificacaoParams, EnviarConviteParams, RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import { obterI18nDeEmail } from './i18n';

/**
 * ARCHITECTURE.md §3: SMTP Hostinger. A API é quem fala com o SMTP — o
 * app/web nunca chamam este fornecedor direto (ARCHITECTURE.md §4).
 */
@Injectable()
export class SmtpRemetenteDeEmailAdapter implements RemetenteDeEmail {
  private readonly logger = new Logger(SmtpRemetenteDeEmailAdapter.name);
  private transportador: nodemailer.Transporter | null = null;

  constructor(
    @Inject(emailConfig.KEY) private readonly config: ConfigType<typeof emailConfig>,
    @Inject(signUpConfig.KEY) private readonly configCadastro: ConfigType<typeof signUpConfig>,
  ) {}

  private obterTransportador(): nodemailer.Transporter {
    if (!this.transportador) {
      this.transportador = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.port === 465,
        auth: this.config.user ? { user: this.config.user, pass: this.config.password } : undefined,
      });
    }

    return this.transportador;
  }

  async enviarCodigoDeVerificacao(params: EnviarCodigoDeVerificacaoParams): Promise<void> {
    const i18n = await obterI18nDeEmail();
    const t = i18n.getFixedT(params.idioma.valor);

    const assunto = t('codigoVerificacao.assunto');
    const corpo = t('codigoVerificacao.corpo', {
      nome: params.nome,
      codigo: params.codigo,
      minutos: this.configCadastro.codeTtlMinutes,
    });

    try {
      await this.obterTransportador().sendMail({
        from: this.config.from,
        to: params.paraEmail,
        subject: assunto,
        text: corpo,
      });
    } catch (erro) {
      // DEVELOPMENT.md §9/§11: log sem corpo de e-mail nem código; só o
      // fato de ter falhado, para a métrica de erro por fornecedor externo.
      this.logger.error('Falha ao enviar e-mail de código de verificação', erro instanceof Error ? erro.stack : erro);
      throw erro;
    }
  }

  async enviarConvite(params: EnviarConviteParams): Promise<void> {
    const i18n = await obterI18nDeEmail();
    const t = i18n.getFixedT(params.idioma.valor);
    const base = this.config.publicAppUrl.replace(/\/$/, '');
    const link = base ? `${base}/convite/${params.token}` : `/convite/${params.token}`;
    try {
      await this.obterTransportador().sendMail({
        from: this.config.from,
        to: params.paraEmail,
        subject: t('convite.assunto', { nome: params.nomeDeQuemConvida }),
        text: t('convite.corpo', { nome: params.nomeDeQuemConvida, viagem: params.viagem, link }),
      });
    } catch (erro) {
      this.logger.error('Falha ao enviar e-mail de convite', erro instanceof Error ? erro.stack : erro);
      throw erro;
    }
  }
}
