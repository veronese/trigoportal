import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma, User } from '@prisma/client'
import type {
  CreateUserInput,
  PublicUser,
  Role,
  SessionUser,
  UpdateUserInput,
  UserListResponse,
} from '@trigo/core'
import { hashPassword } from '../common/password'
import { ParametersService } from '../parameters/parameters.service'
import { PrismaService } from '../prisma/prisma.service'

export interface ListUsersParams {
  search?: string
  page?: number
  pageSize?: number
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: ParametersService,
  ) {}

  async list({ search, page = 1, pageSize }: ListUsersParams): Promise<UserListResponse> {
    // Sem pageSize explicito, usa PORTAL_PAGINACAO_PADRAO do Configurador.
    const requested = pageSize ?? (await this.parameters.getNumber('PORTAL_PAGINACAO_PADRAO', 20))
    // O teto tambem e parametrizado: antes era 100 fixo no codigo.
    const teto = await this.parameters.getNumber('BANCO_LIMITE_REGISTROS_CONSULTA', 100)
    const take = Math.min(Math.max(Math.trunc(requested) || 20, 1), Math.max(Math.trunc(teto) || 100, 1))
    const skip = (Math.max(page, 1) - 1) * take

    const where: Prisma.UserWhereInput = search
      ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
      : {}

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      this.prisma.user.count({ where }),
    ])

    const validadeHoras = await this.validadeProvisoriaHoras()
    return { data: rows.map((row) => toPublicUser(row, validadeHoras)), total }
  }

  async findOne(id: string): Promise<PublicUser> {
    return toPublicUser(await this.findOrFail(id), await this.validadeProvisoriaHoras())
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw new ConflictException('Ja existe um usuario com este e-mail')

    // A senha informada pelo admin e provisoria por natureza. O Configurador
    // decide se o usuario e obrigado a troca-la no primeiro acesso.
    const exigeTroca = await this.parameters.getBoolean(
      'SENHA_EXIGE_TROCA_PRIMEIRO_ACESSO',
      true,
    )

    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        provider: 'local',
        passwordHash: await hashPassword(input.password),
        mustChangePassword: exigeTroca,
        provisionalPasswordAt: exigeTroca ? new Date() : null,
      },
    })

    this.logger.log(
      `Usuario criado: ${user.email} (${user.role})` +
        (exigeTroca ? ' — troca de senha obrigatoria no primeiro acesso' : ''),
    )
    return toPublicUser(user, exigeTroca ? await this.validadeProvisoriaHoras() : 0)
  }

  async update(id: string, input: UpdateUserInput, actor: SessionUser): Promise<PublicUser> {
    const user = await this.findOrFail(id)

    // Trava de seguranca: ninguem rebaixa ou desativa a propria conta por acidente.
    if (user.id === actor.id && (input.role !== undefined || input.isActive === false)) {
      throw new ForbiddenException('Nao e possivel alterar o proprio papel ou desativar-se')
    }

    // Nao deixa o sistema ficar sem nenhum administrador ativo.
    const perdeAdmin =
      user.role === 'ADMIN' && (input.isActive === false || (input.role && input.role !== 'ADMIN'))
    if (perdeAdmin) await this.assertNotLastActiveAdmin(user.id)

    // Alterar papel ou desativar invalida as sessoes ativas do usuario.
    const revokeSessions = input.role !== undefined || input.isActive === false

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(revokeSessions ? { tokenVersion: { increment: 1 } } : {}),
      },
    })

    this.logger.log(`Usuario ${updated.email} alterado por ${actor.email}`)
    return toPublicUser(updated, await this.validadeProvisoriaHoras())
  }

  async deactivate(id: string, actor: SessionUser): Promise<PublicUser> {
    return this.update(id, { isActive: false }, actor)
  }

  /**
   * Admin define nova senha para outro usuario. Invalida as sessoes ativas dele:
   * troca de senha tem de derrubar quem estava logado.
   */
  async resetPassword(id: string, newPassword: string, actor: SessionUser): Promise<PublicUser> {
    const user = await this.findOrFail(id)

    if (user.provider !== 'local') {
      throw new ConflictException(
        `Senha deste usuario e gerenciada pelo provider "${user.provider}" e nao pode ser trocada aqui`,
      )
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(newPassword),
        // Senha definida por terceiro e sempre provisoria: independente do
        // parametro, o dono da conta tem de troca-la no proximo acesso.
        mustChangePassword: true,
        // Reinicia o prazo da provisoria e libera bloqueio por tentativas:
        // emitir senha nova e, na pratica, liberar o acesso de novo.
        provisionalPasswordAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    })

    this.logger.log(`Senha de ${updated.email} redefinida por ${actor.email}`)
    return toPublicUser(updated, await this.validadeProvisoriaHoras())
  }

  /**
   * Libera manualmente uma conta bloqueada por tentativas, sem esperar o prazo.
   * Nao mexe na senha: quem esqueceu a senha precisa de resetPassword.
   */
  async unlock(id: string, actor: SessionUser): Promise<PublicUser> {
    const user = await this.findOrFail(id)

    const updated = await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })

    this.logger.log(`Conta ${user.email} desbloqueada por ${actor.email}`)
    return toPublicUser(updated, await this.validadeProvisoriaHoras())
  }

  private async validadeProvisoriaHoras(): Promise<number> {
    return this.parameters.getNumber('SENHA_PROVISORIA_VALIDADE_HORAS', 0)
  }

  /**
   * Exclusao definitiva. Preferir desativar — o registro inativo preserva o
   * historico de "quem fez o que". A exclusao existe para erro de cadastro.
   */
  async remove(id: string, actor: SessionUser): Promise<void> {
    const user = await this.findOrFail(id)

    if (user.id === actor.id) {
      throw new ForbiddenException('Nao e possivel excluir a propria conta')
    }
    if (user.role === 'ADMIN') await this.assertNotLastActiveAdmin(user.id)

    await this.prisma.user.delete({ where: { id } })
    this.logger.warn(`Usuario ${user.email} EXCLUIDO por ${actor.email}`)
  }

  private async assertNotLastActiveAdmin(excludeId: string): Promise<void> {
    const outros = await this.prisma.user.count({
      where: { role: 'ADMIN', isActive: true, id: { not: excludeId } },
    })
    if (outros === 0) {
      throw new ForbiddenException(
        'Esta e a unica conta de administrador ativa. Promova outro usuario antes de continuar.',
      )
    }
  }

  private async findOrFail(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException('Usuario nao encontrado')
    return user
  }
}

/**
 * Barreira unica entre o registro do banco e o que sai na API.
 * `validadeHoras` vem do Configurador: o servidor calcula o vencimento da
 * provisoria para a tela nao precisar repetir a regra.
 */
function toPublicUser(user: User, validadeHoras = 0): PublicUser {
  const vencimentoProvisoria =
    user.mustChangePassword && user.provisionalPasswordAt && validadeHoras >= 1
      ? new Date(user.provisionalPasswordAt.getTime() + validadeHoras * 3_600_000)
      : null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    isActive: user.isActive,
    provider: user.provider,
    mustChangePassword: user.mustChangePassword,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    provisionalPasswordExpiresAt: vencimentoProvisoria?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }
}
