import { NextRequest } from "next/server";
import { z } from "zod";
import { access } from "@/lib/workspace";
export const maxDuration = 300;
const query = z.object({ tenant: z.uuid(), entity: z.uuid(), after: z.coerce.number().int().min(0).max(1000).default(0) });
const terminal = new Set(["succeeded", "failed", "awaiting_approval"]);
/** Server-sent events tailing a run's persisted steps. Reads only; the run itself executes elsewhere. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!z.uuid().safeParse(id).success || !parsed.success) return new Response("Invalid request", { status: 400 });
  const auth = await access(); if (!auth) return new Response("Unauthorized", { status: 401 });
  const { tenant, entity } = parsed.data; let after = parsed.data.after;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const deadline = Date.now() + 270_000;
      try {
        while (!request.signal.aborted && Date.now() < deadline) {
          const result = await auth.client.rpc("agent_run_detail", { p_tenant: tenant, p_entity: entity, p_run: id, p_after: after });
          if (result.error) { send("error", { message: "Run unavailable" }); break; }
          const detail = result.data as { run: { status: string }; steps: { seq: number }[] };
          for (const step of detail.steps) { send("step", step); after = step.seq; }
          send("status", detail.run);
          if (terminal.has(detail.run.status) && !detail.steps.length) break;
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      } catch { send("error", { message: "Stream interrupted; refresh to see the recorded state." }); }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
