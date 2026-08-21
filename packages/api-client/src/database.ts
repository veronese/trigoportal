import type { DatabaseStatus } from '@trigo/core'
import { request, type HttpConfig } from './http'

/** Diagnostico do banco. Somente leitura: a conexao vive no .env. */
export function getDatabaseStatus(config: HttpConfig) {
  return request<DatabaseStatus>(config, '/database/status')
}
