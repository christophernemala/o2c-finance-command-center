/**
 * Vercel Serverless Function — HubSpot proxy
 * Route: /api/hubspot
 * HUBSPOT_ACCESS_TOKEN lives only in Vercel backend env.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const HS_BASE = 'https://api.hubapi.com'

function getToken(): string {
  const t = process.env.HUBSPOT_ACCESS_TOKEN
  if (!t) throw new Error('HUBSPOT_ACCESS_TOKEN not configured')
  return t
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers['authorization'] ?? ''
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { action, payload } = req.body as { action: string; payload: Record<string, unknown> }

    const ROUTES: Record<string, { method: string; path: string }> = {
      upsert_contact: { method: 'POST', path: '/crm/v3/objects/contacts/batch/upsert' },
      create_task:    { method: 'POST', path: '/crm/v3/objects/tasks' },
      get_contact:    { method: 'GET',  path: `/crm/v3/objects/contacts/${payload?.id ?? ''}` },
    }

    const route = ROUTES[action]
    if (!route) return res.status(400).json({ error: `Unknown action: ${action}` })

    const r = await fetch(`${HS_BASE}${route.path}`, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      ...(route.method !== 'GET' ? { body: JSON.stringify(payload) } : {}),
    })

    return res.status(r.status).json(await r.json())
  } catch (err) {
    console.error('[hubspot proxy]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
