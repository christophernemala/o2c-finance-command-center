/** Server-only Resend settings. Missing values mean approved messages stay queued; nothing is simulated. */
export interface EmailConfig { apiKey: string; from: string }
export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim(); const from = env.COLLECTIONS_FROM?.trim();
  if (!apiKey || !from || !/^[^<>\r\n]{0,80}<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/.test(from)) return null;
  return { apiKey, from };
}
export interface OutgoingEmail { to: string; subject: string; text: string; attachments?: { filename: string; content: Uint8Array }[] }
export type Sender = (message: OutgoingEmail, idempotencyKey: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

/** Resend REST API through fetch. The message id is the idempotency key, so a retry never sends twice. */
export function resendSender(config: EmailConfig, fetcher: typeof fetch = fetch): Sender {
  return async (message, idempotencyKey) => {
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text,
          attachments: message.attachments?.map(file => ({ filename: file.filename, content: Buffer.from(file.content).toString("base64") })) }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
      if (!response.ok || typeof body.id !== "string") return { ok: false, error: `Resend ${response.status}: ${(body.message ?? body.name ?? "request failed").slice(0, 300)}` };
      return { ok: true, id: body.id };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Email provider unreachable" }; }
  };
}
