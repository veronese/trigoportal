import type {
  ColunaBanco,
  ConsultaSqlResult,
  ProtheusDbConfig,
  ProtheusDbTestResult,
  TabelaBanco,
} from '@trigo/core'
import { request, type HttpConfig } from './http'

export function getProtheusDbConfig(config: HttpConfig) {
  return request<ProtheusDbConfig>(config, '/protheus-db/config')
}

/** Abre a conexao de verdade. Exige settings:write. */
export function testProtheusDb(config: HttpConfig) {
  return request<ProtheusDbTestResult>(config, '/protheus-db/testar', { method: 'POST' })
}

export function listProtheusDbTabelas(config: HttpConfig, busca?: string) {
  return request<TabelaBanco[]>(config, '/protheus-db/tabelas', { query: { busca } })
}

export function getProtheusDbColunas(config: HttpConfig, tabela: string) {
  return request<ColunaBanco[]>(config, `/protheus-db/tabelas/${tabela}/colunas`)
}

/** POST porque o SQL vai no corpo: em query string ele iria para o log. */
export function consultarProtheusDb(config: HttpConfig, sql: string, limite?: number) {
  return request<ConsultaSqlResult>(config, '/protheus-db/consultar', {
    method: 'POST',
    body: { sql, limite },
  })
}
