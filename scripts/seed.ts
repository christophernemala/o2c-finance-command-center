/**
 * Seed script for local dev / staging
 * Run: npx tsx scripts/seed.ts
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from '@supabase/supabase-js'
import { daysPastDue, agingBucket, eclProvision } from '../src/lib/skills'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role for seeding only
)

const TENANT_NAME = 'Acme Corp'
const TENANT_SLUG = 'acme'

async function main() {
  console.log('Seeding O2C data...')

  // Create tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .upsert({ name: TENANT_NAME, slug: TENANT_SLUG }, { onConflict: 'slug' })
    .select()
    .single()
  if (tErr) throw tErr
  console.log('Tenant:', tenant.id)

  // Create customers
  const customers = [
    { name: 'Gulf Trading LLC', code: 'GT001', credit_limit: 500000, risk_score: 25, country: 'AE', contact_email: 'ar@gulftrading.ae' },
    { name: 'Al Farhan Group', code: 'AF002', credit_limit: 250000, risk_score: 65, country: 'AE', contact_email: 'finance@alfarhan.com' },
    { name: 'Emirates Retail Co', code: 'ER003', credit_limit: 1000000, risk_score: 15, country: 'AE', contact_email: 'payments@emiratesretail.ae' },
    { name: 'Riyadh Industries', code: 'RI004', credit_limit: 750000, risk_score: 80, country: 'SA', contact_email: 'ap@riyadhind.sa' },
    { name: 'Cairo Distribution', code: 'CD005', credit_limit: 180000, risk_score: 55, country: 'EG', contact_email: 'ar@cairodist.eg' },
  ].map(c => ({ ...c, tenant_id: tenant.id, credit_limit_currency: 'AED' }))

  const { data: createdCustomers, error: cErr } = await supabase
    .from('customers')
    .upsert(customers, { onConflict: 'tenant_id,code' })
    .select()
  if (cErr) throw cErr
  console.log('Customers:', createdCustomers?.length)

  // Create invoices across aging buckets
  const invoiceTemplates = [
    { customerIdx: 0, amount: 85000, dpd: 0, currency: 'AED' },
    { customerIdx: 0, amount: 42000, dpd: 15, currency: 'AED' },
    { customerIdx: 1, amount: 120000, dpd: 45, currency: 'AED' },
    { customerIdx: 1, amount: 67500, dpd: 75, currency: 'USD' },
    { customerIdx: 2, amount: 210000, dpd: 0, currency: 'AED' },
    { customerIdx: 2, amount: 55000, dpd: 95, currency: 'AED' },
    { customerIdx: 3, amount: 430000, dpd: 135, currency: 'SAR' },
    { customerIdx: 3, amount: 89000, dpd: 60, currency: 'AED' },
    { customerIdx: 4, amount: 38000, dpd: 30, currency: 'EGP' },
    { customerIdx: 4, amount: 72000, dpd: 110, currency: 'AED' },
  ]

  const fxRates: Record<string, number> = { USD: 3.67, SAR: 0.978, EGP: 0.071 }

  const invoices = invoiceTemplates.map((t, i) => {
    const customer = createdCustomers![t.customerIdx]
    const today = new Date()
    const dueDate = new Date(today)
    dueDate.setDate(today.getDate() - t.dpd)
    const dpd = daysPastDue(dueDate.toISOString().split('T')[0])
    const bucket = agingBucket(dpd)
    const amountAed = t.currency === 'AED' ? t.amount : Math.round(t.amount * (fxRates[t.currency] ?? 1))
    const ecl = eclProvision(amountAed, bucket)
    const status = dpd === 0 ? 'issued' as const : dpd > 120 ? 'overdue' as const : dpd > 0 ? 'overdue' as const : 'issued' as const

    return {
      tenant_id: tenant.id,
      customer_id: customer.id,
      invoice_number: `INV-2026-${String(i + 1).padStart(4, '0')}`,
      amount: t.amount,
      currency: t.currency,
      amount_aed: amountAed,
      due_date: dueDate.toISOString().split('T')[0],
      issue_date: new Date(dueDate.getTime() - 30 * 86400000).toISOString().split('T')[0],
      status,
      days_past_due: dpd,
      aging_bucket: bucket,
      ecl_provision: ecl,
      outstanding: amountAed - (i % 3 === 0 ? Math.round(amountAed * 0.3) : 0),
    }
  })

  const { error: iErr } = await supabase
    .from('invoices')
    .upsert(invoices, { onConflict: 'tenant_id,invoice_number' })
  if (iErr) throw iErr
  console.log('Invoices: created', invoices.length)

  console.log('Seed complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
