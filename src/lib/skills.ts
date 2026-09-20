/**
 * Deterministic finance engine — sourced directly from SKILLS.md
 * Never modified by agents without explicit spec change
 */

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '91_120' | 'over_120'

/** Compute days past due from due date */
export function daysPastDue(dueDateStr: string): number {
  const due = new Date(dueDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000)
  return Math.max(0, diff)
}

/** Assign aging bucket from days past due */
export function agingBucket(dpd: number): AgingBucket {
  if (dpd === 0) return 'current'
  if (dpd <= 30) return '1_30'
  if (dpd <= 60) return '31_60'
  if (dpd <= 90) return '61_90'
  if (dpd <= 120) return '91_120'
  return 'over_120'
}

/** IFRS 9 ECL provision rates per bucket */
export const ECL_RATES: Record<AgingBucket, number> = {
  current: 0.005,
  '1_30': 0.02,
  '31_60': 0.05,
  '61_90': 0.10,
  '91_120': 0.25,
  over_120: 0.50,
}

/** Calculate ECL provision amount */
export function eclProvision(outstanding: number, bucket: AgingBucket): number {
  return Math.round(outstanding * ECL_RATES[bucket] * 100) / 100
}

/** Convert any currency to AED using latest FX rate */
export function toAED(amount: number, currency: string, rates: Record<string, number>): number {
  if (currency === 'AED') return amount
  const rate = rates[currency]
  if (!rate) throw new Error(`FX rate not found for ${currency}`)
  return Math.round(amount * rate * 100) / 100
}

/** Risk score 0-100 from credit usage, DPD history, and dispute rate */
export function riskScore(params: {
  creditUsagePct: number   // 0-1
  avgDpd: number           // average days past due
  disputeRate: number      // 0-1
  paymentAdherencePct: number // 0-1, higher=better
}): number {
  const { creditUsagePct, avgDpd, disputeRate, paymentAdherencePct } = params
  const score =
    (creditUsagePct * 30) +
    (Math.min(avgDpd / 120, 1) * 40) +
    (disputeRate * 20) +
    ((1 - paymentAdherencePct) * 10)
  return Math.round(Math.min(100, Math.max(0, score)))
}

/** AR totals by aging bucket */
export function agingTotals(invoices: Array<{ outstanding: number; aging_bucket: AgingBucket }>) {
  const totals: Record<AgingBucket, number> = {
    current: 0, '1_30': 0, '31_60': 0,
    '61_90': 0, '91_120': 0, over_120: 0,
  }
  for (const inv of invoices) {
    totals[inv.aging_bucket] = (totals[inv.aging_bucket] || 0) + inv.outstanding
  }
  return totals
}

/** Format AED currency */
export function formatAED(amount: number): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Collection priority score — higher = contact first */
export function collectionPriority(invoice: {
  outstanding: number
  days_past_due: number
  risk_score: number
}): number {
  return (
    (invoice.outstanding / 1000) * 0.4 +
    invoice.days_past_due * 0.4 +
    invoice.risk_score * 0.2
  )
}
