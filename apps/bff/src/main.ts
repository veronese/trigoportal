import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/http-exception.filter'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  app.use(helmet())
  app.use(cookieParser())
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new HttpExceptionFilter())

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    credentials: true,
  })

  const port = Number(process.env.PORT ?? 3333)
  await app.listen(port)
  new Logger('Bootstrap').log(`BFF ouvindo em http://localhost:${port}/api`)
}

void bootstrap()
