import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { IDENTITY_PROVIDERS } from './identity/identity-provider'
import { LocalIdentityProvider } from './identity/local.identity-provider'
import { parseDuration } from './session-cookie'

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET')
        if (!secret || secret === 'troque-este-valor') {
          throw new Error('JWT_SECRET nao configurado. Copie apps/bff/.env.example para .env')
        }
        return {
          secret,
          signOptions: { expiresIn: parseDuration(config.get<string>('JWT_EXPIRES_IN')) },
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalIdentityProvider,
    {
      // A ordem do array e a ordem de tentativa. Providers externos entram aqui na fase 2.
      provide: IDENTITY_PROVIDERS,
      inject: [LocalIdentityProvider],
      useFactory: (local: LocalIdentityProvider) => [local],
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
