import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import type {
  ColunaBanco,
  ConsultaSqlResult,
  ProtheusDbConfig,
  ProtheusDbTestResult,
  SessionUser,
  TabelaBanco,
} from '@trigo/core'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ZodBody } from '../common/zod-body.pipe'
import { ProtheusDbService } from './protheus-db.service'

const consultaSchema = z.object({
  sql: z.string().trim().min(1, 'Escreva uma consulta').max(20000, 'Consulta longa demais'),
  /**
   * Teto de linhas. Existe para a tela nao receber um resultado que o navegador
   * nao aguenta — consulta sem WHERE numa tabela de movimento do ERP devolve
   * milhoes de linhas.
   */
  limite: z.number().int().min(1).max(10000).optional(),
})
type ConsultaInput = z.infer<typeof consultaSchema>

@Controller('protheus-db')
export class ProtheusDbController {
  constructor(private readonly db: ProtheusDbService) {}

  /** O que esta configurado. Nunca devolve a senha, so se ela existe. */
  @Get('config')
  @RequirePermission('settings:read')
  config(): Promise<ProtheusDbConfig> {
    return this.db.config()
  }

  /**
   * Abre a conexao de verdade e conta o que encontrou.
   *
   * Exige settings:write porque abre sessao no banco do ERP em producao — nao e
   * leitura inocente que qualquer perfil deva disparar.
   */
  @Post('testar')
  @HttpCode(200)
  @RequirePermission('settings:write')
  testar(): Promise<ProtheusDbTestResult> {
    return this.db.testar()
  }

  @Get('tabelas')
  @RequirePermission('protheusdb:consultar')
  tabelas(@Query('busca') busca?: string): Promise<TabelaBanco[]> {
    return this.db.listarTabelas(busca)
  }

  @Get('tabelas/:nome/colunas')
  @RequirePermission('protheusdb:consultar')
  colunas(@Param('nome') nome: string): Promise<ColunaBanco[]> {
    return this.db.descreverTabela(nome)
  }

  /**
   * Executa a consulta escrita no console.
   *
   * POST e nao GET, apesar de ser leitura: o SQL vai no corpo. Em query string
   * ele apareceria no log do servidor e no historico do navegador, e consulta
   * ao ERP pode conter codigo de cliente, valor e nome.
   */
  @Post('consultar')
  @HttpCode(200)
  @RequirePermission('protheusdb:consultar')
  consultar(
    @Body(new ZodBody(consultaSchema)) dto: ConsultaInput,
    @CurrentUser() user: SessionUser,
  ): Promise<ConsultaSqlResult> {
    return this.db.consultar(dto.sql, dto.limite ?? 500, user.email)
  }
}
