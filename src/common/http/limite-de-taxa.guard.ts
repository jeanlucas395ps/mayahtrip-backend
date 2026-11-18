import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * O ThrottlerGuard publicado pede o Reflector pelo pacote CommonJS.
 * A API é ESM, então o token não bate e o processo não sobe.
 * Este guard injeta o Reflector do mesmo módulo que o Nest registra.
 */
@Injectable()
export class LimiteDeTaxaGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }
}
