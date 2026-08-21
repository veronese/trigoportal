import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * scrypt nativo do Node: sem dependencia com compilacao nativa (node-gyp),
 * o que evita dor de cabeca no Windows e em imagens Docker slim.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64
const SALT_LENGTH = 16
const ALGORITHM = 'scrypt'

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(plain, salt, KEY_LENGTH)
  return `${ALGORITHM}$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [algorithm, saltHex, hashHex] = stored.split('$')
  if (algorithm !== ALGORITHM || !saltHex || !hashHex) return false

  const expected = Buffer.from(hashHex, 'hex')
  const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), KEY_LENGTH)
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
