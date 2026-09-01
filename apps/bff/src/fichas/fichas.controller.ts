import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import {
  criarFichaSchema,
  decidirAprovacaoSchema,
  gerarVersaoSchema,
  promoverFaseSchema,
  type AvaliacaoPromocao,
  type CriarFichaInput,
  type DecidirAprovacaoInput,
  type FichaDetalhe,
  type FichaListaResponse,
  type GerarVersaoInput,
  type PastaFichas,
  type PromoverFaseInput,
  type SessionUser,
  type VersaoDetalhe,
} from '@trigo/core'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ZodBody } from '../common/zod-body.pipe'
import { FichasService } from './fichas.service'
import { VersoesService } from './versoes.service'

/**
 * Fichas Tecnicas de P&D.
 *
 * As permissoes sao separadas de proposito: ler uma ficha, congelar uma versao
 * e mudar a fase de desenvolvimento tem consequencias muito diferentes.
 */
@Controller('fichas')
export class FichasController {
  constructor(
    private readonly fichas: FichasService,
    private readonly versoes: VersoesService,
  ) {}

  /** Marcas com ficha. Primeiro nivel da navegacao. */
  @Get('pastas')
  @RequirePermission('fichas:read')
  pastas(): Promise<PastaFichas[]> {
    return this.fichas.marcas()
  }

  /** Linhas com ficha dentro de uma marca. */
  @Get('pastas/:restauranteId/linhas')
  @RequirePermission('fichas:read')
  linhas(@Param('restauranteId') restauranteId: string): Promise<PastaFichas[]> {
    return this.fichas.linhasDaMarca(restauranteId)
  }

  @Get()
  @RequirePermission('fichas:read')
  listar(
    @Query('restauranteId') restauranteId?: string,
    @Query('linhaId') linhaId?: string,
    @Query('busca') busca?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<FichaListaResponse> {
    return this.fichas.listar({
      restauranteId,
      linhaId,
      busca,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  /**
   * Rotas de versao vem ANTES de `:id`, senao `versoes` seria lido como id de
   * ficha e a resposta seria 404 sem explicacao.
   */
  @Get('versoes/:versaoId')
  @RequirePermission('fichas:read')
  versao(@Param('versaoId') versaoId: string): Promise<VersaoDetalhe> {
    return this.fichas.versao(versaoId)
  }

  @Get('fases/:faseId/promocao')
  @RequirePermission('fichas:read')
  avaliarPromocao(@Param('faseId') faseId: string): Promise<AvaliacaoPromocao> {
    return this.versoes.avaliarPromocao(faseId)
  }

  @Get(':id')
  @RequirePermission('fichas:read')
  detalhe(@Param('id') id: string): Promise<FichaDetalhe> {
    return this.fichas.detalhe(id)
  }

  /** Cria a ficha na bancada, com um rascunho vazio pronto para composicao. */
  @Post()
  @RequirePermission('fichas:write')
  criar(
    @Body(new ZodBody(criarFichaSchema)) dto: CriarFichaInput,
    @CurrentUser() user: SessionUser,
  ): Promise<{ fichaId: string; versaoId: string }> {
    return this.fichas.criar(dto, user.email)
  }

  /**
   * GERAR VERSAO: congela o rascunho e abre um novo a partir dele.
   *
   * 200 e nao 201: a versao ja existia como rascunho — o que a chamada faz e
   * congelar, nao criar. O rascunho novo vem no corpo da resposta.
   */
  @Post('versoes/:versaoId/gerar')
  @HttpCode(200)
  @RequirePermission('fichas:versionar')
  gerar(
    @Param('versaoId') versaoId: string,
    @Body(new ZodBody(gerarVersaoSchema)) dto: GerarVersaoInput,
    @CurrentUser() user: SessionUser,
  ): Promise<{ versaoId: string; novoRascunhoId: string }> {
    return this.versoes.gerar(versaoId, dto, user.email)
  }

  @Post('fases/:faseId/promover')
  @RequirePermission('fichas:promover')
  promover(
    @Param('faseId') faseId: string,
    @Body(new ZodBody(promoverFaseSchema)) dto: PromoverFaseInput,
    @CurrentUser() user: SessionUser,
  ): Promise<{ faseId: string; versaoId: string }> {
    return this.versoes.promover(faseId, dto, user.email)
  }

  @Post('versoes/:versaoId/aprovacoes/:area')
  @HttpCode(200)
  @RequirePermission('fichas:aprovar')
  decidir(
    @Param('versaoId') versaoId: string,
    @Param('area') area: string,
    @Body(new ZodBody(decidirAprovacaoSchema)) dto: DecidirAprovacaoInput,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.versoes.decidir(versaoId, area, dto, user.email)
  }
}
