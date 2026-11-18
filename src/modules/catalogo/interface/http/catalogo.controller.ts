import { Controller, Get, HttpException, HttpStatus, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogoUseCase, LugarAusenteError } from '../../application/catalogo.use-case';
import { AccessTokenGuard } from '../../../identidade/interface/http/guards/access-token.guard';

@ApiTags('catalog')
@Controller('catalog/places')
@UseGuards(AccessTokenGuard)
export class CatalogoController {
  constructor(@Inject(CatalogoUseCase) private readonly catalogo: CatalogoUseCase) {}

  @Get()
  buscar(@Query('q') q?: string, @Query('idioma') idioma?: string) {
    return this.catalogo.buscar(q, idioma);
  }

  @Get(':id')
  lugar(@Param('id') id: string, @Query('idioma') idioma?: string) {
    return executar(() => this.catalogo.lugar(id, idioma));
  }
}

async function executar<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (erro instanceof LugarAusenteError) {
      throw new HttpException({ message: 'Lugar não encontrado.' }, HttpStatus.NOT_FOUND);
    }
    throw erro;
  }
}
