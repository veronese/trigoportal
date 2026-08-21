import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ERROR_CODES } from '@trigo/core'
import { ProtheusAuthService } from './protheus-auth.service'
import { ProtheusConfigService, type ProtheusConfig } from './protheus-config.service'

/**
 * Empresa e filial da chamada.
 *
 * OBRIGATORIO, e sem valor padrao em parametro de proposito. Um tenant default
 * silencioso e perigoso: a chamada continua funcionando quando quem escreveu o
 * codigo esqueceu de informar a empresa, so que lendo a tabela ERRADA — e o
 * resultado parece legitimo. Sendo campo obrigatorio, o compilador cobra a
 * decisao em cada ponto de chamada.
 */
export interface ProtheusTenant {
  empresa: string
  filial: string
}

export interface ProtheusRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Empresa e filial desta chamada. Nao existe fallback. */
  tenant: ProtheusTenant
}

/** Formato de erro que o Protheus devolve nas rotinas REST padrao. */
interface ProtheusErrorBody {
  errorCode?: string
  message?: string
  detailedMessage?: string
}

/**
 * Cliente REST do Protheus. Toda chamada a rotina do ERP passa por aqui.
 *
 * O que ele centraliza, e por isso nenhum modulo deve chamar `fetch` direto:
 *  - injeta o Bearer da conta de servico, renovado automaticamente;
 *  - refaz UMA vez quando o Protheus responde 401 (token invalidado do outro
 *    lado, comum apos restart do appserver);
 *  - envia `tenantId` com a empresa e a filial que QUEM CHAMA informou — nao
 *    existe tenant padrao, justamente para nao ler a tabela errada em
 *    silencio;
 *  - aplica timeout, para uma rotina lenta nao segurar thread do BFF;
 *  - traduz o erro do ERP em mensagem util, preservando `detailedMessage`.
 */
@Injectable()
export class ProtheusClient {
  private readonly logger = new Logger(ProtheusClient.name)

  constructor(
    private readonly auth: ProtheusAuthService,
    private readonly configService: ProtheusConfigService,
  ) {}

  get<T>(path: string, options: Omit<ProtheusRequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  post<T>(path: string, body: unknown, options: Omit<ProtheusRequestOptions, 'method'>) {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  put<T>(path: string, body: unknown, options: Omit<ProtheusRequestOptions, 'method'>) {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }

  delete<T>(path: string, options: Omit<ProtheusRequestOptions, 'method' | 'body'>) {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }

  /**
   * Como `request`, mas devolve status e corpo SEM lancar em erro HTTP.
   *
   * Existe por causa de rotina que usa status para sinalizar situacao normal.
   * O `zWsProdutos`, por exemplo, responde 500 com `errorId: ALL003` quando a
   * consulta nao encontra registro — que numa carga paginada e simplesmente o
   * fim da lista, nao falha. Quem chama isto assume a interpretacao do corpo.
   */
  async requestRaw<T>(
    path: string,
    options: ProtheusRequestOptions,
  ): Promise<{ status: number; ok: boolean; payload: T | null }> {
    const config = await this.configService.require()

    let response = await this.executar(config, path, options)
    if (response.status === 401) {
      this.auth.invalidate()
      response = await this.executar(config, path, options)
    }

    const texto = await response.text()
    let payload: T | null = null
    if (texto !== '') {
      try {
        payload = JSON.parse(texto) as T
      } catch {
        throw new ServiceUnavailableException({
          message: `O Protheus respondeu ${path} com conteudo que nao e JSON.`,
          code: ERROR_CODES.PROTHEUS_UNAVAILABLE,
        })
      }
    }

    return { status: response.status, ok: response.ok, payload }
  }

  async request<T>(path: string, options: ProtheusRequestOptions): Promise<T> {
    const config = await this.configService.require()

    const primeira = await this.executar(config, path, options)
    if (primeira.status !== 401) return this.interpretar<T>(primeira, path)

    // 401 com token que o BFF julgava valido: appserver reiniciou ou revogou.
    // Uma segunda tentativa com token novo resolve; duas seriam laco.
    this.logger.warn(`Protheus devolveu 401 em ${path}. Reautenticando e tentando outra vez.`)
    this.auth.invalidate()

    const segunda = await this.executar(config, path, options)
    return this.interpretar<T>(segunda, path)
  }

  private async executar(
    config: ProtheusConfig,
    path: string,
    options: ProtheusRequestOptions,
  ): Promise<Response> {
    const { empresa, filial } = options.tenant
    if (!empresa?.trim() || !filial?.trim()) {
      // Erro de programacao, nao de configuracao: por isso 500 e nao 503.
      throw new InternalServerErrorException(
        `Chamada ao Protheus em ${path} sem empresa e filial. O tenant tem que ser informado por quem chama.`,
      )
    }

    const token = await this.auth.getAccessToken()

    const search = new URLSearchParams()
    for (const [chave, valor] of Object.entries(options.query ?? {})) {
      if (valor !== undefined && valor !== '') search.set(chave, String(valor))
    }
    const queryString = search.toString()
    const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}${queryString ? `?${queryString}` : ''}`

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      // Empresa e filial do contexto. O Protheus tambem aceita como query em
      // algumas rotinas, mas o header vale para todas.
      tenantId: `${options.tenant.empresa},${options.tenant.filial}`,
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    try {
      return await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(config.timeoutMs),
      })
    } catch (error) {
      const detalhe =
        error instanceof Error && error.name === 'TimeoutError'
          ? `a rotina nao respondeu em ${Math.round(config.timeoutMs / 1000)}s`
          : error instanceof Error
            ? error.message
            : String(error)

      throw new ServiceUnavailableException({
        message: `Falha ao chamar o Protheus (${path}): ${detalhe}`,
        code: ERROR_CODES.PROTHEUS_UNAVAILABLE,
      })
    }
  }

  private async interpretar<T>(response: Response, path: string): Promise<T> {
    const texto = await response.text()

    if (response.status === 204 || texto === '') return undefined as T

    let payload: unknown
    try {
      payload = JSON.parse(texto)
    } catch {
      if (response.ok) {
        throw new ServiceUnavailableException({
          message: `O Protheus respondeu ${path} com conteudo que nao e JSON.`,
          code: ERROR_CODES.PROTHEUS_UNAVAILABLE,
        })
      }
      throw new HttpException(
        { message: `Protheus retornou HTTP ${response.status} em ${path}.`, statusCode: response.status },
        response.status,
      )
    }

    if (response.ok) return payload as T

    const erro = payload as ProtheusErrorBody
    const mensagem =
      erro.detailedMessage?.trim() ||
      erro.message?.trim() ||
      `Protheus retornou HTTP ${response.status} em ${path}.`

    this.logger.warn(`Protheus ${response.status} em ${path}: ${mensagem}`)

    // Repassa o status do ERP: 404 de registro inexistente nao deve virar 500.
    throw new HttpException(
      {
        statusCode: response.status,
        message: mensagem,
        ...(erro.errorCode ? { protheusErrorCode: erro.errorCode } : {}),
      },
      response.status,
    )
  }
}
