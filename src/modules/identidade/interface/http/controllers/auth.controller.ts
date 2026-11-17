import { Body, Controller, HttpCode, HttpStatus, Inject, Post, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CriarContaUseCase } from '../../../application/use-cases/criar-conta.use-case';
import { CriarContaDto } from '../dto/criar-conta.dto';

interface RespostaCriarConta {
  mensagem: string;
}

/**
 * D-2 (042-sign-up-api.md): a resposta é sempre a mesma, exista ou não
 * conta com esse e-mail — quem chama a API não consegue distinguir os
 * dois casos pela resposta.
 */
const MENSAGEM_PADRAO =
  'Se o e-mail informado ainda não tiver conta, enviaremos um código de verificação para ele.';

@Controller('auth')
export class AuthController {
  constructor(@Inject(CriarContaUseCase) private readonly criarConta: CriarContaUseCase) {}

  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({
    default: {
      // D-3 (042-sign-up-api.md): valor proposto, configurável por env
      // porque ainda não foi confirmado pelo produto.
      limit: () => Number(process.env.SIGN_UP_RATE_LIMIT_PER_MINUTE ?? 5),
      ttl: 60_000,
    },
  })
  async criar(
    // `expectedType` explícito: `tsx`/esbuild (usado em `start:dev`) não
    // emite `emitDecoratorMetadata`, então o ValidationPipe global não
    // saberia o tipo do parâmetro sem esta pista — AC-2 a AC-5 dependem
    // da validação realmente rodar, não só em build de produção (tsc).
    @Body(new ValidationPipe({ expectedType: CriarContaDto, whitelist: true, forbidNonWhitelisted: true, transform: true }))
    dto: CriarContaDto,
  ): Promise<RespostaCriarConta> {
    await this.criarConta.executar({
      nome: dto.nome,
      email: dto.email,
      senhaPlana: dto.senha,
      idioma: dto.idioma ?? 'pt-BR',
    });

    return { mensagem: MENSAGEM_PADRAO };
  }
}
