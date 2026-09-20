/**
 * Resend email service — server-side only
 * Never expose RESEND_API_KEY in client bundles
 */

export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
}

export interface ResendResponse {
  id: string
  from: string
  to: string[]
  created_at: string
}

export async function sendEmail(payload: EmailPayload): Promise<ResendResponse> {
  const apiKey = import.meta.env.VITE_RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from ?? 'O2C Command Center <noreply@o2c.finance>',
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.replyTo,
      tags: payload.tags,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`)
  }

  return res.json()
}

/** Render collection reminder email */
export function collectionReminderHtml(params: {
  customerName: string
  invoiceNumber: string
  outstanding: string
  dueDate: string
  dpd: number
}): string {
  const { customerName, invoiceNumber, outstanding, dueDate, dpd } = params
  return `
    <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; color: #1e293b;">
      <div style="background: #1A56DB; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <span style="color: white; font-weight: 600; font-size: 16px;">O2C Finance</span>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin-bottom: 16px;">Dear <strong>${customerName}</strong>,</p>
        <p style="margin-bottom: 16px;">
          Invoice <strong>${invoiceNumber}</strong> of <strong>${outstanding}</strong> was due on <strong>${dueDate}</strong>.
          ${dpd > 0 ? `It is currently <strong style="color: #E02424;">${dpd} day(s) overdue</strong>.` : 'It is due today.'}
        </p>
        <p style="margin-bottom: 24px;">Please arrange payment at your earliest convenience or contact us to discuss.</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; font-size: 13px; color: #64748b;">
          Invoice: ${invoiceNumber} &bull; Amount: ${outstanding}
        </div>
      </div>
    </div>
  `
}
