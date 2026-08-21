import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ERROR_CODES } from '@trigo/core'
import { ProtheusConfigService, type ProtheusConfig } from './protheus-config.service'

interface TokenState {
  accessToken: string
  refreshToken: string | null
  /** Epoch ms em que o token deixa de ser usado (com margem de seguranca). */
  expiresAt: number
}

interface OAuthResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/** Renova antes de vencer, para nao perder requisicao na virada. */
const MARGEM_RENOVACAO_MS = 60_000
const VALIDADE_PADRAO_SEGUNDOS = 3600

/**
 * Autenticacao no REST do Protheus via OAuth2 password grant — usuario e senha
 * de uma conta de servico.
 *
 * POR QUE UM TOKEN COMPARTILHADO E NAO UM LOGIN POR REQUISICAO:
 * cada autenticacao no appserver ocupa thread e conta como sessao/licenca. Um
 * login por chamada derrubaria o ambiente sob carga — e o erro mais comum em
 * integracao com Protheus. Aqui existe UM token para a conta de servico,
 * reaproveitado por todas as chamadas e renovado antes de vencer.
 *
 * A concorrencia e serializada em `inflight`: se dez requisicoes chegarem com o
 * token vencido, apenas uma vai ao Protheus; as outras esperam o mesmo Promise.
 */
@Injectable()
export class ProtheusAuthService {
  private readonly logger = new Logger(ProtheusAuthService.name)

  private state: TokenState | null = null
  private inflight: Promise<TokenState> | null = null

  constructor(private readonly configService: ProtheusConfigService) {}

  async getAccessToken(): Promise<string> {
    const state = await this.ensureToken()
    return state.accessToken
  }

  /** Descarta o token atual. Chamado quando o Protheus devolve 401. */
  invalidate(): void {
    this.state = null
  }

  /**
   * Autentica do zero e devolve um diagnostico. Nao reaproveita cache: a tela de
   * teste de conexao precisa exercitar a credencial de verdade.
   */
  async testCredentials(): Promise<{ ok: true; expiresInSeconds: number } | { ok: false; detail: string }> {
    const config = await this.configService.require()
    try {
      const state = await this.passwordGrant(config)
      this.state = state
      return { ok: true, expiresInSeconds: Math.round((state.expiresAt - Date.now()) / 1000) }
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) }
    }
  }

  private async ensureToken(): Promise<TokenState> {
    if (this.state && this.state.expiresAt > Date.now()) return this.state
    if (this.inflight) return this.inflight

    this.inflight = this.renew().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async renew(): Promise<TokenState> {
    const config = await this.configService.require()
    const anterior = this.state

    // Refresh token evita reenviar a senha e costuma ser mais leve no appserver.
    if (anterior?.refreshToken) {
      try {
        const state = await this.refreshGrant(config, anterior.refreshToken)
        this.state = state
        this.logger.log('Token do Protheus renovado por refresh_token')
        return state
      } catch (error) {
        this.logger.warn(
          `Refresh do token falhou (${error instanceof Error ? error.message : String(error)}). Refazendo login com usuario e senha.`,
        )
      }
    }

    const state = await this.passwordGrant(config)
    this.state = state
    this.logger.log(`Autenticado no Protheus como "${config.usuario}"`)
    return state
  }

  private passwordGrant(config: ProtheusConfig): Promise<TokenState> {
    const query = new URLSearchParams({
      grant_type: 'password',
      username: config.usuario,
      password: config.senha,
    })
    return this.requestToken(config, query, 'password')
  }

  private refreshGrant(config: ProtheusConfig, refreshToken: string): Promise<TokenState> {
    const query = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
    return this.requestToken(config, query, 'refresh_token')
  }

  /**
   * O Protheus espera os parametros do OAuth na QUERY STRING, nao no corpo —
   * diferente do que a RFC 6749 sugere. Enviar no body resulta em 400.
   */
  private async requestToken(
    config: ProtheusConfig,
    query: URLSearchParams,
    modo: 'password' | 'refresh_token',
  ): Promise<TokenState> {
    const url = `${config.baseUrl}/api/oauth2/v1/token?${query.toString()}`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(config.timeoutMs),
      })
    } catch (error) {
      const detalhe =
        error instanceof Error && error.name === 'TimeoutError'
          ? `sem resposta em ${Math.round(config.timeoutMs / 1000)}s`
          : error instanceof Error
            ? error.message
            : String(error)

      throw new ServiceUnavailableException({
        message: `Nao foi possivel falar com o Protheus em ${config.baseUrl}: ${detalhe}`,
        code: ERROR_CODES.PROTHEUS_UNAVAILABLE,
      })
    }

    const corpo = await response.text()

    if (!response.ok) {
      // Credencial errada ou usuario sem acesso ao REST cai aqui.
      const dica =
        response.status === 400 || response.status === 401
          ? 'Verifique usuario e senha da conta de servico e se ela tem acesso ao REST no Protheus.'
          : 'Verifique se o appserver esta com o REST habilitado no endereco configurado.'

      throw new ServiceUnavailableException({
        message: `Protheus recusou a autenticacao (HTTP ${response.status}). ${dica}`,
        code: ERROR_CODES.PROTHEUS_AUTH_FAILED,
      })
    }

    let payload: OAuthResponse
    try {
      payload = JSON.parse(corpo) as OAuthResponse
    } catch {
      throw new ServiceUnavailableException({
        message:
          'O endereco configurado respondeu algo que nao e JSON. Confirme se a URL aponta para o REST do Protheus (normalmente termina em /rest).',
        code: ERROR_CODES.PROTHEUS_AUTH_FAILED,
      })
    }

    if (!payload.access_token) {
      throw new ServiceUnavailableException({
        message: `Resposta do Protheus nao trouxe access_token no fluxo ${modo}.`,
        code: ERROR_CODES.PROTHEUS_AUTH_FAILED,
      })
    }

    const validade = payload.expires_in && payload.expires_in > 0 ? payload.expires_in : VALIDADE_PADRAO_SEGUNDOS

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt: Date.now() + validade * 1000 - MARGEM_RENOVACAO_MS,
    }
  }
}
