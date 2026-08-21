import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import {
  updateCredentialSchema,
  updateParameterSchema,
  type ParameterListResponse,
  type PublicBranding,
  type PublicParameter,
  type SessionUser,
  type UpdateCredentialInput,
  type UpdateParameterInput,
} from '@trigo/core'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { RequirePermission } from '../auth/decorators/require-permission.decorator'
import { ZodBody } from '../common/zod-body.pipe'
import { ParametersService } from './parameters.service'

@Controller('parameters')
export class ParametersController {
  constructor(private readonly parameters: ParametersService) {}

  /**
   * Marca do portal para a tela de login, que roda sem sessao.
   * Devolve apenas a lista branca de PUBLIC_PARAMETER_KEYS — nunca a tabela toda.
   */
  @Public()
  @Get('branding')
  branding(): Promise<PublicBranding> {
    return this.parameters.branding()
  }

  @Get()
  @RequirePermission('settings:read')
  list(): Promise<ParameterListResponse> {
    return this.parameters.list()
  }

  @Patch(':key')
  @RequirePermission('settings:write')
  update(
    @Param('key') key: string,
    @Body(new ZodBody(updateParameterSchema)) dto: UpdateParameterInput,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicParameter> {
    return this.parameters.update(key, dto.value, actor.email)
  }

  /** Usuario e senha juntos, para parametro do tipo CREDENTIAL. */
  @Patch(':key/credential')
  @RequirePermission('settings:write')
  updateCredential(
    @Param('key') key: string,
    @Body(new ZodBody(updateCredentialSchema)) dto: UpdateCredentialInput,
    @CurrentUser() actor: SessionUser,
  ): Promise<PublicParameter> {
    return this.parameters.updateCredential(key, dto, actor.email)
  }

  @Post(':key/reset')
  @HttpCode(200)
  @RequirePermission('settings:write')
  reset(@Param('key') key: string, @CurrentUser() actor: SessionUser): Promise<PublicParameter> {
    return this.parameters.reset(key, actor.email)
  }
}
