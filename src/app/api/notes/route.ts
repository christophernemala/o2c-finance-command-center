import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { access } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { noteReasons } from "@/types/collections";
const decimal = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/);
const scope = { tenant: z.uuid(), entity: z.uuid(), id: z.uuid() };
const input = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("note_propose"), ...scope, kind: z.enum(["credit", "debit"]), customer: z.uuid(), invoice: z.union([z.uuid(), z.literal("")]),
    amount: decimal, reason: z.enum(noteReasons), memo: z.string().trim().min(10).max(1000), reference: z.string().trim().min(1).max(60), due: z.union([z.iso.date(), z.literal("")]) }),
  z.object({ intent: z.literal("note_decide"), ...scope, version: z.coerce.number().int().min(1).max(1000), decision: z.enum(["approved", "rejected"]) }),
  z.object({ intent: z.literal("note_post"), ...scope, version: z.coerce.number().int().min(1).max(1000) }),
]);
/** Credit and debit notes: propose, decide (independent human approver) and post are three separate calls. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 8_192);
  if (body instanceof Response) return body;
  const destination = new URL("/", request.headers.get("origin")!); destination.searchParams.set("view", "notes");
  let message = "failed";
  try {
    const auth = await access(); if (!auth) return NextResponse.redirect(new URL("/login", destination), 303);
    const parsed = input.safeParse(Object.fromEntries(await body.formData()));
    if (!parsed.success) throw new Error("Invalid request");
    const data = parsed.data; const s = { p_tenant: data.tenant, p_entity: data.entity, p_id: data.id };
    destination.searchParams.set("tenant", data.tenant); destination.searchParams.set("entity", data.entity);
    const limited = await apiLimit(auth.user.id, "commands"); if (limited) return limited;
    const result = data.intent === "note_propose"
      ? await auth.client.rpc("propose_adjustment_note", { ...s, p_kind: data.kind, p_customer: data.customer, p_invoice: data.invoice || null, p_amount: data.amount,
          p_reason: data.reason, p_memo: data.memo, p_reference: data.reference, p_due: data.kind === "debit" ? data.due || null : null })
      : data.intent === "note_decide" ? await auth.client.rpc("decide_adjustment_note", { ...s, p_version: data.version, p_decision: data.decision })
      : await auth.client.rpc("post_adjustment_note", { ...s, p_version: data.version });
    message = !result.error ? "confirmed" : /Forbidden|Independent|authority/.test(result.error.message) ? "forbidden" : /Stale|exceeds|already used/.test(result.error.message) ? "conflict" : "failed";
  } catch { /* message stays failed */ }
  destination.searchParams.set("message", message); destination.searchParams.set("nonce", randomUUID().slice(0, 8));
  return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
}
