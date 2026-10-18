import { test } from "node:test";
import assert from "node:assert/strict";
import { twilioConfig, twilioSender } from "../src/lib/messaging/twilio";
const env = { TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_AUTH_TOKEN: "test-token", TWILIO_SMS_FROM: "+971501234567", TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886" };
test("Twilio validates server configuration independently for each channel", () => {
  assert.equal(twilioConfig({}, "sms"), null);
  assert.equal(twilioConfig({ ...env, TWILIO_ACCOUNT_SID: "bad" }, "sms"), null);
  assert.equal(twilioConfig({ ...env, TWILIO_SMS_FROM: "bad" }, "sms"), null);
  assert.ok(twilioConfig({ ...env, TWILIO_SMS_FROM: "" }, "whatsapp"));
});
test("Twilio sends exact approved text with channel prefixes and records only a valid message SID", async () => {
  for (const channel of ["sms", "whatsapp"] as const) {
    let calls = 0;
    const send = twilioSender(twilioConfig(env, channel)!, channel, (async (url, init) => {
      calls++;
      assert.equal(url, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`);
      assert.equal(init?.redirect, "error");
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("To"), `${channel === "whatsapp" ? "whatsapp:" : ""}+971509999999`);
      assert.equal(form.get("Body"), "Approved reminder: AED 1200.50");
      assert.equal(form.get("From"), channel === "sms" ? env.TWILIO_SMS_FROM : env.TWILIO_WHATSAPP_FROM);
      assert.match(String((init?.headers as Record<string, string>).Authorization), /^Basic /);
      return new Response(JSON.stringify({ sid: `SM${"b".repeat(32)}` }), { status: 201 });
    }) as typeof fetch);
    assert.deepEqual(await send({ to: "+971509999999", subject: "Internal label", text: "Approved reminder: AED 1200.50" }, "message-id"), { ok: true, id: `SM${"b".repeat(32)}` });
    assert.equal(calls, 1);
  }
});
test("Twilio timeouts and malformed responses return an uncertain outcome without retrying or leaking provider text", async () => {
  for (const response of [() => { throw new Error("test-token secret"); }, () => new Response("test-token secret", { status: 500 }), () => new Response("{}", { status: 201 })]) {
    let calls = 0;
    const send = twilioSender(twilioConfig(env, "sms")!, "sms", (async () => { calls++; return response(); }) as typeof fetch);
    const result = await send({ to: "+971509999999", subject: "Label", text: "Approved text" }, "id");
    assert.equal(result.ok, false);
    if (!result.ok) { assert.match(result.error, /unknown|reconcile/i); assert.doesNotMatch(result.error, /test-token|secret/); }
    assert.equal(calls, 1);
  }
});
test("Twilio refuses attachments and invalid recipients without a network request", async () => {
  const send = twilioSender(twilioConfig(env, "sms")!, "sms", (async () => { throw new Error("must not call"); }) as typeof fetch);
  const result = await send({ to: "local-number", subject: "label", text: "text" }, "id");
  assert.equal(result.ok, false);
  const attached = await send({ to: "+971509999999", subject: "label", text: "text", attachments: [{ filename: "x", content: new Uint8Array() }] }, "id");
  assert.equal(attached.ok, false);
});
