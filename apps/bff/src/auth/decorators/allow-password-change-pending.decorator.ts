import { SetMetadata } from '@nestjs/common'

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'trigo:allowPasswordChangePending'

/**
 * Libera a rota para sessao travada por troca de senha obrigatoria.
 *
 * Use com parcimonia: apenas o que o usuario precisa para SAIR da trava
 * (trocar a senha, ler a propria sessao, deslogar). Todo o resto deve
 * continuar recusando, senao a obrigatoriedade vira sugestao.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true)
