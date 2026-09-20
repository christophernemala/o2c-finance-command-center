/**
 * Vercel Serverless Function — Firecrawl proxy
 * Route: /api/firecrawl
 *
 * The FIRECRAWL_API_KEY env var lives only in Vercel backend env,
 * NEVER exposed to the client bundle.
 *
 * Accepts: POST { action: 'scrape'|'search'|'map', ...params }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const FC_BASE = 'https://api.firecrawl.dev/v1'

function getKey(): string {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured')
  return key
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Basic auth check: caller must be our own app (verified via Supabase JWT)
  const authHeader = req.headers['authorization'] ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { action, ...params } = req.body as { action: string; [k: string]: unknown }

    const ENDPOINTS: Record<string, string> = {
      scrape: `${FC_BASE}/scrape`,
      search: `${FC_BASE}/search`,
      map:    `${FC_BASE}/map`,
    }

    if (!ENDPOINTS[action]) {
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    const upstream = await fetch(ENDPOINTS[action], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getKey()}`,
      },
      body: JSON.stringify(params),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data })
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('[firecrawl proxy]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
