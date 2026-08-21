import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordInput,
  type LoginInput,
  type SessionUser,
} from '@trigo/core'
import { ZodBody } from '../common/zod-body.pipe'
import { AuthService } from './auth.service'
import { AllowPasswordChangePending } from './decorators/allow-password-change-pending.decorator'
import { CurrentUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodBody(loginSchema)) dto: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: SessionUser }> {
    const { user, token, maxAgeSeconds } = await this.authService.login(dto)
    response.cookie(SESSION_COOKIE, token, sessionCookieOptions(maxAgeSeconds))
    return { user }
  }

  // Publico de proposito: precisa limpar o cookie mesmo com sessao ja expirada.
  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' })
  }

  /**
   * Liberado na trava de troca obrigatoria: o front precisa ler
   * `mustChangePassword` para saber que tem de levar a tela de troca.
   */
  @AllowPasswordChangePending()
  @Get('me')
  me(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user }
  }

  /**
   * Unica rota de escrita liberada durante a trava — e a saida dela.
   * Devolve cookie novo: o tokenVersion mudou e o antigo acabou de ser revogado.
   */
  @AllowPasswordChangePending()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body(new ZodBody(changePasswordSchema)) dto: ChangePasswordInput,
    @CurrentUser() actor: SessionUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: SessionUser }> {
    const { user, token, maxAgeSeconds } = await this.authService.changePassword(actor.id, dto)
    response.cookie(SESSION_COOKIE, token, sessionCookieOptions(maxAgeSeconds))
    return { user }
  }
}
