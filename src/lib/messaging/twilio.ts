import type { Sender } from "../email/resend";
export type PhoneChannel = "sms" | "whatsapp";
export interface TwilioConfig { accountSid: string; authToken: string; from: string }
const phone = /^\+[1-9]\d{7,14}$/;
/** Server-only credentials. Each channel is enabled only when its own sender is configured. */
export function twilioConfig(env: Record<string, string | undefined> = process.env, channel: PhoneChannel): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim(); const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = (channel === "sms" ? env.TWILIO_SMS_FROM : env.TWILIO_WHATSAPP_FROM)?.trim();
  if (!accountSid || !/^AC[0-9a-f]{32}$/i.test(accountSid) || !authToken || !from) return null;
  if (channel === "sms" ? !phone.test(from) : !from.startsWith("whatsapp:") || !phone.test(from.slice(9))) return null;
  return { accountSid, authToken, from };
}
/** Twilio accepts a message for delivery; this is not a delivery receipt. Never retry this POST. */
export function twilioSender(config: TwilioConfig, channel: PhoneChannel, fetcher: typeof fetch = fetch): Sender {
  return async message => {
    if (!phone.test(message.to) || !message.text.trim() || message.text.length > 1600 || message.attachments?.length) {
      return { ok: false, error: "Invalid phone message: E.164 recipient, up to 1600 characters and no attachments required" };
    }
    const unknown = "Twilio outcome unknown: reconcile in Twilio before proposing again; automatic retry disabled";
    try {
      const response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
        method: "POST", redirect: "error",
        headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: config.from, To: `${channel === "whatsapp" ? "whatsapp:" : ""}${message.to}`, Body: message.text }).toString(),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => ({})) as { sid?: unknown; code?: unknown };
      if (response.ok && typeof body.sid === "string" && /^SM[0-9a-f]{32}$/i.test(body.sid)) return { ok: true, id: body.sid };
      // Keep provider text (which can contain customer data) and credentials out of stored errors.
      if (response.status >= 400 && response.status < 500) return { ok: false, error: `Twilio rejected request (HTTP ${response.status}${typeof body.code === "number" ? `, code ${body.code}` : ""}); check sender, consent and WhatsApp service window. Automatic retry disabled` };
      return { ok: false, error: unknown };
    } catch { return { ok: false, error: unknown }; }
  };
}
