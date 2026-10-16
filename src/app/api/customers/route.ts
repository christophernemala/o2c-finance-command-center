import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { access } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { parseSegments } from "@/lib/segments";
const segment = z.string().trim().max(60).refine(value => !/^[=+\-@]/.test(value) && value.toLowerCase() !== "unassigned");
const scope = { tenant: z.uuid(), entity: z.uuid(), id: z.uuid() };
const input = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("segment_set"), ...scope, account: z.string().trim().min(1).max(60), category: segment, region: segment }),
  z.object({ intent: z.literal("segments_upload"), ...scope }),
]);
/** Customer category and region: one customer, or a CSV of account,category,region applied all-or-nothing. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 300_000);
  if (body instanceof Response) return body;
  const destination = new URL("/", request.headers.get("origin")!); destination.searchParams.set("view", "customers");
  let message = "failed";
  try {
    const auth = await access(); if (!auth) return NextResponse.redirect(new URL("/login", destination), 303);
    const form = await body.formData();
    const parsed = input.safeParse(Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string")));
    if (!parsed.success) throw new Error("Invalid request");
    const data = parsed.data;
    destination.searchParams.set("tenant", data.tenant); destination.searchParams.set("entity", data.entity);
    const limited = await apiLimit(auth.user.id, "commands"); if (limited) return limited;
    let rows: { account: string; category: string; region: string }[];
    if (data.intent === "segment_set") rows = [{ account: data.account, category: data.category, region: data.region }];
    else {
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size > 256 * 1024) { message = "invalid_import"; throw new Error("Invalid file"); }
      const preview = parseSegments(await file.text());
      if (preview.errors.length) { message = "invalid_import"; throw new Error("Invalid segments"); }
      rows = preview.rows;
    }
    const result = await auth.client.rpc("set_customer_segments", { p_tenant: data.tenant, p_entity: data.entity, p_id: data.id, p_rows: rows });
    message = result.error ? (/Forbidden/.test(result.error.message) ? "forbidden" : /Unknown customer account/.test(result.error.message) ? "invalid_import" : "failed") : "confirmed";
  } catch { /* message already set */ }
  destination.searchParams.set("message", message); destination.searchParams.set("nonce", randomUUID().slice(0, 8));
  return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
}
