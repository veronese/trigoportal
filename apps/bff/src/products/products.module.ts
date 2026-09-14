import { Module } from '@nestjs/common'
import { ProtheusDbModule } from '../protheus-db/protheus-db.module'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { ProductsDbSyncService } from './products-db-sync.service'
import { ProductsSyncService } from './products-sync.service'
import { ZwsProdutosClient } from './zws-produtos.client'

/**
 * Cadastro de produtos: espelho local + carga a partir do Protheus.
 *
 * ProtheusModule e global, por isso o ProtheusClient chega sem import aqui.
 */
@Module({
  // ProtheusDbModule nao e global: a carga por banco depende dele de forma
  // explicita, e quem le o modulo ve as duas fontes de produto de uma vez.
  imports: [ProtheusDbModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsSyncService, ProductsDbSyncService, ZwsProdutosClient],
  exports: [ProductsService],
})
export class ProductsModule {}
