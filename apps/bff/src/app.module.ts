import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { PermissionsGuard } from './auth/guards/permissions.guard'
import { HealthController } from './common/health.controller'
import { DatabaseModule } from './database/database.module'
import { DiagnosticsModule } from './diagnostics/diagnostics.module'
import { ParametersModule } from './parameters/parameters.module'
import { PrismaModule } from './prisma/prisma.module'
import { ProductsModule } from './products/products.module'
import { ProtheusDbModule } from './protheus-db/protheus-db.module'
import { ProtheusModule } from './protheus/protheus.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // Configurador: global, porque qualquer modulo le parametro.
    ParametersModule,
    AuthModule,
    UsersModule,
    // Diagnostico do banco, em leitura, para o Configurador.
    DatabaseModule,
    // Diagnostico do sistema: runtime, arquivos, dependencias, atualizacoes.
    DiagnosticsModule,
    // Encapsula o REST do Protheus. Nenhum modulo fala com o ERP direto.
    ProtheusModule,
    // Conexao direta com o banco do ERP, em leitura, para o ETL.
    ProtheusDbModule,
    // Cadastro de produtos espelhado do ERP.
    ProductsModule,
    // Modulos novos entram aqui. Padrao: um modulo por dominio de negocio.
  ],
  controllers: [HealthController],
  providers: [
    // Ordem importa: autentica, depois autoriza.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
