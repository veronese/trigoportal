import { Global, Module } from '@nestjs/common'
import { ProtheusAuthService } from './protheus-auth.service'
import { ProtheusClient } from './protheus.client'
import { ProtheusConfigService } from './protheus-config.service'
import { ProtheusController } from './protheus.controller'

/**
 * Encapsula TODA a conversa com o Protheus. Nenhum outro modulo deve chamar o
 * ERP direto: quem precisa de dado do Protheus injeta o ProtheusClient.
 *
 * Global porque, a partir da fase 2, praticamente todo modulo de negocio vai
 * consumi-lo — e o token e compartilhado por processo, entao faz sentido um
 * unico ProtheusAuthService no injetor.
 */
@Global()
@Module({
  controllers: [ProtheusController],
  providers: [ProtheusConfigService, ProtheusAuthService, ProtheusClient],
  exports: [ProtheusClient, ProtheusConfigService, ProtheusAuthService],
})
export class ProtheusModule {}
