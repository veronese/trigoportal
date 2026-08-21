import type { ProtheusStatus, ProtheusTestResult } from '@trigo/core'
import { request, type HttpConfig } from './http'

export function getProtheusStatus(config: HttpConfig) {
  return request<ProtheusStatus>(config, '/protheus/status')
}

/** Autentica de verdade no appserver. Consome uma sessao no Protheus. */
export function testProtheusConnection(config: HttpConfig) {
  return request<ProtheusTestResult>(config, '/protheus/test-connection', { method: 'POST' })
}
