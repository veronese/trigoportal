import { Controller, Get, HttpCode, Post } from '@nestjs/common'
import type { ProtheusStatus, ProtheusTestResult } from '@trigo/core'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ProtheusAuthService } from './protheus-auth.service'
import { ProtheusConfigService } from './protheus-config.service'

@Controller('protheus')
export class ProtheusController {
  constructor(
    private readonly configService: ProtheusConfigService,
    private readonly auth: ProtheusAuthService,
  ) {}

  /** O que esta configurado hoje. Nunca devolve a senha, so se ela existe. */
  @Get('status')
  @RequirePermission('settings:read')
  async status(): Promise<ProtheusStatus> {
    const resumo = await this.configService.summary()
    return {
      configurado: resumo.configurado,
      baseUrl: resumo.baseUrl,
      usuario: resumo.usuario,
      timeoutSegundos: resumo.timeoutSegundos,
      senhaConfigurada: resumo.senhaConfigurada,
    }
  }

  /**
   * Exercita a credencial de verdade contra o appserver.
   *
   * Exige settings:write porque consome uma sessao/licenca no Protheus a cada
   * chamada — nao e uma leitura inocente que qualquer perfil deva disparar.
   */
  @Post('test-connection')
  @HttpCode(200)
  @RequirePermission('settings:write')
  async testConnection(): Promise<ProtheusTestResult> {
    const inicio = Date.now()
    const resultado = await this.auth.testCredentials()
    const duracaoMs = Date.now() - inicio

    if (resultado.ok) {
      return {
        ok: true,
        detalhe: 'Autenticacao aceita pelo Protheus.',
        tokenValidoPorSegundos: resultado.expiresInSeconds,
        duracaoMs,
      }
    }

    return { ok: false, detalhe: resultado.detail, tokenValidoPorSegundos: null, duracaoMs }
  }
}
