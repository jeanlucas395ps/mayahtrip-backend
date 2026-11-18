import {
  Body,
  Controller,
  Get,
  Patch,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, RequestComConta } from '../../../identidade/interface/http/guards/access-token.guard';
import { ViagemUseCase } from '../../application/viagem.use-case';
import { Carteira, ConviteAberto, FalhaViagem, ViagemLida } from '../../domain/ports/viagem.port';
import { ConviteDto, CriarViagemDto, RenomearParticipanteDto, TokenDeConviteDto } from './dto/viagem.dto';

const LIMITE_MULTER = 10 * 1024 * 1024;

@ApiTags('trips')
@Controller('trips')
@UseGuards(AccessTokenGuard)
export class ViagemController {
  constructor(@Inject(ViagemUseCase) private readonly viagens: ViagemUseCase) {}

  @Get()
  async carteira(@Req() request: RequestComConta, @Query('filtro') filtro?: string): Promise<Carteira> {
    const carteira = await this.viagens.carteira(request.contaId, filtro);
    if (carteira === 'filtro') throw new HttpException({ message: 'Filtro inválido.' }, HttpStatus.BAD_REQUEST);
    return carteira;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(@Req() request: RequestComConta, @Body(corpo(CriarViagemDto)) dto: CriarViagemDto): Promise<ViagemLida> {
    return responder(this.viagens.criar(request.contaId, dto));
  }

  @Post(':id/invitations')
  @HttpCode(HttpStatus.CREATED)
  async convidar(@Req() request: RequestComConta, @Param('id') id: string, @Body(corpo(ConviteDto)) dto: ConviteDto): Promise<ViagemLida> {
    return responder(this.viagens.convidar(request.contaId, id, [dto]));
  }

  @Get(':id/cover')
  async capa(@Req() request: RequestComConta, @Param('id') id: string): Promise<StreamableFile> {
    const arquivo = await this.viagens.capa(request.contaId, id);
    if (arquivo === 'ausente') throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
    if (arquivo === 'capa') throw new HttpException({ message: 'A viagem não tem capa.' }, HttpStatus.NOT_FOUND);
    return new StreamableFile(arquivo.bytes, { type: arquivo.mime });
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_MULTER } }))
  async guardarCapa(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @UploadedFile() arquivo: { buffer?: Buffer; mimetype?: string } | undefined,
  ): Promise<ViagemLida> {
    if (!arquivo?.buffer || !arquivo.mimetype) {
      throw new HttpException({ message: 'Envie uma imagem JPG, PNG ou WebP.' }, HttpStatus.BAD_REQUEST);
    }
    return responder(this.viagens.guardarCapa(request.contaId, id, arquivo.buffer, arquivo.mimetype));
  }

  @Patch(':id/participants/:participantId')
  async renomear(
    @Req() request: RequestComConta,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body(corpo(RenomearParticipanteDto)) dto: RenomearParticipanteDto,
  ): Promise<ViagemLida> {
    return responder(this.viagens.renomear(request.contaId, id, participantId, dto.displayName));
  }

  @Get(':id')
  async ficha(@Req() request: RequestComConta, @Param('id') id: string): Promise<ViagemLida> {
    const ficha = await this.viagens.ficha(request.contaId, id);
    if (!ficha) throw new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
    return ficha;
  }
}

@ApiTags('invitations')
@Controller('invitations')
@UseGuards(AccessTokenGuard)
export class ConviteController {
  constructor(@Inject(ViagemUseCase) private readonly viagens: ViagemUseCase) {}

  @Post('open')
  async abrir(@Req() request: RequestComConta, @Body(corpo(TokenDeConviteDto)) dto: TokenDeConviteDto): Promise<ConviteAberto> {
    const aberto = await this.viagens.abrirConvite(request.contaId, dto.token);
    if (typeof aberto === 'string') throw httpDe(aberto);
    return aberto;
  }

  @Post('accept')
  async aceitar(@Req() request: RequestComConta, @Body(corpo(TokenDeConviteDto)) dto: TokenDeConviteDto): Promise<ViagemLida> {
    return responder(this.viagens.aceitarConvite(request.contaId, dto.token));
  }

  @Post('decline')
  async recusar(@Req() request: RequestComConta, @Body(corpo(TokenDeConviteDto)) dto: TokenDeConviteDto): Promise<{ status: 'declined' }> {
    const resultado = await this.viagens.recusarConvite(request.contaId, dto.token);
    if (resultado !== 'ok') throw httpDe(resultado);
    return { status: 'declined' };
  }
}

async function responder(pedido: Promise<ViagemLida | FalhaViagem>): Promise<ViagemLida> {
  const resultado = await pedido;
  if (typeof resultado === 'string') throw httpDe(resultado);
  return resultado;
}

function httpDe(falha: FalhaViagem): HttpException {
  if (falha === 'ausente') return new HttpException({ message: 'Viagem não encontrada.' }, HttpStatus.NOT_FOUND);
  if (falha === 'cidade') return new HttpException({ message: 'Cidade não encontrada.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'destino') return new HttpException({ message: 'Escolha ao menos um destino.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'data') {
    return new HttpException({ message: 'Informe a ida e a volta, a partir de hoje, ou só a duração.' }, HttpStatus.BAD_REQUEST);
  }
  if (falha === 'dias') return new HttpException({ message: 'A viagem passa do teto de dias.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'modo') return new HttpException({ message: 'Viagens com mais de 14 dias começam do zero.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'moeda') return new HttpException({ message: 'Escolha uma moeda ativa.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'orcamento') return new HttpException({ message: 'Informe o valor e a moeda do orçamento.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'nome') return new HttpException({ message: 'O nome da viagem passou de 255 caracteres.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'capa') return new HttpException({ message: 'Envie uma imagem JPG, PNG ou WebP.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'proibido') return new HttpException({ message: 'Você não pode editar esta viagem.' }, HttpStatus.FORBIDDEN);
  if (falha === 'duplicado') return new HttpException({ message: 'Já existe alguém com esse nome nesta viagem.' }, HttpStatus.CONFLICT);
  if (falha === 'email') return new HttpException({ message: 'Digite um e-mail válido.' }, HttpStatus.BAD_REQUEST);
  if (falha === 'pessoa') return new HttpException({ message: 'Essa pessoa já está nesta viagem.' }, HttpStatus.CONFLICT);
  if (falha === 'semConvite') return new HttpException({ message: 'Você não pode convidar para esta viagem.' }, HttpStatus.FORBIDDEN);
  if (falha === 'convite') return new HttpException({ message: 'Convite não encontrado.' }, HttpStatus.NOT_FOUND);
  if (falha === 'alheio') return new HttpException({ message: 'Este convite é de outra pessoa.' }, HttpStatus.FORBIDDEN);
  if (falha === 'usado') return new HttpException({ message: 'Este convite já foi usado.' }, HttpStatus.CONFLICT);
  return new HttpException({ message: 'A configuração da viagem não está disponível.' }, HttpStatus.INTERNAL_SERVER_ERROR);
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({
    expectedType: tipo,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}
