import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/**
 * Subscribe to Supabase Realtime on invoices, disputes, and payments.
 * Invalidates relevant TanStack Query caches on any change.
 */
export function useRealtimeSync() {
  const qc = useQueryClient()
  const { tenantId } = useAuth()

  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel(`o2c-realtime-${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['invoices', tenantId] })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'disputes',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['disputes', tenantId] })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_audit_trail',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['audit', tenantId] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, qc])
}
