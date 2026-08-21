import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { ProductsSyncService } from './products-sync.service'
import { ZwsProdutosClient } from './zws-produtos.client'

/**
 * Cadastro de produtos: espelho local + carga a partir do Protheus.
 *
 * ProtheusModule e global, por isso o ProtheusClient chega sem import aqui.
 */
@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsSyncService, ZwsProdutosClient],
  exports: [ProductsService],
})
export class ProductsModule {}
