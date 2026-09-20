/**
 * Firecrawl web data service
 * Used by agents to pull external context: customer sites, filings, news
 */

const FC_BASE = 'https://api.firecrawl.dev/v1'

async function fcFetch<T>(path: string, body?: unknown): Promise<T> {
  const key = import.meta.env.VITE_FIRECRAWL_API_KEY
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured')

  const res = await fetch(`${FC_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Firecrawl ${res.status}: ${JSON.stringify(err)}`)
  }
  return res.json()
}

/** Scrape a single URL to clean Markdown */
export async function scrapeUrl(url: string): Promise<{ markdown: string; metadata: Record<string, string> }> {
  const data = await fcFetch<{ data: { markdown: string; metadata: Record<string, string> } }>(
    '/scrape',
    { url, formats: ['markdown'], onlyMainContent: true }
  )
  return data.data
}

/** Search the web and get top results as Markdown */
export async function webSearch(query: string, limit = 5): Promise<Array<{ url: string; markdown: string }>> {
  const data = await fcFetch<{ data: Array<{ url: string; markdown: string }> }>(
    '/search',
    { query, limit, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } }
  )
  return data.data ?? []
}

/** Map all pages of a domain for crawling */
export async function mapDomain(url: string): Promise<string[]> {
  const data = await fcFetch<{ links: string[] }>('/map', { url })
  return data.links ?? []
}
