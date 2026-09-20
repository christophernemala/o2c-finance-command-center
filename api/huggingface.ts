/**
 * Vercel Serverless Function — HuggingFace proxy
 * Route: /api/huggingface
 *
 * Supported actions:
 *   classify  → facebook/bart-large-mnli (email classification)
 *   narrative → mistralai/Mixtral-8x7B-Instruct-v0.1 (AR narrative generation)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const HF_API = 'https://api-inference.huggingface.co/models'

function getKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY
  if (!key) throw new Error('HUGGINGFACE_API_KEY not configured')
  return key
}

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getKey()}`,
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers['authorization'] ?? ''
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { action, input, labels, prompt } = req.body as {
      action: 'classify' | 'narrative'
      input?: string
      labels?: string[]
      prompt?: string
    }

    if (action === 'classify') {
      if (!input || !labels?.length) return res.status(400).json({ error: 'input and labels required' })
      const r = await fetch(`${HF_API}/facebook/bart-large-mnli`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ inputs: input, parameters: { candidate_labels: labels } }),
      })
      return res.status(r.status).json(await r.json())
    }

    if (action === 'narrative') {
      if (!prompt) return res.status(400).json({ error: 'prompt required' })
      const r = await fetch(`${HF_API}/mistralai/Mixtral-8x7B-Instruct-v0.1`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 400, return_full_text: false },
        }),
      })
      return res.status(r.status).json(await r.json())
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('[huggingface proxy]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
