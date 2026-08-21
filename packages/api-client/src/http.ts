import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@trigo/core'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: ApiErrorBody['issues'],
    readonly code?: ErrorCode,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Mensagem pronta para exibir na tela, juntando erros de validacao. */
  get displayMessage(): string {
    if (!this.issues?.length) return this.message
    return this.issues.map((i) => i.message).join('. ')
  }
}

export interface HttpConfig {
  /** Ex.: '/api/bff' no web (proxy do Next) ou 'https://portal.grupotrigo.com.br/api' no app. */
  baseUrl: string
  /** Injetado pelo app mobile, onde nao existe cookie httpOnly. */
  getAuthToken?: () => string | null | Promise<string | null>
  onUnauthorized?: () => void
  /**
   * Chamado quando o BFF recusa a rota por troca de senha obrigatoria.
   * Vale para QUALQUER chamada: nao importa em que tela o usuario esteja,
   * a trava e a mesma.
   */
  onPasswordChangeRequired?: () => void
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return `${baseUrl.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`
}

export async function request<T>(
  config: HttpConfig,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const token = await config.getAuthToken?.()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(buildUrl(config.baseUrl, path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })

  if (response.status === 401) config.onUnauthorized?.()
  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload: unknown = text ? JSON.parse(text) : null

  if (!response.ok) {
    const body = (payload ?? {}) as ApiErrorBody
    if (body.code === ERROR_CODES.PASSWORD_CHANGE_REQUIRED) {
      config.onPasswordChangeRequired?.()
    }
    throw new ApiError(
      response.status,
      body.message || `Falha na requisicao (${response.status})`,
      body.issues,
      body.code,
    )
  }

  return payload as T
}
