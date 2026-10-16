import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { access } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { deliverApproved } from "@/lib/collections/send";
import { collectionSenders } from "@/lib/messaging/server";
import { databasePool } from "@/lib/postgres/pool";
import { remarkChannels, remarkReasons } from "@/types/collections";
const decimal = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/);
const scope = { tenant: z.uuid(), entity: z.uuid() };
const input = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("contact_add"), ...scope, id: z.uuid(), customer: z.uuid(), name: z.string().trim().min(1).max(120), email: z.email().max(254),
    phone: z.union([z.string().regex(/^\+[1-9]\d{7,14}$/), z.literal("")]).optional(), sms: z.literal("on").optional(), whatsapp: z.literal("on").optional(), consent: z.string().trim().max(500).optional(),
    role: z.enum(["ar", "ap", "finance", "other"]), primary: z.enum(["on"]).optional() }),
  z.object({ intent: z.literal("contact_archive"), ...scope, id: z.uuid(), customer: z.uuid() }),
  z.object({ intent: z.literal("message_propose"), ...scope, id: z.uuid(), customer: z.uuid(), contact: z.uuid(), tone: z.enum(["reminder", "firm", "final_notice"]),
    channel: z.enum(["email", "sms", "whatsapp"]).default("email"), subject: z.string().trim().min(3).max(200), body: z.string().trim().min(20).max(4000), invoices: z.string().max(1200), attach: z.enum(["on"]).optional() }),
  z.object({ intent: z.literal("message_decide"), ...scope, id: z.uuid(), customer: z.uuid(), decision: z.enum(["approved", "rejected"]) }),
  z.object({ intent: z.literal("promise_record"), ...scope, id: z.uuid(), customer: z.uuid(), invoice: z.union([z.uuid(), z.literal("")]), amount: decimal,
    date: z.iso.date(), note: z.string().max(500).optional() }),
  z.object({ intent: z.literal("promise_resolve"), ...scope, id: z.uuid(), customer: z.uuid(), status: z.enum(["kept", "cancelled"]), reason: z.string().trim().min(5).max(500) }),
  z.object({ intent: z.literal("limit_propose"), ...scope, id: z.uuid(), customer: z.uuid(), limit: decimal, reason: z.string().trim().min(5).max(500) }),
  z.object({ intent: z.literal("limit_decide"), ...scope, id: z.uuid(), customer: z.uuid(), decision: z.enum(["active", "rejected"]) }),
  z.object({ intent: z.literal("hold_place"), ...scope, id: z.uuid(), customer: z.uuid(), reason: z.string().trim().min(5).max(500) }),
  z.object({ intent: z.literal("remark_add"), ...scope, id: z.uuid(), customer: z.uuid(), invoice: z.union([z.uuid(), z.literal("")]), reason: z.enum(remarkReasons),
    channel: z.enum(remarkChannels), note: z.string().trim().min(3).max(1000), next: z.union([z.iso.date(), z.literal("")]),
    promise_amount: z.union([decimal, z.literal("")]), promise_date: z.union([z.iso.date(), z.literal("")]) }),
  z.object({ intent: z.literal("licence_add"), ...scope, id: z.uuid(), customer: z.uuid(), number: z.string().trim().min(1).max(60), authority: z.string().trim().min(2).max(80), expiry: z.iso.date() }),
  z.object({ intent: z.literal("hold_release"), ...scope, id: z.uuid(), customer: z.uuid(), reason: z.string().trim().min(5).max(500) }),
]);
const uuidList = (value: string) => { const ids = value.split(",").map(item => item.trim()).filter(Boolean); return ids.every(id => z.uuid().safeParse(id).success) ? ids : null; };
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 12_288);
  if (body instanceof Response) return body;
  const destination = new URL("/", request.headers.get("origin")!); destination.searchParams.set("view", "collections");
  try {
    const auth = await access(); if (!auth) return NextResponse.redirect(new URL("/login", destination), 303);
    const parsed = input.safeParse(Object.fromEntries(await body.formData()));
    if (!parsed.success) throw new Error("Invalid request");
    const data = parsed.data; const s = { p_tenant: data.tenant, p_entity: data.entity };
    destination.searchParams.set("tenant", data.tenant); destination.searchParams.set("entity", data.entity); destination.searchParams.set("customer", data.customer);
    const limited = await apiLimit(auth.user.id, "commands"); if (limited) return limited;
    let result: { error: { message: string } | null };
    if (data.intent === "contact_add") result = await auth.client.rpc("add_customer_contact", { ...s, p_id: data.id, p_customer: data.customer, p_name: data.name, p_email: data.email, p_role: data.role, p_primary: data.primary === "on", p_phone: data.phone || null, p_sms: data.sms === "on", p_whatsapp: data.whatsapp === "on", p_consent: data.consent || null });
    else if (data.intent === "contact_archive") result = await auth.client.rpc("archive_customer_contact", { ...s, p_id: data.id });
    else if (data.intent === "message_propose") {
      const invoices = uuidList(data.invoices); if (!invoices?.length) throw new Error("Invalid request");
      result = await auth.client.rpc("propose_collection_message", { ...s, p_id: data.id, p_customer: data.customer, p_contact: data.contact, p_tone: data.tone, p_subject: data.subject, p_body: data.body, p_invoices: invoices, p_attach: data.attach === "on", p_channel: data.channel });
    } else if (data.intent === "message_decide") {
      result = await auth.client.rpc("decide_collection_message", { ...s, p_id: data.id, p_decision: data.decision });
      // Approval and sending are separate steps; delivery runs after the response, and cron also processes the queue.
      if (!result.error && data.decision === "approved") after(async () => { await deliverApproved(databasePool(), collectionSenders()).catch(() => {}); });
    } else if (data.intent === "promise_record") result = await auth.client.rpc("record_payment_promise", { ...s, p_id: data.id, p_customer: data.customer, p_invoice: data.invoice || null, p_amount: data.amount, p_date: data.date, p_note: data.note || null });
    else if (data.intent === "promise_resolve") result = await auth.client.rpc("resolve_payment_promise", { ...s, p_id: data.id, p_status: data.status, p_reason: data.reason });
    else if (data.intent === "limit_propose") result = await auth.client.rpc("propose_credit_limit", { ...s, p_id: data.id, p_customer: data.customer, p_limit: data.limit, p_reason: data.reason });
    else if (data.intent === "limit_decide") result = await auth.client.rpc("decide_credit_limit", { ...s, p_id: data.id, p_decision: data.decision });
    else if (data.intent === "hold_place") result = await auth.client.rpc("place_customer_hold", { ...s, p_id: data.id, p_customer: data.customer, p_reason: data.reason });
    else if (data.intent === "remark_add") result = await auth.client.rpc("add_customer_remark", { ...s, p_id: data.id, p_customer: data.customer, p_invoice: data.invoice || null,
      p_reason: data.reason, p_channel: data.channel, p_note: data.note, p_next: data.next || null,
      p_promise_amount: data.reason === "promised" ? data.promise_amount || null : null, p_promise_date: data.reason === "promised" ? data.promise_date || null : null });
    else if (data.intent === "licence_add") result = await auth.client.rpc("add_trade_licence", { ...s, p_id: data.id, p_customer: data.customer, p_number: data.number, p_authority: data.authority, p_expiry: data.expiry });
    else result = await auth.client.rpc("release_customer_hold", { ...s, p_id: data.id, p_reason: data.reason });
    destination.searchParams.set("message", result.error ? (/Forbidden|Independent/.test(result.error.message) ? "forbidden" : /Stale evidence/.test(result.error.message) ? "stale" : "failed") : "confirmed");
  } catch { destination.searchParams.set("message", "failed"); }
  destination.searchParams.set("nonce", randomUUID().slice(0, 8));
  return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
}
