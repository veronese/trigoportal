import { Controller, Get, HttpCode, Post } from '@nestjs/common'
import type { ProtheusDbConfig, ProtheusDbTestResult } from '@trigo/core'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ProtheusDbService } from './protheus-db.service'

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
   * leitura inocente que qualquer perfil deva disparar. Mesmo criterio do teste
   * de conexao do REST.
   */
  @Post('testar')
  @HttpCode(200)
  @RequirePermission('settings:write')
  testar(): Promise<ProtheusDbTestResult> {
    return this.db.testar()
  }
}
