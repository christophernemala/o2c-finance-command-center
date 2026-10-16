import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { agentControl } from "@/lib/postgres/client";
import { executeRun } from "@/lib/ai/runner";
import { aiDependencies } from "@/lib/ai/server";
import { dubaiDate } from "@/lib/ai/config";
export const maxDuration = 300;
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || !header) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
/** Vercel Cron entry point: fans out daily schedules and executes queued runs within the time budget. */
export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const deps = aiDependencies(); const started = Date.now(); const executed: string[] = [];
  try {
    const queued = await agentControl(deps.pool).scheduleDue(dubaiDate());
    for (const run of queued) {
      if (Date.now() - started > 200_000) break;
      if (await executeRun(run, deps)) executed.push(run);
    }
    // Stuck runs produce no finish call, so the sweep is what catches them.
    const incidents = await agentControl(deps.pool).detectIncidents();
    return Response.json({ queued: queued.length, executed: executed.length, remaining: queued.length - executed.length, incidents }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Scheduler unavailable" }, { status: 503 }); }
}
