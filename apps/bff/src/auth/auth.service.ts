import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  ERROR_CODES,
  isRole,
  type ChangePasswordInput,
  type LoginInput,
  type SessionUser,
} from '@trigo/core'
import { hashPassword, verifyPassword } from '../common/password'
import { ParametersService } from '../parameters/parameters.service'
import { PrismaService } from '../prisma/prisma.service'
import { durationToSeconds, parseDuration } from './session-cookie'
import {
  IDENTITY_PROVIDERS,
  type AuthenticatedIdentity,
  type IdentityProvider,
} from './identity/identity-provider'
import type { JwtPayload } from './types'

export interface LoginResult {
  user: SessionUser
  token: string
  maxAgeSeconds: number
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly parameters: ParametersService,
    @Inject(IDENTITY_PROVIDERS) private readonly providers: IdentityProvider[],
  ) {}

  async login({ email, password }: LoginInput): Promise<LoginResult> {
    // Busca a conta antes de autenticar para poder fazer a contabilidade de
    // tentativas e checar bloqueio. Continua sem revelar se o e-mail existe
    // quando a credencial esta errada.
    const candidato = await this.prisma.user.findUnique({ where: { email } })
    if (candidato) await this.assertNotLocked(candidato)

    const identity = await this.resolveIdentity(email, password)
    if (!identity) {
      if (candidato) await this.registrarTentativaFalha(candidato)
      // Mensagem generica de proposito: nao revela se o e-mail existe na base.
      throw new UnauthorizedException('E-mail ou senha invalidos')
    }

    const user = await this.provisionUser(identity)
    if (!user.isActive) throw new UnauthorizedException('Usuario inativo. Procure o administrador.')
    if (!isRole(user.role)) throw new UnauthorizedException('Papel de acesso invalido')

    await this.assertSenhaProvisoriaNoPrazo(user)

    await this.prisma.user.update({
      where: { id: user.id },
      // Login bem-sucedido zera a contabilidade de tentativas.
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    })

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    }

    const expiresIn = await this.resolveSessionDuration()
    const token = await this.jwtService.signAsync(payload, { expiresIn })
    this.logger.log(`Login de ${user.email} pelo provider ${identity.provider}`)

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      token,
      maxAgeSeconds: durationToSeconds(expiresIn),
    }
  }

  /**
   * Troca de senha pelo proprio usuario — tambem e a saida da trava de primeiro
   * acesso. Exige a senha atual mesmo estando travado: o usuario acabou de
   * digita-la no login, e isso protege sessao esquecida em maquina compartilhada.
   *
   * Incrementa tokenVersion (derruba as OUTRAS sessoes dele) e devolve um token
   * novo, para quem trocou nao ser expulso da propria tela.
   */
  async changePassword(
    userId: string,
    { currentPassword, newPassword }: ChangePasswordInput,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('Sessao invalida')
    if (!isRole(user.role)) throw new UnauthorizedException('Papel de acesso invalido')

    if (user.provider !== 'local') {
      throw new ConflictException(
        `Sua senha e gerenciada por "${user.provider}" e nao pode ser trocada aqui`,
      )
    }

    const confere = await verifyPassword(currentPassword, user.passwordHash)
    if (!confere) {
      // 400 e nao 401: a sessao esta valida, o que veio errado foi o campo.
      // Com 401 o cliente trataria como sessao perdida e jogaria o usuario
      // para o login no meio da digitacao.
      throw new BadRequestException({
        message: 'Senha atual incorreta',
        issues: [{ path: ['currentPassword'], message: 'Senha atual incorreta' }],
      })
    }

    const atualizado = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        // A senha agora e do dono da conta: nao ha mais provisoria pendente.
        provisionalPasswordAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    })

    const expiresIn = await this.resolveSessionDuration()
    const token = await this.jwtService.signAsync(
      {
        sub: atualizado.id,
        email: atualizado.email,
        role: atualizado.role,
        tv: atualizado.tokenVersion,
      } satisfies JwtPayload,
      { expiresIn },
    )

    this.logger.log(`${atualizado.email} trocou a propria senha`)

    return {
      user: {
        id: atualizado.id,
        name: atualizado.name,
        email: atualizado.email,
        role: user.role,
        mustChangePassword: false,
      },
      token,
      maxAgeSeconds: durationToSeconds(expiresIn),
    }
  }

  // -------------------------------------------------------------------------
  // Bloqueio por tentativas (LOGIN_TENTATIVAS_MAX / LOGIN_BLOQUEIO_MINUTOS)
  // -------------------------------------------------------------------------

  /**
   * Recusa o login enquanto a conta estiver bloqueada — inclusive com a senha
   * correta, que e justamente o ponto.
   *
   * A mensagem admite que a conta existe. E uma troca consciente: e-mail
   * corporativo segue formato previsivel, entao a protecao contra enumeracao
   * valeria pouco, enquanto um usuario barrado sem explicacao gera chamado no
   * suporte e tentativa repetida.
   */
  private async assertNotLocked(user: { id: string; email: string; lockedUntil: Date | null }) {
    if (!user.lockedUntil) return

    const restanteMs = user.lockedUntil.getTime() - Date.now()
    if (restanteMs <= 0) {
      // Prazo venceu: limpa a contabilidade de forma preguicosa, sem job.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
      return
    }

    const minutos = Math.max(1, Math.ceil(restanteMs / 60_000))
    throw new ForbiddenException({
      message: `Conta bloqueada por tentativas de acesso. Tente novamente em ${minutos} minuto(s) ou procure o administrador.`,
      code: ERROR_CODES.ACCOUNT_LOCKED,
    })
  }

  private async registrarTentativaFalha(user: {
    id: string
    email: string
    failedLoginAttempts: number
  }): Promise<void> {
    const maximo = await this.parameters.getNumber('LOGIN_TENTATIVAS_MAX', 0)
    const tentativas = user.failedLoginAttempts + 1

    // Zero (ou valor invalido) desliga o bloqueio: ainda contamos, para o admin
    // enxergar o ataque na tela, mas nunca travamos a conta.
    if (!Number.isInteger(maximo) || maximo < 1) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: tentativas },
      })
      return
    }

    if (tentativas < maximo) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: tentativas },
      })
      return
    }

    const minutosBloqueio = await this.parameters.getNumber('LOGIN_BLOQUEIO_MINUTOS', 15)
    const duracao = Number.isInteger(minutosBloqueio) && minutosBloqueio > 0 ? minutosBloqueio : 15

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: tentativas,
        lockedUntil: new Date(Date.now() + duracao * 60_000),
      },
    })

    this.logger.warn(
      `Conta ${user.email} bloqueada por ${duracao} min apos ${tentativas} tentativas erradas`,
    )
  }

  // -------------------------------------------------------------------------
  // Prazo da senha provisoria (SENHA_PROVISORIA_VALIDADE_HORAS)
  // -------------------------------------------------------------------------

  /**
   * Senha emitida por um admin nao pode valer para sempre: fecha a janela de
   * uma provisoria vazada e nunca usada. Vencida, o admin precisa emitir outra.
   */
  private async assertSenhaProvisoriaNoPrazo(user: {
    email: string
    mustChangePassword: boolean
    provisionalPasswordAt: Date | null
  }): Promise<void> {
    if (!user.mustChangePassword || !user.provisionalPasswordAt) return

    const horas = await this.parameters.getNumber('SENHA_PROVISORIA_VALIDADE_HORAS', 0)
    if (!Number.isInteger(horas) || horas < 1) return

    const vencimento = user.provisionalPasswordAt.getTime() + horas * 3_600_000
    if (Date.now() <= vencimento) return

    this.logger.warn(`Senha provisoria de ${user.email} expirada (prazo de ${horas}h)`)
    throw new ForbiddenException({
      message:
        'Sua senha provisoria expirou. Solicite ao administrador a liberacao de um novo acesso.',
      code: ERROR_CODES.PROVISIONAL_PASSWORD_EXPIRED,
    })
  }

  /**
   * Duracao da sessao vem do Configurador (SESSAO_DURACAO_HORAS), com o .env
   * como rede de seguranca caso o parametro nao exista ou venha fora de faixa.
   * Alterar o parametro afeta os proximos logins, nao as sessoes ja abertas.
   */
  private async resolveSessionDuration() {
    const fallback = parseDuration(this.config.get<string>('JWT_EXPIRES_IN'))
    const horas = await this.parameters.getNumber('SESSAO_DURACAO_HORAS', 0)

    if (!Number.isInteger(horas) || horas < 1 || horas > 720) {
      if (horas !== 0) {
        this.logger.warn(
          `SESSAO_DURACAO_HORAS invalido (${horas}). Usando ${fallback} do .env. Aceito: 1 a 720 horas inteiras.`,
        )
      }
      return fallback
    }

    return `${horas}h` as const
  }

  private async resolveIdentity(
    email: string,
    password: string,
  ): Promise<AuthenticatedIdentity | null> {
    for (const provider of this.providers) {
      const identity = await provider.authenticate(email, password)
      if (identity) return identity
    }
    return null
  }

  /**
   * Providers externos (Protheus/AD) podem autenticar usuarios que ainda nao
   * existem na base local: criamos o registro com o papel minimo.
   */
  private async provisionUser(identity: AuthenticatedIdentity) {
    const existing = await this.prisma.user.findUnique({ where: { email: identity.email } })
    if (existing) return existing

    return this.prisma.user.create({
      data: {
        name: identity.name,
        email: identity.email,
        provider: identity.provider,
        externalId: identity.externalId ?? null,
        role: 'USER',
      },
    })
  }
}
