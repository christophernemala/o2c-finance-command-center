import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { riskLabel } from '../lib/skills'
import { hubspot } from '../lib/apiClient'
import { toast } from 'sonner'
import { ExternalLink, RefreshCw } from 'lucide-react'

type Customer = {
  id: string
  code: string
  name: string
  country: string | null
  contact_email: string | null
  credit_limit: number
  credit_limit_currency: string
  risk_score: number
  hubspot_contact_id: string | null
  created_at: string
}

const fmt = (n: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

export default function Customers() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const syncHubSpot = useMutation({
    mutationFn: async (c: Customer) => {
      setSyncingId(c.id)
      const result = await hubspot.upsertContact({
        inputs: [{
          properties: {
            email: c.contact_email ?? '',
            firstname: c.name,
            company: c.name,
            country: c.country ?? '',
          },
          id: c.hubspot_contact_id ?? undefined,
          idProperty: c.hubspot_contact_id ? 'hs_object_id' : undefined,
        }]
      }) as { results?: { id: string }[] }
      // Save returned HubSpot ID back to Supabase
      const hsId = result?.results?.[0]?.id
      if (hsId) {
        await supabase.from('customers').update({ hubspot_contact_id: hsId }).eq('id', c.id)
      }
      return hsId
    },
    onSuccess: (hsId) => {
      setSyncingId(null)
      qc.invalidateQueries({ queryKey: ['customers', tenantId] })
      toast.success(`Synced to HubSpot${hsId ? ` (ID: ${hsId})` : ''}`)
    },
    onError: (err: Error) => {
      setSyncingId(null)
      toast.error(err.message)
    },
  })

  const filtered = customers.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-0.5">Credit limits, risk scores &amp; HubSpot sync</p>
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, code, email…"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Code', 'Name', 'Country', 'Email', 'Credit Limit', 'Risk Score', 'Risk', 'HubSpot', 'Sync'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td></tr>
              ))}
              {filtered.map(c => {
                const { label, color } = riskLabel(c.risk_score)
                const riskCls: Record<string, string> = {
                  Low: 'bg-green-50 text-green-700', Medium: 'bg-amber-50 text-amber-700',
                  High: 'bg-orange-50 text-orange-700', Critical: 'bg-red-50 text-red-700',
                }
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-500">{c.country ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.contact_email ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmt(c.credit_limit, c.credit_limit_currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${c.risk_score}%`,
                              backgroundColor: c.risk_score > 70 ? '#ef4444' : c.risk_score > 40 ? '#f97316' : '#22c55e'
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-slate-600">{c.risk_score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${riskCls[label]}`}>{label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {c.hubspot_contact_id ? (
                        <a
                          href={`https://app.hubspot.com/contacts/contact/${c.hubspot_contact_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Not synced</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => syncHubSpot.mutate(c)}
                        disabled={syncingId === c.id}
                        className="p-1.5 rounded border border-slate-200 hover:bg-orange-50 hover:border-orange-200 transition disabled:opacity-50"
                        title="Sync to HubSpot"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${syncingId === c.id ? 'animate-spin' : ''}`} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No customers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
