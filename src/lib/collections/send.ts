import { agentControl } from "../postgres/client";
import type { SqlPool } from "../postgres/transaction";
import type { Sender } from "../email/resend";
import { statementPdf, validateStatement } from "../statements/pdf";

/**
 * Deliver approved collections emails: claim (approved -> sending, SKIP LOCKED), build the optional
 * statement from the ledger, send with the message id as idempotency key, then record the outcome.
 * Failures return to the queue until the third attempt. Completion names the claimed attempt, so a late
 * worker cannot overwrite a newer one, and one failed completion does not strand the rest of the batch.
 */
export async function deliverApproved(pool: SqlPool, send: Sender | null, limit = 10) {
  if (!send) return { claimed: 0, sent: 0, failed: 0, configured: false };
  const control = agentControl(pool); const claimed = await control.claimMessages(limit);
  let sent = 0, failed = 0;
  for (const message of claimed) {
    let outcome: Awaited<ReturnType<Sender>>;
    try {
      const attachments = message.attach_statement
        ? [{ filename: `statement-${message.account.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`, content: await statementPdf(validateStatement(await control.messageStatement(message.id))) }]
        : undefined;
      outcome = await send({ to: message.to, subject: message.subject, text: message.body, attachments }, message.id);
    } catch (error) { outcome = { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Delivery failed" }; }
    try { await control.completeMessage(message.id, message.attempts, outcome.ok, outcome.ok ? outcome.id : null, outcome.ok ? null : outcome.error); }
    catch { /* The claim was reclaimed or the database is unavailable; the stale-claim sweep recovers it. */ }
    if (outcome.ok) sent++; else failed++;
  }
  return { claimed: claimed.length, sent, failed, configured: true };
}
