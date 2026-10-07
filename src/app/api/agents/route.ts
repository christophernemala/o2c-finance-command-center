import { NextRequest, NextResponse } from "next/server";
import { access } from "@/lib/workspace";
import { sameOrigin } from "@/lib/request-security";
import { z } from "zod";
const input = z.object({ tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), agent: z.enum(["ar","collections","treasury"]), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length < 1 || length > 2048) return new NextResponse("Request too large", { status: 413 });
  const destination = new URL("/", request.headers.get("origin")!); destination.searchParams.set("view", "agents");
  try {
    const auth = await access(); if (!auth) return NextResponse.redirect(new URL("/login", destination),303);
    const data = input.parse(Object.fromEntries(await request.formData()));
    destination.searchParams.set("tenant",data.tenant); destination.searchParams.set("entity",data.entity);
    const queued = await auth.client.rpc("enqueue_agent_job", { p_tenant:data.tenant,p_entity:data.entity,p_id:data.id,p_agent:data.agent,
      p_as_of:data.as_of ?? new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dubai"}).format(new Date()) });
    if (queued.error) throw new Error("Queue unavailable");
    const run = await auth.client.rpc("run_agent_job", { p_tenant:data.tenant,p_entity:data.entity,p_id:data.id });
    if (run.error) throw new Error("Queued job can be resumed");
    destination.searchParams.set("message","confirmed");
  } catch { destination.searchParams.set("message","failed"); }
  return NextResponse.redirect(destination,{status:303,headers:{"Cache-Control":"no-store"}});
}
