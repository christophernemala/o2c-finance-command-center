import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { access } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { XLSX_TYPE, readXlsx } from "@/lib/xlsx-read";
import { parseCsv } from "@/lib/imports";
const scope = z.object({ tenant: z.uuid(), entity: z.uuid() });
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** Attach a CSV or XLSX file (max 2 MB) to the signed-in user's copilot. The file is parsed once to reject corrupt uploads. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return json(403, { error: "Forbidden" });
  const body = await boundedFormRequest(request, 2_200_000);
  if (body instanceof Response) return body;
  const auth = await access(); if (!auth) return json(401, { error: "Sign in again" });
  const limited = await apiLimit(auth.user.id, "copilot"); if (limited) return limited;
  try {
    const form = await body.formData(); const parsed = scope.safeParse({ tenant: form.get("tenant"), entity: form.get("entity") });
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024) return json(400, { error: "Attach one CSV or .xlsx file up to 2 MB." });
    const name = file.name.slice(0, 200); const bytes = new Uint8Array(await file.arrayBuffer());
    const xlsx = /\.xlsx$/i.test(name); const csv = /\.csv$/i.test(name);
    if (!xlsx && !csv) return json(400, { error: "Only .csv and .xlsx files are supported." });
    try {
      if (xlsx) { if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(); readXlsx(bytes); }
      else parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { return json(400, { error: "The file could not be read. Check that it is a valid CSV (UTF-8, up to 1 MB) or Excel workbook." }); }
    const id = randomUUID();
    const saved = await auth.client.rpc("copilot_attach", { p_tenant: parsed.data.tenant, p_entity: parsed.data.entity, p_id: id, p_name: name, p_media_type: xlsx ? XLSX_TYPE : "text/csv", p_content: Buffer.from(bytes) });
    if (saved.error) return json(403, { error: "Upload not permitted in this scope." });
    return json(200, { id, name });
  } catch { return json(400, { error: "Upload failed." }); }
}
