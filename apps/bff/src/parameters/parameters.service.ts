import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Parameter } from '@prisma/client'
import {
  PARAMETER_GROUPS,
  parameterAsBoolean,
  parameterAsNumber,
  validateParameterValue,
  type ParameterListResponse,
  type ParameterType,
  type UpdateCredentialInput,
  type PublicBranding,
  type PublicParameter,
} from '@trigo/core'
import { SecretCipher } from '../common/secret-cipher'
import { PrismaService } from '../prisma/prisma.service'
import { PARAMETER_CATALOG, PUBLIC_PARAMETER_KEYS } from './parameter-catalog'

@Injectable()
export class ParametersService {
  private readonly logger = new Logger(ParametersService.name)

  /**
   * Cache em memoria. Parametro e lido em quase toda requisicao e muda muito
   * pouco: sem cache, cada leitura viraria um SELECT. Invalidado por escrita.
   *
   * Nota para quando escalar horizontalmente: com mais de uma instancia do BFF,
   * este cache precisa de invalidacao distribuida (Redis pub/sub). Ver README.
   */
  private cache: Map<string, string | null> | null = null

  private readonly cipher: SecretCipher

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.cipher = SecretCipher.fromEnv(config.get<string>('PARAMETER_ENCRYPTION_KEY'))
    if (!this.cipher.isEnabled) {
      this.logger.warn(
        'PARAMETER_ENCRYPTION_KEY ausente: parametros do tipo SECRET nao poderao ser gravados.',
      )
    }
  }

  // -------------------------------------------------------------------------
  // Leitura tipada — e assim que o resto da aplicacao consome parametro
  // -------------------------------------------------------------------------

  async getString(key: string, fallback = ''): Promise<string> {
    const value = await this.raw(key)
    return value ?? fallback
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    return parameterAsNumber(await this.raw(key), fallback)
  }

  async getBoolean(key: string, fallback: boolean): Promise<boolean> {
    return parameterAsBoolean(await this.raw(key), fallback)
  }

  /**
   * Le um parametro SECRET decifrado. Uso EXCLUSIVO de servico interno
   * (ex.: autenticacao no Protheus). Nunca exponha o retorno em resposta HTTP.
   */
  async getSecret(key: string): Promise<string | null> {
    const parameter = await this.prisma.parameter.findUnique({ where: { key } })
    if (!parameter?.value) return null
    if (!parameter.isSecret) return parameter.value

    try {
      return this.cipher.decrypt(parameter.value)
    } catch (error) {
      this.logger.error(
        `Falha ao decifrar o parametro ${key}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  private async raw(key: string): Promise<string | null> {
    const cache = await this.loadCache()
    return cache.get(key) ?? null
  }

  private async loadCache(): Promise<Map<string, string | null>> {
    if (this.cache) return this.cache
    const rows = await this.prisma.parameter.findMany()
    // SECRET fica fora do cache de leitura comum: quem precisa usa getSecret().
    this.cache = new Map(
      rows.map((row) => [row.key, row.isSecret ? null : (row.value ?? row.defaultValue)]),
    )
    return this.cache
  }

  invalidateCache(): void {
    this.cache = null
  }

  // -------------------------------------------------------------------------
  // CRUD da tela do Configurador
  // -------------------------------------------------------------------------

  async list(): Promise<ParameterListResponse> {
    const rows = await this.prisma.parameter.findMany({ orderBy: { label: 'asc' } })

    // Ordem dos grupos vem do core (Geral, Seguranca, Protheus); grupo que
    // aparecer no banco fora dessa lista vai para o fim, sem quebrar a tela.
    const known = PARAMETER_GROUPS as readonly string[]
    const groupNames = [...new Set(rows.map((row) => row.group))].sort((a, b) => {
      const ia = known.indexOf(a)
      const ib = known.indexOf(b)
      return (ia === -1 ? known.length : ia) - (ib === -1 ? known.length : ib)
    })

    // Para CREDENTIAL decifra apenas o usuario, que nao e segredo. Falha de
    // decifragem nao derruba a tela: o campo vem nulo e o admin regrava.
    const usuarios = new Map<string, string | null>()
    for (const row of rows) {
      if (row.type === 'CREDENTIAL') usuarios.set(row.key, this.lerUsuarioDaCredencial(row))
    }

    return {
      groups: groupNames.map((group) => ({
        group,
        parameters: rows
          .filter((row) => row.group === group)
          .map((row) => toPublicParameter(row, usuarios.get(row.key) ?? null)),
      })),
      total: rows.length,
    }
  }

  /**
   * Grava usuario e senha como um par unico, cifrado. Endpoint separado do
   * `update` generico de proposito: a senha nunca passa pelo caminho de string
   * comum, que registra o novo valor no log.
   */
  async updateCredential(
    key: string,
    input: UpdateCredentialInput,
    actorEmail: string,
  ): Promise<PublicParameter> {
    const parameter = await this.findOrFail(key)
    if (parameter.type !== 'CREDENTIAL') {
      throw new BadRequestException(`O parametro ${key} nao e do tipo usuario e senha.`)
    }
    if (!this.cipher.isEnabled) {
      throw new ServiceUnavailableException(
        'PARAMETER_ENCRYPTION_KEY nao configurada no servidor: credencial nao pode ser gravada.',
      )
    }

    const updated = await this.prisma.parameter.update({
      where: { key },
      data: {
        value: this.cipher.encrypt(JSON.stringify({ usuario: input.usuario, senha: input.senha })),
        updatedBy: actorEmail,
      },
    })

    this.invalidateCache()
    // Registra o usuario, que ajuda na auditoria, e nunca a senha.
    this.logger.log(`Credencial ${key} atualizada por ${actorEmail} (usuario: ${input.usuario})`)

    return toPublicParameter(updated, input.usuario)
  }

  /** Le a credencial decifrada. Uso EXCLUSIVO de servico interno. */
  async getCredential(key: string): Promise<{ usuario: string; senha: string } | null> {
    const parameter = await this.prisma.parameter.findUnique({ where: { key } })
    if (!parameter?.value) return null

    try {
      const parsed = JSON.parse(this.cipher.decrypt(parameter.value)) as {
        usuario?: unknown
        senha?: unknown
      }
      if (typeof parsed.usuario !== 'string' || typeof parsed.senha !== 'string') return null
      return { usuario: parsed.usuario, senha: parsed.senha }
    } catch (error) {
      this.logger.error(
        `Falha ao ler a credencial ${key}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  private lerUsuarioDaCredencial(row: { key: string; value: string | null }): string | null {
    if (!row.value) return null
    try {
      const parsed = JSON.parse(this.cipher.decrypt(row.value)) as { usuario?: unknown }
      return typeof parsed.usuario === 'string' ? parsed.usuario : null
    } catch {
      this.logger.warn(`Credencial ${row.key} ilegivel: regrave o usuario e a senha.`)
      return null
    }
  }

  async update(key: string, rawValue: string, actorEmail: string): Promise<PublicParameter> {
    const parameter = await this.findOrFail(key)
    const type = parameter.type as ParameterType

    if (type === 'CREDENTIAL') {
      throw new BadRequestException(
        `O parametro ${key} guarda usuario e senha: use o endpoint /credential.`,
      )
    }

    const value = type === 'SECRET' ? rawValue : rawValue.trim()
    const error = validateParameterValue(type, value)
    if (error) throw new BadRequestException({ message: error, issues: [{ path: ['value'], message: error }] })

    // SECRET vai cifrado para o banco. Falha explicita se a chave nao existir:
    // gravar em texto claro "so por enquanto" e como esse tipo de brecha nasce.
    let stored = value
    if (parameter.isSecret) {
      if (!this.cipher.isEnabled) {
        throw new ServiceUnavailableException(
          'PARAMETER_ENCRYPTION_KEY nao configurada no servidor: parametro do tipo SECRET nao pode ser gravado.',
        )
      }
      stored = this.cipher.encrypt(value)
    }

    const updated = await this.prisma.parameter.update({
      where: { key },
      data: { value: stored, updatedBy: actorEmail },
    })

    this.invalidateCache()
    this.logger.log(
      `Parametro ${key} alterado por ${actorEmail}` +
        (parameter.isSecret ? '' : ` (novo valor: ${value})`),
    )

    return toPublicParameter(updated)
  }

  /** Volta o parametro ao padrao de fabrica do catalogo. */
  async reset(key: string, actorEmail: string): Promise<PublicParameter> {
    await this.findOrFail(key)
    const updated = await this.prisma.parameter.update({
      where: { key },
      data: { value: null, updatedBy: actorEmail },
    })

    this.invalidateCache()
    this.logger.log(`Parametro ${key} restaurado ao padrao por ${actorEmail}`)
    return toPublicParameter(updated)
  }

  /** Dados de marca liberados sem sessao, para a tela de login. */
  async branding(): Promise<PublicBranding> {
    const supportEmail = await this.getString('PORTAL_EMAIL_SUPORTE')
    return {
      portalName: await this.getString('PORTAL_NOME', 'Portal Trigo'),
      loginMessage: await this.getString(
        'PORTAL_MENSAGEM_LOGIN',
        'Entre com suas credenciais corporativas',
      ),
      supportEmail: supportEmail === '' ? null : supportEmail,
    }
  }

  /**
   * Sincroniza o banco com o catalogo. Cria o que falta, atualiza rotulo e
   * descricao, e NUNCA sobrescreve valor customizado. Chamado pelo seed.
   */
  async syncCatalog(): Promise<{ criados: number; atualizados: number }> {
    let criados = 0
    let atualizados = 0

    for (const definition of PARAMETER_CATALOG) {
      const existing = await this.prisma.parameter.findUnique({ where: { key: definition.key } })
      if (existing) {
        await this.prisma.parameter.update({
          where: { key: definition.key },
          data: {
            label: definition.label,
            description: definition.description,
            group: definition.group,
            type: definition.type,
            defaultValue: definition.defaultValue,
            isSecret: definition.isSecret ?? false,
          },
        })
        atualizados++
        continue
      }

      await this.prisma.parameter.create({
        data: {
          key: definition.key,
          label: definition.label,
          description: definition.description,
          group: definition.group,
          type: definition.type,
          defaultValue: definition.defaultValue,
          isSecret: definition.isSecret ?? false,
          value: null,
        },
      })
      criados++
    }

    this.invalidateCache()
    return { criados, atualizados }
  }

  private async findOrFail(key: string): Promise<Parameter> {
    const parameter = await this.prisma.parameter.findUnique({ where: { key } })
    if (!parameter) throw new NotFoundException(`Parametro ${key} nao existe`)
    return parameter
  }

  static get publicKeys(): readonly string[] {
    return PUBLIC_PARAMETER_KEYS
  }
}

/** Barreira entre o registro do banco e o que sai na API. */
function toPublicParameter(
  parameter: Parameter,
  credentialUser: string | null = null,
): PublicParameter {
  const effective = parameter.value ?? parameter.defaultValue
  return {
    key: parameter.key,
    label: parameter.label,
    description: parameter.description,
    group: parameter.group,
    type: parameter.type as ParameterType,
    // Valor de SECRET nunca trafega.
    value: parameter.isSecret ? null : effective,
    defaultValue: parameter.isSecret ? null : parameter.defaultValue,
    hasValue: parameter.isSecret
      ? Boolean(parameter.value)
      : effective !== null && effective !== '',
    credentialUser: parameter.type === 'CREDENTIAL' ? credentialUser : null,
    isCustomized: parameter.value !== null && parameter.value !== parameter.defaultValue,
    updatedAt: parameter.updatedAt.toISOString(),
    updatedBy: parameter.updatedBy,
  }
}
