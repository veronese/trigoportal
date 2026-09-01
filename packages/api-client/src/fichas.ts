import type {
  AvaliacaoPromocao,
  CriarFichaInput,
  DecidirAprovacaoInput,
  FichaDetalhe,
  FichaListaResponse,
  GerarVersaoInput,
  PastaFichas,
  PromoverFaseInput,
  VersaoDetalhe,
} from '@trigo/core'
import { request, type HttpConfig } from './http'

export interface ListFichasParams {
  restauranteId?: string
  linhaId?: string
  busca?: string
  page?: number
  pageSize?: number
}

export function listFichaMarcas(config: HttpConfig) {
  return request<PastaFichas[]>(config, '/fichas/pastas')
}

export function listFichaLinhas(config: HttpConfig, restauranteId: string) {
  return request<PastaFichas[]>(config, `/fichas/pastas/${restauranteId}/linhas`)
}

export function listFichas(config: HttpConfig, params: ListFichasParams = {}) {
  return request<FichaListaResponse>(config, '/fichas', { query: { ...params } })
}

export function getFicha(config: HttpConfig, id: string) {
  return request<FichaDetalhe>(config, `/fichas/${id}`)
}

export function getFichaVersao(config: HttpConfig, versaoId: string) {
  return request<VersaoDetalhe>(config, `/fichas/versoes/${versaoId}`)
}

export function criarFicha(config: HttpConfig, body: CriarFichaInput) {
  return request<{ fichaId: string; versaoId: string }>(config, '/fichas', {
    method: 'POST',
    body,
  })
}

/** Congela o rascunho e devolve o id do rascunho novo, ja aberto. */
export function gerarVersaoFicha(config: HttpConfig, versaoId: string, body: GerarVersaoInput) {
  return request<{ versaoId: string; novoRascunhoId: string }>(
    config,
    `/fichas/versoes/${versaoId}/gerar`,
    { method: 'POST', body },
  )
}

/** O que impede promover, sem executar nada. Alimenta o botao e o motivo. */
export function avaliarPromocaoFicha(config: HttpConfig, faseId: string) {
  return request<AvaliacaoPromocao>(config, `/fichas/fases/${faseId}/promocao`)
}

export function promoverFicha(config: HttpConfig, faseId: string, body: PromoverFaseInput) {
  return request<{ faseId: string; versaoId: string }>(config, `/fichas/fases/${faseId}/promover`, {
    method: 'POST',
    body,
  })
}

export function decidirAprovacaoFicha(
  config: HttpConfig,
  versaoId: string,
  area: string,
  body: DecidirAprovacaoInput,
) {
  return request<void>(config, `/fichas/versoes/${versaoId}/aprovacoes/${area}`, {
    method: 'POST',
    body,
  })
}
