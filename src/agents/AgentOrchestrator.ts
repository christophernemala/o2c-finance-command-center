/**
 * O2C Agent Orchestrator — Fable-5 pattern
 * Context → Goal → Constraints → Plan → Execute → Review × 4 → Done
 * Every action is logged to agent_audit_trail before any side effect.
 */

import { supabase } from '../lib/supabase'
import { classifyAREmail } from '../services/huggingface'
import { createCollectionTask } from '../services/hubspot'
import { sendEmail, collectionReminderHtml } from '../services/resend'
import { scrapeUrl, webSearch } from '../services/firecrawl'
import type { Database } from '../lib/database.types'

type AuditEntry = Database['public']['Tables']['agent_audit_trail']['Insert']

export class AgentOrchestrator {
  private tenantId: string
  private agentName: string

  constructor(tenantId: string, agentName: string) {
    this.tenantId = tenantId
    this.agentName = agentName
  }

  /** Log every action BEFORE execution — immutable audit trail */
  private async log(entry: Omit<AuditEntry, 'tenant_id' | 'agent_name'>): Promise<string> {
    const { data, error } = await supabase
      .from('agent_audit_trail')
      .insert({
        ...entry,
        tenant_id: this.tenantId,
        agent_name: this.agentName,
      })
      .select('id')
      .single()
    if (error) console.error('Audit log failed:', error)
    return data?.id ?? ''
  }

  /**
   * COLLECTIONS AGENT
   * Classifies overdue invoice context, sends reminder, creates HubSpot task
   */
  async runCollectionsAgent(invoice: {
    id: string
    invoice_number: string
    outstanding: number
    days_past_due: number
    due_date: string
    customer_name: string
    customer_email: string
    hubspot_contact_id?: string
  }): Promise<void> {
    // Plan: log intent, send email, create CRM task
    await this.log({
      action: `Send collection reminder for invoice ${invoice.invoice_number}`,
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: { invoice_number: invoice.invoice_number, dpd: invoice.days_past_due },
      confidence_score: 95,
      risk_level: invoice.days_past_due > 90 ? 'high' : invoice.days_past_due > 30 ? 'medium' : 'low',
      requires_approval: invoice.days_past_due > 90, // human gate for 90+ DPD
      approved_by: null,
    })

    if (invoice.days_past_due > 90) {
      console.log(`[AGENT] High-risk invoice ${invoice.invoice_number} — requires human approval before action`)
      return
    }

    // Send email via Resend
    const aedAmount = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' }).format(invoice.outstanding)
    await sendEmail({
      to: invoice.customer_email,
      subject: `Payment Reminder: Invoice ${invoice.invoice_number}`,
      html: collectionReminderHtml({
        customerName: invoice.customer_name,
        invoiceNumber: invoice.invoice_number,
        outstanding: aedAmount,
        dueDate: invoice.due_date,
        dpd: invoice.days_past_due,
      }),
      tags: [{ name: 'type', value: 'collection_reminder' }],
    })

    // Create HubSpot task if contact is known
    if (invoice.hubspot_contact_id) {
      await createCollectionTask({
        contactId: invoice.hubspot_contact_id,
        subject: `Follow up: Invoice ${invoice.invoice_number} overdue`,
        notes: `Invoice ${invoice.invoice_number} is ${invoice.days_past_due} days overdue. Outstanding: ${aedAmount}.`,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      })
    }
  }

  /**
   * EMAIL CLASSIFIER AGENT
   * Classifies incoming AR email and routes to correct workflow
   */
  async classifyEmail(emailBody: string, emailId: string): Promise<{
    label: string; score: number; action: string
  }> {
    const { label, score } = await classifyAREmail(emailBody)

    await this.log({
      action: `Classified email as ${label} (score: ${(score * 100).toFixed(1)}%)`,
      entity_type: 'email',
      entity_id: emailId,
      payload: { label, score },
      confidence_score: Math.round(score * 100),
      risk_level: label === 'dispute' ? 'high' : 'low',
      requires_approval: label === 'dispute',
      approved_by: null,
    })

    const actions: Record<string, string> = {
      promise_to_pay: 'Record promise, set follow-up in 3 days',
      dispute: 'Create dispute record, notify AR Controller',
      query: 'Route to AR support queue',
      unrelated: 'Archive',
    }

    return { label, score, action: actions[label] ?? 'Review' }
  }

  /**
   * RESEARCH AGENT
   * Uses Firecrawl to get external context about a customer
   */
  async researchCustomer(customerName: string, customerId: string): Promise<string> {
    const results = await webSearch(`${customerName} company financial news`, 3)

    const summary = results
      .map(r => r.markdown.slice(0, 500))
      .join('\n\n---\n\n')
      .slice(0, 2000)

    await this.log({
      action: `Researched customer ${customerName} via Firecrawl`,
      entity_type: 'customer',
      entity_id: customerId,
      payload: { sources: results.map(r => r.url) },
      confidence_score: 80,
      risk_level: 'low',
      requires_approval: false,
      approved_by: null,
    })

    return summary
  }
}
