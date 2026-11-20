import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Conta } from '../../domain/entities/conta.entity';
import { CONTA_REPOSITORIO, ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { HASH_DE_SENHA, HashDeSenha } from '../../domain/ports/hash-de-senha.port';
import { PERFIL_REPOSITORIO, PerfilRepositorio, UsernameEmUsoError } from '../../domain/ports/perfil-repositorio.port';
import { REMETENTE_DE_EMAIL, RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import { RELOGIO, Relogio } from '../../domain/ports/relogio.port';
import { CodigoVerificacao } from '../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Idioma } from '../../domain/value-objects/idioma.vo';
import { Senha } from '../../domain/value-objects/senha.vo';
import { Username } from '../../domain/value-objects/username.vo';

export const CODIGO_TTL_MINUTOS = Symbol('CODIGO_TTL_MINUTOS');

export interface CriarContaInput {
  nome: string;
  usuario: string;
  email: string;
  senhaPlana: string;
  idioma: string;
}

export interface CriarContaOutput {
  /**
   * Uso interno (log/teste) apenas. D-2 (042-sign-up-api): a camada de
   * interface NUNCA deve expor esse campo de forma que quem chama a API
   * consiga distinguir "e-mail já existe" de "deu certo".
   */
  contaCriada: boolean;
  /** Só em DEV quando o SMTP/HTTPS falhou — nunca em produção. */
  codigoDev?: string;
}

/** Caso de uso de `042-sign-up-api.md`. AC-1 e AC-6/D-2. */
@Injectable()
export class CriarContaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio,
    @Inject(PERFIL_REPOSITORIO) private readonly perfis: PerfilRepositorio,
    @Inject(HASH_DE_SENHA) private readonly hashDeSenha: HashDeSenha,
    @Inject(REMETENTE_DE_EMAIL) private readonly remetenteDeEmail: RemetenteDeEmail,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(CODIGO_TTL_MINUTOS) private readonly codigoTtlMinutos: number,
  ) {}

  async executar(input: CriarContaInput): Promise<CriarContaOutput> {
    const email = new Email(input.email);
    const usuario = new Username(input.usuario);
    const senha = new Senha(input.senhaPlana);
    const idioma = new Idioma(input.idioma);
    const agora = this.relogio.agora();

    const existente = await this.repositorio.buscarPorEmail(email);
    await this.garantirUsernameLivre(usuario.valor, existente?.id ?? null);

    if (existente) {
      // Conta já confirmada: mesma resposta genérica, sem e-mail (AC-6).
      if (existente.estado !== 'pendente') {
        return { contaCriada: false };
      }
      // Conta pendente (ex.: SMTP falhou antes): gera código novo e reenvia.
      const codigo = CodigoVerificacao.gerar(agora, this.codigoTtlMinutos);
      const reenvio = existente.tentarReenviar(codigo, agora);
      if (reenvio === 'cedo') {
        return { contaCriada: false };
      }
      const hashSenha = await this.hashDeSenha.gerar(senha.valor);
      existente.atualizarCadastroPendente({
        nome: input.nome,
        username: usuario.valor,
        hashSenha,
      });
      await this.repositorio.salvar(existente);
      const envio = await this.remetenteDeEmail.enviarCodigoDeVerificacao({
        paraEmail: email.valor,
        nome: existente.nome,
        codigo: codigo.valor,
        idioma,
      });
      return { contaCriada: false, codigoDev: envio.codigoDev };
    }

    const hashSenha = await this.hashDeSenha.gerar(senha.valor);
    const codigo = CodigoVerificacao.gerar(agora, this.codigoTtlMinutos);

    const conta = Conta.criarPendente({
      id: randomUUID(),
      nome: input.nome,
      email,
      username: usuario.valor,
      hashSenha,
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    await this.repositorio.salvar(conta);
    const envio = await this.remetenteDeEmail.enviarCodigoDeVerificacao({
      paraEmail: email.valor,
      nome: input.nome,
      codigo: codigo.valor,
      idioma,
    });

    return { contaCriada: true, codigoDev: envio.codigoDev };
  }

  private async garantirUsernameLivre(username: string, contaIdAtual: string | null): Promise<void> {
    const outro = await this.perfis.buscarPorUsername(username);
    if (outro && outro.userId !== contaIdAtual) {
      throw new UsernameEmUsoError();
    }
  }
}
