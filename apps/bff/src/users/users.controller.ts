import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type PublicUser,
  type ResetPasswordInput,
  type SessionUser,
  type UpdateUserInput,
  type UserListResponse,
} from '@trigo/core'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ZodBody } from '../common/zod-body.pipe'
import { UsersService } from './users.service'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users:read')
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<UserListResponse> {
    return this.usersService.list({
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    })
  }

  @Get(':id')
  @RequirePermission('users:read')
  findOne(@Param('id') id: string): Promise<PublicUser> {
    return this.usersService.findOne(id)
  }

  @Post()
  @RequirePermission('users:write')
  create(@Body(new ZodBody(createUserSchema)) dto: CreateUserInput): Promise<PublicUser> {
    return this.usersService.create(dto)
  }

  @Patch(':id')
  @RequirePermission('users:write')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(updateUserSchema)) dto: UpdateUserInput,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicUser> {
    return this.usersService.update(id, dto, actor)
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermission('users:write')
  resetPassword(
    @Param('id') id: string,
    @Body(new ZodBody(resetPasswordSchema)) dto: ResetPasswordInput,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicUser> {
    return this.usersService.resetPassword(id, dto.newPassword, actor)
  }

  // 200 e nao 201: e alteracao de recurso existente, nao criacao.
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('users:delete')
  deactivate(@Param('id') id: string, @CurrentUser() actor: SessionUser): Promise<PublicUser> {
    return this.usersService.deactivate(id, actor)
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @RequirePermission('users:write')
  unlock(@Param('id') id: string, @CurrentUser() actor: SessionUser): Promise<PublicUser> {
    return this.usersService.unlock(id, actor)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('users:delete')
  remove(@Param('id') id: string, @CurrentUser() actor: SessionUser): Promise<void> {
    return this.usersService.remove(id, actor)
  }
}
