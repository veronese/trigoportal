import { SetMetadata } from '@nestjs/common'
import type { Permission } from '@trigo/core'

export const PERMISSIONS_KEY = 'trigo:permissions'

/** Exige que o papel do usuario possua TODAS as permissoes informadas. */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)
