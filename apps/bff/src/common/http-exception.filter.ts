import {
  ArgumentsHost,
  Catch, 
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'

/** Normaliza o corpo de erro no formato que o api-client espera (ApiErrorBody). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http')

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()
      const body =
        typeof payload === 'string'
          ? { statusCode: status, message: payload }
          : { statusCode: status, ...(payload as Record<string, unknown>) }
      response.status(status).json(body)
      return
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno. Consulte o log do servidor.',
    })
  }
}
