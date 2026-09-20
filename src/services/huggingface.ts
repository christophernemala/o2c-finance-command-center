/**
 * Hugging Face Inference API service
 * Used for: email classification, risk scoring, narrative summaries
 */

const HF_BASE = 'https://api-inference.huggingface.co/models'

async function hfInfer<T = unknown>(model: string, inputs: unknown): Promise<T> {
  const token = import.meta.env.VITE_HUGGINGFACE_API_KEY
  if (!token) throw new Error('HUGGINGFACE_API_KEY not configured')

  const res = await fetch(`${HF_BASE}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs }),
  })

  if (!res.ok) {
    if (res.status === 503) throw new Error('HuggingFace model is loading, retry in 20s')
    const err = await res.json().catch(() => ({}))
    throw new Error(`HuggingFace ${res.status}: ${JSON.stringify(err)}`)
  }

  return res.json()
}

/** Classify an AR email into: promise_to_pay | dispute | query | unrelated */
export async function classifyAREmail(emailBody: string): Promise<{
  label: 'promise_to_pay' | 'dispute' | 'query' | 'unrelated'
  score: number
}> {
  const result = await hfInfer<Array<Array<{ label: string; score: number }>>>(
    'facebook/bart-large-mnli',
    {
      text: emailBody,
      candidate_labels: ['promise to pay', 'invoice dispute', 'general query', 'unrelated'],
    }
  )
  // BART NLI returns scores array
  const top = (result[0] ?? []).reduce((a, b) => (a.score > b.score ? a : b), { label: '', score: 0 })
  const labelMap: Record<string, 'promise_to_pay' | 'dispute' | 'query' | 'unrelated'> = {
    'promise to pay': 'promise_to_pay',
    'invoice dispute': 'dispute',
    'general query': 'query',
    unrelated: 'unrelated',
  }
  return { label: labelMap[top.label] ?? 'unrelated', score: top.score }
}

/** Generate a plain-English AR narrative summary */
export async function generateARNarrative(context: string): Promise<string> {
  const result = await hfInfer<[{ generated_text: string }]>(
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    `[INST] You are an AR finance analyst. Write a concise 3-sentence executive summary of the following AR status. Output only the summary, no preamble.\n\n${context} [/INST]`
  )
  return result[0]?.generated_text?.split('[/INST]').at(-1)?.trim() ?? ''
}
