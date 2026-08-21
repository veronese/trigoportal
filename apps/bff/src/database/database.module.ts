import { Module } from '@nestjs/common'
import { DatabaseController } from './database.controller'
import { DatabaseService } from './database.service'

/** Diagnostico do banco para o Configurador. Sem rota de escrita. */
@Module({
  controllers: [DatabaseController],
  providers: [DatabaseService],
  // Exportado para o modulo de diagnostico reaproveitar a checagem de conexao,
  // em vez de escrever uma segunda.
  exports: [DatabaseService],
})
export class DatabaseModule {}
