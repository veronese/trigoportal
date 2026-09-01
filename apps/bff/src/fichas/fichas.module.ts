import { Module } from '@nestjs/common'
import { FichasController } from './fichas.controller'
import { FichasService } from './fichas.service'
import { VersoesService } from './versoes.service'

/**
 * Fichas Tecnicas de P&D: bancada, batida teste e FT Producao.
 *
 * O motor de calculo NAO mora aqui: fica em @trigo/core, sem I/O, para a tela
 * mostrar o mesmo numero que a API grava e para o teste de regressao poder
 * compara-lo com a ficha de referencia.
 */
@Module({
  controllers: [FichasController],
  providers: [FichasService, VersoesService],
  exports: [FichasService],
})
export class FichasModule {}
