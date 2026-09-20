import { useMutation } from '@tanstack/react-query'
import { AgentOrchestrator } from '../agents/AgentOrchestrator'
import { useAuth } from '../lib/auth'
import { toast } from 'sonner'

export function useCollectionsAgent() {
  const { tenantId } = useAuth()

  return useMutation({
    mutationFn: async (invoice: Parameters<AgentOrchestrator['runCollectionsAgent']>[0]) => {
      if (!tenantId) throw new Error('No tenant')
      const agent = new AgentOrchestrator(tenantId, 'CollectionsAgent')
      await agent.runCollectionsAgent(invoice)
    },
    onSuccess: () => toast.success('Collection action dispatched'),
    onError: (e: Error) => toast.error(`Agent error: ${e.message}`),
  })
}

export function useEmailClassifierAgent() {
  const { tenantId } = useAuth()

  return useMutation({
    mutationFn: async ({ body, emailId }: { body: string; emailId: string }) => {
      if (!tenantId) throw new Error('No tenant')
      const agent = new AgentOrchestrator(tenantId, 'EmailClassifierAgent')
      return agent.classifyEmail(body, emailId)
    },
    onSuccess: (result) => toast.success(`Classified: ${result.label} (${(result.score * 100).toFixed(0)}%)`),
    onError: (e: Error) => toast.error(`Agent error: ${e.message}`),
  })
}

export function useResearchAgent() {
  const { tenantId } = useAuth()

  return useMutation({
    mutationFn: async ({ customerName, customerId }: { customerName: string; customerId: string }) => {
      if (!tenantId) throw new Error('No tenant')
      const agent = new AgentOrchestrator(tenantId, 'ResearchAgent')
      return agent.researchCustomer(customerName, customerId)
    },
    onSuccess: () => toast.success('Research complete'),
    onError: (e: Error) => toast.error(`Research error: ${e.message}`),
  })
}
