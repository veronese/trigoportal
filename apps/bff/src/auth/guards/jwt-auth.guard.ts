import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'
import { ERROR_CODES, isRole } from '@trigo/core'
import { PrismaService } from '../../prisma/prisma.service'
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../decorators/allow-password-change-pending.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { SESSION_COOKIE } from '../session-cookie'
import type { AuthenticatedRequest, JwtPayload } from '../types'

/**
 * Guard global: por padrao TODA rota exige sessao valida.
 * Aceita cookie httpOnly (web/PWA) ou header Bearer (app mobile futuro).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const http = context.switchToHttp()
    const request = http.getRequest<AuthenticatedRequest>()
    const token = this.extractToken(request)
    if (!token) throw new UnauthorizedException('Sessao nao encontrada')

    // Cookie presente mas invalido precisa ser apagado: senao o middleware do Next
    // continua achando que existe sessao e o usuario entra em loop de redirect.
    const reject = (message: string): never => {
      http.getResponse<Response>().clearCookie(SESSION_COOKIE, { path: '/' })
      throw new UnauthorizedException(message)
    }

    let payload: JwtPayload
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token)
    } catch {
      return reject('Sessao invalida ou expirada')
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) return reject('Usuario inativo')
    if (user.tokenVersion !== payload.tv) return reject('Sessao revogada')
    if (!isRole(user.role)) return reject('Papel de acesso invalido')

    request.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    }

    /**
     * Troca de senha obrigatoria: a sessao existe e e valida, mas so serve para
     * trocar a senha. Recusa com 403 e um codigo legivel por maquina — nao 401,
     * porque a credencial esta correta e o front nao deve derrubar a sessao.
     */
    if (user.mustChangePassword) {
      const permitido = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        [context.getHandler(), context.getClass()],
      )
      if (!permitido) {
        throw new ForbiddenException({
          message: 'Troque sua senha para continuar usando o portal',
          code: ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        })
      }
    }

    return true
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const cookies = request.cookies as Record<string, string> | undefined
    const fromCookie = cookies?.[SESSION_COOKIE]
    if (fromCookie) return fromCookie

    const header = request.headers.authorization
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
    return null
  }
}
