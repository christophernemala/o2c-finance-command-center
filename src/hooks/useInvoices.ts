import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { agingTotals } from '../lib/skills'

export function useInvoices(filters?: { status?: string; aging_bucket?: string }) {
  const { tenantId } = useAuth()
  return useQuery({
    queryKey: ['invoices', tenantId, filters],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('invoices')
        .select(`*, customers(id, name, code, risk_score, contact_email)`)
        .eq('tenant_id', tenantId!)
        .order('days_past_due', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      if (filters?.aging_bucket) q = q.eq('aging_bucket', filters.aging_bucket)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useAgingTotals() {
  const { data: invoices } = useInvoices()
  if (!invoices) return null
  return agingTotals(invoices)
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid', outstanding: 0 })
        .eq('id', invoiceId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
