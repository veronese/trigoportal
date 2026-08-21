import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { SessionUser } from '@trigo/core'
import type { AuthenticatedRequest } from '../types'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!request.user) throw new UnauthorizedException('Sessao nao encontrada')
    return request.user
  },
)
