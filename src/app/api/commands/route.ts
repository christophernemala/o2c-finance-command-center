import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { positiveAmount } from "@/lib/money";
import { previewImport, type ImportKind } from "@/lib/imports";
import { workspaces } from "@/types/workspace";
import { sameOrigin } from "@/lib/request-security";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  if (!request.headers.get("content-length") || Number(request.headers.get("content-length")) > 1100000) return new NextResponse("File limit is 1 MB", { status: 413 });
  const form = await request.formData(); const tenant = String(form.get("tenant") ?? ""); const entity = String(form.get("entity") ?? "");
  const view = String(form.get("view") ?? "overview");
  const destination = new URL("/", request.headers.get("origin")!);
  if (uuid.test(tenant) && uuid.test(entity)) { destination.searchParams.set("tenant", tenant); destination.searchParams.set("entity", entity); }
  destination.searchParams.set("view", workspaces.includes(view as typeof workspaces[number]) ? view : "overview");
  let message = "failed";
  try {
    if (!uuid.test(tenant) || !uuid.test(entity)) throw new Error("Invalid scope");
    const client = await createClient(); const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.redirect(new URL("/login", request.headers.get("origin")!), 303);
    const optionalId = (name: string) => { const value = String(form.get(name) ?? ""); if (!value) return null; if (!uuid.test(value)) throw new Error("Invalid record"); return value; };
    const version = Number(form.get("version")); const id = optionalId("id");
    const base = { p_tenant: tenant, p_entity: entity };
    let result;
    switch (form.get("intent")) {
      case "propose": {
        if (!id) throw new Error("Missing command ID");
        const kind = String(form.get("kind")); if (!["receipt", "allocation"].includes(kind)) throw new Error("Invalid command");
        const evidence = String(form.get("evidence") ?? ""); if (evidence.trim().length < 10 || evidence.length > 2000) throw new Error("Evidence required");
        result = await client.rpc("propose_action", { ...base, p_id: id, p_kind: kind, p_amount: positiveAmount(form.get("amount")), p_evidence: evidence,
          p_invoice: optionalId("invoice"), p_receipt: optionalId("receipt"), p_bank: optionalId("bank"), p_customer: optionalId("customer") }); break;
      }
      case "approve": case "reject": case "execute": {
        if (form.get("acknowledge") !== "yes") throw new Error("Review acknowledgement required");
        if (!id || !Number.isSafeInteger(version) || version < 1) throw new Error("Invalid version");
        result = form.get("intent") === "execute"
          ? await client.rpc("execute_action", { ...base, p_id: id, p_version: version })
          : await client.rpc("decide_action", { ...base, p_id: id, p_version: version, p_decision: form.get("intent") === "approve" ? "approved" : "rejected" }); break;
      }
      case "stage": {
        const kind = String(form.get("kind")); if (!["invoices", "bank_lines"].includes(kind)) throw new Error("Invalid import type");
        const file = form.get("file"); if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024) throw new Error("Invalid file");
        const preview = previewImport(await file.text(), kind as ImportKind);
        if (preview.errors.length) { message = "invalid_import"; throw new Error("Import validation failed"); }
        result = await client.rpc("stage_import", { ...base, p_kind: kind, p_name: file.name.slice(0,200), p_payload: preview.rows }); break;
      }
      case "commit": {
        if (form.get("acknowledge") !== "yes") throw new Error("Review acknowledgement required");
        if (!id) throw new Error("Missing batch");
        result = await client.rpc("commit_import", { ...base, p_id: id }); break;
      }
      default: throw new Error("Unsupported action");
    }
    if (result.error) {
      message = /stale|balance|remaining|conflict|duplicate/i.test(result.error.message) ? "conflict" : /forbidden|checker|revoked/i.test(result.error.message) ? "forbidden" : "failed";
    } else message = "confirmed";
  } catch { /* Return stable messages; never expose provider errors or credentials. */ }
  destination.searchParams.set("message", message);
  const response = NextResponse.redirect(destination, 303); response.headers.set("Cache-Control", "no-store"); return response;
}
