import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function useCustomers() {
  const { tenantId } = useAuth()
  return useQuery({
    queryKey: ['customers', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('active', true)
        .order('risk_score', { ascending: false })
      if (error) throw error
      return data
    },
  })
}
