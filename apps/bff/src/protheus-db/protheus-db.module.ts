import { Module } from '@nestjs/common'
import { ProtheusDbController } from './protheus-db.controller'
import { ProtheusDbService } from './protheus-db.service'

/**
 * Conexao direta com o banco do Protheus, em leitura.
 *
 * Separado do ProtheusModule de proposito: sao dois caminhos com falhas,
 * credenciais e limites diferentes. Juntar os dois faria uma indisponibilidade
 * do appserver parecer indisponibilidade do banco, e vice-versa.
 */
@Module({
  controllers: [ProtheusDbController],
  providers: [ProtheusDbService],
  exports: [ProtheusDbService],
})
export class ProtheusDbModule {}
