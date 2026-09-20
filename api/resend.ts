/**
 * Vercel Serverless Function — Resend email proxy
 * Route: /api/resend
 * RESEND_API_KEY lives only in Vercel backend env.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers['authorization'] ?? ''
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  const key = process.env.RESEND_API_KEY
  if (!key) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  try {
    const { to, subject, html, from = 'O2C Center <ar@yourcompany.com>' } = req.body as {
      to: string | string[]
      subject: string
      html: string
      from?: string
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html }),
    })

    const data = await r.json()
    return res.status(r.status).json(data)
  } catch (err) {
    console.error('[resend proxy]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
