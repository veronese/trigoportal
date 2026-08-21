import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Logger } from '@nestjs/common'

/**
 * Cifra os parametros do tipo SECRET antes de gravar.
 *
 * Sem isso, a senha de servico do Protheus ficaria legivel para qualquer um com
 * acesso de leitura ao banco — backup, replica, dump de suporte. AES-256-GCM da
 * confidencialidade e autenticidade: valor adulterado falha na decifragem em vez
 * de virar lixo silencioso.
 *
 * A chave vive no .env (PARAMETER_ENCRYPTION_KEY), NUNCA no banco: guardar a
 * chave junto do dado cifrado nao protege de nada.
 */
const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'enc:v1'
const IV_BYTES = 12
const KEY_BYTES = 32

export class SecretCipher {
  private readonly logger = new Logger(SecretCipher.name)

  private constructor(private readonly key: Buffer | null) {}

  static fromEnv(raw: string | undefined): SecretCipher {
    if (!raw || raw.trim() === '') return new SecretCipher(null)

    const key = Buffer.from(raw.trim(), 'hex')
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `PARAMETER_ENCRYPTION_KEY deve ter ${KEY_BYTES} bytes em hexadecimal ` +
          `(${KEY_BYTES * 2} caracteres). Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      )
    }
    return new SecretCipher(key)
  }

  get isEnabled(): boolean {
    return this.key !== null
  }

  encrypt(plain: string): string {
    if (!this.key) {
      throw new Error(
        'PARAMETER_ENCRYPTION_KEY nao configurada: nao e possivel gravar parametro do tipo SECRET.',
      )
    }

    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return [PREFIX, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(
      ':',
    )
  }

  /**
   * Valor sem o prefixo `enc:v1` e tratado como legado em texto claro: devolve
   * como esta e avisa no log, para nao derrubar ambiente que gravou antes da
   * cifragem existir. A proxima escrita ja grava cifrado.
   */
  decrypt(stored: string): string {
    if (!stored.startsWith(`${PREFIX}:`)) {
      this.logger.warn(
        'Parametro SECRET encontrado em texto claro (gravado antes da cifragem). Regrave o valor para cifra-lo.',
      )
      return stored
    }

    if (!this.key) {
      throw new Error(
        'Parametro SECRET esta cifrado, mas PARAMETER_ENCRYPTION_KEY nao esta configurada.',
      )
    }

    // O proprio prefixo tem dois pedacos ("enc" e "v1"), entao o iv comeca no
    // indice 2. Base64 nao contem ':', logo o split e seguro.
    const partes = stored.split(':')
    const [ivB64, tagB64, payloadB64] = [partes[2], partes[3], partes[4]]
    if (partes.length !== 5 || !ivB64 || !tagB64 || !payloadB64) {
      throw new Error('Parametro SECRET com formato invalido.')
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

    return Buffer.concat([
      decipher.update(Buffer.from(payloadB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }
}
