import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { HashDeSenha } from '../../domain/ports/hash-de-senha.port';

/** ARCHITECTURE.md §3 / ADR 0001: Argon2id, não bcrypt. */
@Injectable()
export class Argon2HashDeSenhaAdapter implements HashDeSenha {
  async gerar(senhaPlana: string): Promise<string> {
    return argon2.hash(senhaPlana, { type: argon2.argon2id });
  }
}
