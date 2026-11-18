import { Controller, Get, HttpException, HttpStatus, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CidadeAusenteError, GeografiaUseCase } from '../../application/geografia.use-case';
import { AccessTokenGuard } from '../../../identidade/interface/http/guards/access-token.guard';

@ApiTags('geography')
@Controller('geography')
@UseGuards(AccessTokenGuard)
export class GeografiaController {
  constructor(@Inject(GeografiaUseCase) private readonly geografia: GeografiaUseCase) {}

  @Get('destinations')
  destinos(@Query('q') q?: string, @Query('idioma') idioma?: string) {
    return this.geografia.destinos(q, idioma);
  }

  @Get('cities/:id')
  cidade(@Param('id') id: string, @Query('idioma') idioma?: string) {
    return executar(() => this.geografia.cidade(id, idioma));
  }

  @Get('countries')
  paises(@Query('idioma') idioma?: string) {
    return this.geografia.paises(idioma);
  }

  @Get('continents')
  continentes(@Query('idioma') idioma?: string) {
    return this.geografia.continentes(idioma);
  }
}

async function executar<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof CidadeAusenteError) {
      throw new HttpException({ message: 'Cidade não encontrada.' }, HttpStatus.NOT_FOUND);
    }
    throw erro;
  }
}
