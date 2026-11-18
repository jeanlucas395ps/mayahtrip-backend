import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { AvisoLido, NotificacaoUseCase } from '../../application/notificacao.use-case';

class TokenDto {
  @IsIn(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  pushToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;
}

@ApiTags('notifications')
@Controller()
@UseGuards(AccessTokenGuard)
export class NotificacaoController {
  constructor(@Inject(NotificacaoUseCase) private readonly avisos: NotificacaoUseCase) {}

  @Get('notifications')
  listar(@Req() request: RequestComConta): Promise<AvisoLido[]> {
    return this.avisos.listar(request.contaId);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async ler(@Req() request: RequestComConta): Promise<void> {
    await this.avisos.marcarLidas(request.contaId);
  }

  @Post('devices/push-token')
  @HttpCode(HttpStatus.CREATED)
  async token(@Req() request: RequestComConta, @Body(corpo(TokenDto)) dto: TokenDto): Promise<{ id: string }> {
    if (dto.pushToken.includes(' ') || dto.pushToken.startsWith('Bearer ')) {
      throw new HttpException({ message: 'Token inválido.' }, HttpStatus.BAD_REQUEST);
    }
    const gravado = await this.avisos.registrarToken(request.contaId, dto.platform, dto.pushToken, dto.deviceId ?? null);
    return { id: gravado.id };
  }
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
