import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const keyLength = 64
const dummySalt = Buffer.alloc(16)
const dummyHash = scryptSync('echo-invalid-password', dummySalt, keyLength)

export const DUMMY_PASSWORD_HASH = `scrypt$${dummySalt.toString('hex')}$${dummyHash.toString('hex')}`

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derivedKey = await scrypt(password, salt, keyLength)
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derivedKey).toString('hex')}`
}

export async function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, saltHex, hashHex] = encodedHash.split('$')
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false

    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = Buffer.from(await scrypt(password, salt, expected.length))

    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
