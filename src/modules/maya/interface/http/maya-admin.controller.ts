import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SessaoAdminUseCase } from '../../../admin/application/sessao-admin.use-case';
import { AdminGuard, RequestComAdmin } from '../../../admin/interface/http/guards/admin.guard';
import { Agente, AgenteNovo, MayaUseCase } from '../../application/maya.use-case';

class AgenteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  modelName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(['GPT-4', 'GPT-5'])
  family!: 'GPT-4' | 'GPT-5';

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  conversationType!: string;

  @IsInt()
  @Min(1)
  @Max(32000)
  maxTokens!: number;

  @IsNumber()
  @Min(0)
  @Max(2)
  temperature!: number;

  @IsString()
  @MaxLength(4000)
  prompts!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  sortOrder!: number;
}

class SandboxDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;
}

@ApiTags('admin')
@Controller('admin/maya/models')
@UseGuards(AdminGuard)
export class MayaAdminController {
  constructor(
    @Inject(MayaUseCase) private readonly maya: MayaUseCase,
    @Inject(SessaoAdminUseCase) private readonly sessoes: SessaoAdminUseCase,
  ) {}

  @Get()
  listar(): Promise<Agente[]> {
    return this.maya.listarAgentes();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(@Req() request: RequestComAdmin, @Body(corpo(AgenteDto)) dto: AgenteDto): Promise<Agente> {
    const agente = await this.maya.criarAgente(entradaDe(dto));
    await this.auditar(request, 'maya.model.create', agente.id);
    return agente;
  }

  @Post('defaults')
  async padrao(@Req() request: RequestComAdmin): Promise<Agente[]> {
    const lista = await this.maya.criarPadrao();
    await this.auditar(request, 'maya.model.defaults', lista[0]?.id ?? request.adminId);
    return lista;
  }

  @Patch(':id')
  async editar(@Req() request: RequestComAdmin, @Param('id') id: string, @Body(corpo(AgenteDto)) dto: AgenteDto): Promise<Agente> {
    const agente = await this.maya.editarAgente(id, entradaDe(dto));
    if (agente === 'ausente') throw new HttpException({ message: 'Agente não encontrado.' }, HttpStatus.NOT_FOUND);
    await this.auditar(request, 'maya.model.update', id);
    return agente;
  }

  @Post(':id/activate')
  async ativar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<Agente> {
    return this.ligar(request, id, true);
  }

  @Post(':id/deactivate')
  async desativar(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<Agente> {
    return this.ligar(request, id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluir(@Req() request: RequestComAdmin, @Param('id') id: string): Promise<void> {
    const resultado = await this.maya.excluirAgente(id);
    if (resultado !== 'ok') throw new HttpException({ message: 'Agente não encontrado.' }, HttpStatus.NOT_FOUND);
    await this.auditar(request, 'maya.model.delete', id);
  }

  @Post(':id/sandbox')
  async sandbox(@Param('id') id: string, @Body(corpo(SandboxDto)) dto: SandboxDto): Promise<{ answer: string }> {
    const resposta = await this.maya.sandbox(id, dto.question.trim());
    if (resposta === 'ausente') throw new HttpException({ message: 'Agente não encontrado.' }, HttpStatus.NOT_FOUND);
    return resposta;
  }

  private async ligar(request: RequestComAdmin, id: string, ativo: boolean): Promise<Agente> {
    const agente = await this.maya.definirAtivo(id, ativo);
    if (agente === 'ausente') throw new HttpException({ message: 'Agente não encontrado.' }, HttpStatus.NOT_FOUND);
    await this.auditar(request, ativo ? 'maya.model.activate' : 'maya.model.deactivate', id);
    return agente;
  }

  private auditar(request: RequestComAdmin, action: string, id: string): Promise<void> {
    return this.sessoes.auditar({ adminId: request.adminId, action, entityType: 'maya_model_config', entityId: id, oldValues: null, newValues: { action }, ip: null });
  }
}

function entradaDe(dto: AgenteDto): AgenteNovo {
  return { ...dto, prompts: dto.prompts.trim() };
}

function corpo<T>(tipo: new () => T): ValidationPipe {
  return new ValidationPipe({ expectedType: tipo, whitelist: true, transform: true, forbidNonWhitelisted: true });
}
