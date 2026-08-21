import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { ZodSchema } from 'zod'

/**
 * Valida o body com o MESMO schema Zod usado pelo front (packages/core).
 * Uso: @Body(new ZodBody(createUserSchema)) dto: CreateUserInput
 */
export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException({
        message: 'Dados invalidos',
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      })
    }
    return result.data
  }
}
