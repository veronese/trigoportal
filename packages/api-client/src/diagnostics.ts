import type { components } from './gerado/api'
import { request, type HttpConfig } from './http'

/**
 * Tipos do diagnostico, vindos do OpenAPI da API Python.
 *
 * Reexportados daqui para as telas nao precisarem conhecer o caminho do
 * arquivo gerado — e para o dia em que o gerador mudar de lugar nao virar uma
 * varredura por import quebrado.
 */
export type DiagnosticoResponse = components['schemas']['DiagnosticoResponse']
export type ItemDiagnostico = components['schemas']['ItemDiagnostico']
export type CaminhoDiagnostico = components['schemas']['CaminhoDiagnostico']
export type PacoteDiagnostico = components['schemas']['PacoteDiagnostico']

/**
 * Diagnostico do servidor: execucao, arquivos, pacotes e banco.
 *
 * NAO EXISTE MAIS o planejador de atualizacao. Ele lia o package.json e o
 * registry do npm — ecossistema que o backend nao usa mais. Este endpoint
 * RELATA versao; atualizar e trabalho do servidor, pelo `uv`.
 */
export function getSystemDiagnostics(config: HttpConfig) {
  return request<DiagnosticoResponse>(config, '/diagnostics')
}
