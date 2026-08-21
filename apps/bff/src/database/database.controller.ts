import { Controller, Get } from '@nestjs/common'
import type { DatabaseStatus } from '@trigo/core'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { DatabaseService } from './database.service'

@Controller('database')
export class DatabaseController {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Somente leitura, e de proposito: a conexao nao pode ser alterada pelo
   * portal (ver comentario no DatabaseService). Nao existe rota de escrita.
   */
  @Get('status')
  @RequirePermission('settings:read')
  status(): Promise<DatabaseStatus> {
    return this.database.status()
  }
}
