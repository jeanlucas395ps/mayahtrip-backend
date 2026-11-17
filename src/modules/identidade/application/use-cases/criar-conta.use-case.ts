import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Conta } from '../../domain/entities/conta.entity';
import { CONTA_REPOSITORIO, ContaRepositorio } from '../../domain/ports/conta-repositorio.port';
import { HASH_DE_SENHA, HashDeSenha } from '../../domain/ports/hash-de-senha.port';
import { REMETENTE_DE_EMAIL, RemetenteDeEmail } from '../../domain/ports/remetente-de-email.port';
import { RELOGIO, Relogio } from '../../domain/ports/relogio.port';
import { CodigoVerificacao } from '../../domain/value-objects/codigo-verificacao.vo';
import { Email } from '../../domain/value-objects/email.vo';
import { Idioma } from '../../domain/value-objects/idioma.vo';
import { Senha } from '../../domain/value-objects/senha.vo';

export const CODIGO_TTL_MINUTOS = Symbol('CODIGO_TTL_MINUTOS');

export interface CriarContaInput {
  nome: string;
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
}

/** Caso de uso de `042-sign-up-api.md`. AC-1 e AC-6/D-2. */
@Injectable()
export class CriarContaUseCase {
  constructor(
    @Inject(CONTA_REPOSITORIO) private readonly repositorio: ContaRepositorio,
    @Inject(HASH_DE_SENHA) private readonly hashDeSenha: HashDeSenha,
    @Inject(REMETENTE_DE_EMAIL) private readonly remetenteDeEmail: RemetenteDeEmail,
    @Inject(RELOGIO) private readonly relogio: Relogio,
    @Inject(CODIGO_TTL_MINUTOS) private readonly codigoTtlMinutos: number,
  ) {}

  async executar(input: CriarContaInput): Promise<CriarContaOutput> {
    const email = new Email(input.email);
    const senha = new Senha(input.senhaPlana);
    const idioma = new Idioma(input.idioma);

    const jaExiste = await this.repositorio.existePorEmail(email);
    if (jaExiste) {
      return { contaCriada: false };
    }

    const hashSenha = await this.hashDeSenha.gerar(senha.valor);
    const agora = this.relogio.agora();
    const codigo = CodigoVerificacao.gerar(agora, this.codigoTtlMinutos);

    const conta = Conta.criarPendente({
      id: randomUUID(),
      nome: input.nome,
      email,
      hashSenha,
      codigoVerificacao: codigo,
      criadaEm: agora,
    });

    await this.repositorio.salvar(conta);
    await this.remetenteDeEmail.enviarCodigoDeVerificacao({
      paraEmail: email.valor,
      nome: input.nome,
      codigo: codigo.valor,
      idioma,
    });

    return { contaCriada: true };
  }
}
