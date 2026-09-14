import type { ProtheusDbConfig, ProtheusDbTestResult } from '@trigo/core'
import { request, type HttpConfig } from './http'

export function getProtheusDbConfig(config: HttpConfig) {
  return request<ProtheusDbConfig>(config, '/protheus-db/config')
}

/** Abre a conexao de verdade. Exige settings:write. */
export function testProtheusDb(config: HttpConfig) {
  return request<ProtheusDbTestResult>(config, '/protheus-db/testar', { method: 'POST' })
}
