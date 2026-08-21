import { BadRequestException, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { ProductListResponse, ProductSyncResult, PublicProduct } from '@trigo/core'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ProductsService } from './products.service'
import { ProductsSyncService } from './products-sync.service'

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly sync: ProductsSyncService,
  ) {}

  @Get()
  @RequirePermission('products:read')
  list(
    @Query('search') search?: string,
    @Query('empori') empori?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ProductListResponse> {
    return this.products.list({
      search,
      empori,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @Get(':id')
  @RequirePermission('products:read')
  get(@Param('id') id: string): Promise<PublicProduct> {
    return this.products.get(id)
  }


  /**
   * Dispara a carga a partir do Protheus.
   *
   * `empresa` e `filial` juntas carregam exatamente esse tenant. Sem elas, a
   * carga usa as empresas de PRODUTOS_EMPRESAS e busca a filial de cada uma em
   * `tp_companies` — nunca uma filial padrao.
   *
   * As duas andam em par: empresa sem filial nao identifica um tenant, e
   * completar a que falta por conta propria seria reintroduzir o padrao
   * silencioso pela porta dos fundos.
   *
   * 200 e nao 202: a carga roda no proprio request e o relatorio por empresa
   * volta na resposta. Quando o volume exigir execucao em segundo plano, isto
   * vira um job e a rota passa a devolver 202 com um id de acompanhamento.
   */
  @Post('sync')
  @HttpCode(200)
  @RequirePermission('products:sync')
  sincronizar(
    @Query('empresa') empresa?: string,
    @Query('filial') filial?: string,
    @Query('desdeData') desdeData?: string,
  ): Promise<ProductSyncResult> {
    const informado = { empresa: empresa?.trim() ?? '', filial: filial?.trim() ?? '' }
    const quantos = Number(informado.empresa !== '') + Number(informado.filial !== '')

    if (quantos === 1) {
      throw new BadRequestException(
        'Informe empresa e filial juntas, ou nenhuma das duas. Metade de um tenant nao identifica onde ler.',
      )
    }

    return this.sync.sincronizar({
      desdeData: desdeData?.trim() || undefined,
      tenants: quantos === 2 ? [informado] : undefined,
    })
  }
}
