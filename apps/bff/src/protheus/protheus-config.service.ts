import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ERROR_CODES } from '@trigo/core'
import { ParametersService } from '../parameters/parameters.service'

export interface ProtheusConfig {
  baseUrl: string
  usuario: string
  senha: string
  timeoutMs: number
  cacheMinutos: number
}

/**
 * Reune a configuracao de conexao com o Protheus.
 *
 * Ordem de precedencia: Configurador primeiro, .env como fallback. Assim o
 * administrador troca a URL ou a senha sem deploy, mas um ambiente automatizado
 * (CI, container recem-subido com banco vazio) ainda sobe com variavel de
 * ambiente.
 */
@Injectable()
export class ProtheusConfigService {
  constructor(
    private readonly parameters: ParametersService,
    private readonly env: ConfigService,
  ) {}

  /** Configuracao completa, ou erro claro apontando o que falta. */
  async require(): Promise<ProtheusConfig> {
    const config = await this.read()
    const faltando: string[] = []

    if (!config.baseUrl) faltando.push('PROTHEUS_REST_URL')
    if (!config.usuario || !config.senha) faltando.push('PROTHEUS_CREDENCIAL (usuario e senha)')

    if (faltando.length > 0) {
      throw new ServiceUnavailableException({
        message: `Conexao com o Protheus incompleta. Configure em Configurador > Parametros: ${faltando.join(', ')}.`,
        code: ERROR_CODES.PROTHEUS_NOT_CONFIGURED,
      })
    }

    return config
  }

  /** Leitura sem validar — usada pela tela de diagnostico. */
  async read(): Promise<ProtheusConfig> {
    const baseUrl = (
      (await this.parameters.getString('PROTHEUS_REST_URL')) ||
      this.env.get<string>('PROTHEUS_REST_URL') ||
      ''
    )
      .trim()
      // Barra no fim atrapalha a concatenacao de path adiante.
      .replace(/\/+$/, '')

    // Usuario e senha vivem juntos em um unico parametro do tipo CREDENTIAL.
    // O .env segue valendo como fallback para ambiente automatizado.
    const credencial = await this.parameters.getCredential('PROTHEUS_CREDENCIAL')
    const usuario = (credencial?.usuario ?? this.env.get<string>('PROTHEUS_USUARIO') ?? '').trim()
    const senha = credencial?.senha ?? this.env.get<string>('PROTHEUS_SENHA') ?? ''

    const timeoutSegundos = await this.parameters.getNumber('PROTHEUS_TIMEOUT_SEGUNDOS', 30)

    return {
      baseUrl,
      usuario,
      senha,
      timeoutMs: Math.max(1, Math.min(timeoutSegundos, 300)) * 1000,
      cacheMinutos: await this.parameters.getNumber('PROTHEUS_CACHE_MINUTOS', 5),
    }
  }

  /** Sem revelar a senha: usado no diagnostico e no log. */
  async summary(): Promise<{
    baseUrl: string
    usuario: string
    timeoutSegundos: number
    senhaConfigurada: boolean
    configurado: boolean
  }> {
    const config = await this.read()
    return {
      baseUrl: config.baseUrl,
      usuario: config.usuario,
      timeoutSegundos: Math.round(config.timeoutMs / 1000),
      senhaConfigurada: config.senha !== '',
      configurado: Boolean(config.baseUrl && config.usuario && config.senha),
    }
  }
}
