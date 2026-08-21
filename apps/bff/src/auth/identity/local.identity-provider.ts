import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { verifyPassword } from '../../common/password'
import type { AuthenticatedIdentity, IdentityProvider } from './identity-provider'

@Injectable()
export class LocalIdentityProvider implements IdentityProvider {
  readonly name = 'local'

  constructor(private readonly prisma: PrismaService) {}

  async authenticate(email: string, password: string): Promise<AuthenticatedIdentity | null> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || user.provider !== this.name) return null

    const matches = await verifyPassword(password, user.passwordHash)
    if (!matches) return null

    return { email: user.email, name: user.name, provider: this.name }
  }
}
