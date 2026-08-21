import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { canAll, type Permission } from '@trigo/core'
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../types'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required?.length) return true

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!user || !canAll(user.role, required)) {
      throw new ForbiddenException('Voce nao tem permissao para esta acao')
    }
    return true
  }
}
