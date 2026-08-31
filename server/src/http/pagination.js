import { HttpError } from './errors.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function encodeCursor({ createdAt, id, score }) {
  const cursor = { createdAt: new Date(createdAt).toISOString(), id }
  if (score !== undefined) cursor.score = Number(score)
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(value) {
  if (!value) return null

  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string' || !uuidPattern.test(decoded.id)) {
      throw new Error('Invalid cursor shape')
    }

    const date = new Date(decoded.createdAt)
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid cursor date')
    }

    const score = decoded.score === undefined ? null : Number(decoded.score)
    if (score !== null && !Number.isFinite(score)) throw new Error('Invalid cursor score')

    return { createdAt: date.toISOString(), id: decoded.id, score }
  } catch {
    throw new HttpError(400, 'INVALID_CURSOR', 'Invalid pagination cursor')
  }
}
