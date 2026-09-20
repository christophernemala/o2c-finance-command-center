/**
 * Secure API client for calling Vercel serverless functions.
 * Attaches the user's Supabase JWT as Bearer token so each
 * serverless function can validate the caller is authenticated.
 * API keys (FireCrawl, HuggingFace, Resend, HubSpot) NEVER leave the server.
 */
import { supabase } from './supabase'

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return { Authorization: `Bearer ${session.access_token}` }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err?.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---- FireCrawl ----
export const firecrawl = {
  scrape: (url: string) =>
    post('/api/firecrawl', { action: 'scrape', url, formats: ['markdown'] }),
  search: (query: string, limit = 5) =>
    post('/api/firecrawl', { action: 'search', query, limit }),
  map: (url: string) =>
    post('/api/firecrawl', { action: 'map', url }),
}

// ---- HuggingFace ----
export const hf = {
  classify: (input: string, labels: string[]) =>
    post('/api/huggingface', { action: 'classify', input, labels }),
  narrative: (prompt: string) =>
    post('/api/huggingface', { action: 'narrative', prompt }),
}

// ---- Resend ----
export const email = {
  send: (to: string | string[], subject: string, html: string) =>
    post('/api/resend', { to, subject, html }),
}

// ---- HubSpot ----
export const hubspot = {
  upsertContact: (payload: unknown) =>
    post('/api/hubspot', { action: 'upsert_contact', payload }),
  createTask: (payload: unknown) =>
    post('/api/hubspot', { action: 'create_task', payload }),
}
