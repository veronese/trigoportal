import { Global, Module } from '@nestjs/common'
import { ParametersController } from './parameters.controller'
import { ParametersService } from './parameters.service'

/**
 * Global: qualquer modulo pode injetar ParametersService para ler parametro
 * sem precisar importar o modulo. E o mesmo papel da PrismaModule.
 */
@Global()
@Module({
  controllers: [ParametersController],
  providers: [ParametersService],
  exports: [ParametersService],
})
export class ParametersModule {}
