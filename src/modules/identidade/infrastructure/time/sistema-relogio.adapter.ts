import { Injectable } from '@nestjs/common';
import { Relogio } from '../../domain/ports/relogio.port';

@Injectable()
export class SistemaRelogioAdapter implements Relogio {
  agora(): Date {
    return new Date();
  }
}
