import type { PlanoAtualizacao, SystemDiagnostics } from '@trigo/core'
import { request, type HttpConfig } from './http'

/**
 * @param comAtualizacoes consulta o registry do npm pelas ultimas versoes.
 *   Sob demanda porque e a unica parte que sai para a internet e custa ~20
 *   requisicoes externas.
 */
export function getSystemDiagnostics(config: HttpConfig, comAtualizacoes = false) {
  return request<SystemDiagnostics>(config, '/diagnostics', {
    query: comAtualizacoes ? { atualizacoes: 'true' } : {},
  })
}

/**
 * Monta o plano de atualizacao dos pacotes escolhidos.
 *
 * Nao executa nada: devolve script, verificacoes e rollback para revisao.
 */
export function planejarAtualizacao(config: HttpConfig, pacotes: string[]) {
  return request<PlanoAtualizacao>(config, '/diagnostics/update-plan', {
    method: 'POST',
    body: { pacotes },
  })
}
