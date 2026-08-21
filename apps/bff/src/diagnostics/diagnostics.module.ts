import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { DiagnosticsController } from './diagnostics.controller'
import { DiagnosticsService } from './diagnostics.service'
import { NpmRegistryService } from './npm-registry.service'
import { UpdatePlannerService } from './update-planner.service'

/**
 * Diagnostico do sistema: runtime, arquivos, dependencias e atualizacoes.
 *
 * Somente leitura e sem efeito colateral — a tela pode ser aberta a qualquer
 * momento, inclusive com o portal com problema.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService, NpmRegistryService, UpdatePlannerService],
})
export class DiagnosticsModule {}
