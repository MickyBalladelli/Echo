const blobUrls = new Map()

export function isGifMedia(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return /\.gif$/i.test(parsed.pathname) || /(?:giphy|tenor|gifdb)\./i.test(parsed.hostname)
  } catch {
    return /\.gif(?:$|[?#])/i.test(url)
  }
}

export function removeAttachedGifUrl(body, mediaUrl) {
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text || !isGifMedia(mediaUrl)) return text
  return text.split(mediaUrl).join('').replace(/[ \t]+/g, ' ').trim()
}

export function mediaSrc(url) {
  if (!url || typeof url !== 'string') return undefined
  if (!url.startsWith('data:image/')) return url

  const cached = blobUrls.get(url)
  if (cached) return cached

  try {
    const comma = url.indexOf(',')
    if (comma < 0) return undefined
    const mime = url.slice(5, comma).split(';')[0]
    const binary = atob(url.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime || 'image/jpeg' }))
    blobUrls.set(url, blobUrl)
    return blobUrl
  } catch {
    return undefined
  }
}
