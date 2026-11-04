import { agentControl } from "../postgres/client";
import type { SqlPool } from "../postgres/transaction";
import type { Sender } from "../email/resend";
import { statementPdf, validateStatement } from "../statements/pdf";

export type MessageChannel = "email" | "sms" | "whatsapp";
export type ChannelSenders = Partial<Record<MessageChannel, Sender | null>>;

/**
 * Deliver approved collections messages: claim (approved -> sending, SKIP LOCKED), build the optional
 * statement from the ledger, send, then record the outcome. Resend uses the message id as an
 * idempotency key; Twilio sends are never automatically retried. Email failures retry up to three
 * times. Completion names the claimed attempt, so a late
 * worker cannot overwrite a newer one, and one failed completion does not strand the rest of the batch.
 */
export async function deliverApproved(pool: SqlPool, send: Sender | ChannelSenders | null, limit = 10) {
  const senders: ChannelSenders = typeof send === "function" ? { email: send } : send ?? {};
  const channels = (Object.keys(senders) as MessageChannel[]).filter(channel => senders[channel]);
  if (!channels.length) return { claimed: 0, sent: 0, failed: 0, configured: false };
  const control = agentControl(pool); const claimed = await control.claimMessages(limit, channels);
  let sent = 0, failed = 0;
  for (const message of claimed) {
    let outcome: Awaited<ReturnType<Sender>>;
    try {
      const sender = senders[message.channel];
      if (!sender) throw new Error("Channel not configured");
      const attachments = message.channel === "email" && message.attach_statement
        ? [{ filename: `statement-${message.account.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`, content: await statementPdf(validateStatement(await control.messageStatement(message.id))) }]
        : undefined;
      outcome = await sender({ to: message.to, subject: message.subject, text: message.body, attachments }, message.id);
    } catch (error) { outcome = { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Delivery failed" }; }
    try { await control.completeMessage(message.id, message.attempts, outcome.ok, outcome.ok ? outcome.id : null, outcome.ok ? null : outcome.error); }
    catch (error) {
      // The stale-claim sweep marks the message failed; keep the provider id in the logs so it can be reconciled.
      console.error("Collections message completion not recorded", { id: message.id, channel: message.channel, accepted: outcome.ok, provider_id: outcome.ok ? outcome.id : null, error: error instanceof Error ? error.message : error });
    }
    if (outcome.ok) sent++; else failed++;
  }
  return { claimed: claimed.length, sent, failed, configured: true };
}
