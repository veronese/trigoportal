import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'trigo:isPublic'

/** Marca a rota como acessivel sem sessao. Todo o resto exige autenticacao. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
