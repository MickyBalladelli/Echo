import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { fail, ok } from '../http/api.js'
import { parse } from '../http/validation.js'
import { abuseRateLimit } from '../moderation/rate-limit.js'

const gifSearchSchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).max(10000).default(0)
})

function mapGif(gif) {
  const images = gif?.images || {}
  const url = images.original?.url || images.fixed_width?.url
  const previewUrl = images.fixed_width_downsampled?.url || images.fixed_width?.url || url
  if (!gif?.id || !url) return null
  return {
    id: gif.id,
    title: gif.title || 'GIF',
    url,
    previewUrl
  }
}

export const gifsRouter = Router()

gifsRouter.get('/search', abuseRateLimit('gif-search'), async (request, response, next) => {
  try {
    const input = parse(gifSearchSchema, request.query, 'GIF search')
    if (!env.giphyApiKey) {
      response.json(ok({ configured: false, gifs: [], nextOffset: null }))
      return
    }

    const endpoint = input.q
      ? 'https://api.giphy.com/v1/gifs/search'
      : 'https://api.giphy.com/v1/gifs/trending'
    const params = new URLSearchParams({
      api_key: env.giphyApiKey,
      limit: String(input.limit),
      offset: String(input.offset),
      rating: 'pg-13',
      lang: 'en'
    })
    if (input.q) params.set('q', input.q)

    const providerResponse = await fetch(`${endpoint}?${params}`, {
      headers: { Accept: 'application/json' }
    })
    if (!providerResponse.ok) {
      response.status(502).json(fail('GIF_PROVIDER_ERROR', 'Could not load GIFs'))
      return
    }

    const payload = await providerResponse.json()
    const gifs = (Array.isArray(payload.data) ? payload.data : []).map(mapGif).filter(Boolean)
    const totalCount = Number(payload.pagination?.total_count || 0)
    const nextOffset = input.offset + gifs.length < totalCount
      ? input.offset + gifs.length
      : null
    response.json(ok({ configured: true, gifs, nextOffset }))
  } catch (error) {
    next(error)
  }
})
