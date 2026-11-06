import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { agentControl } from "@/lib/postgres/client";
import { executeRun } from "@/lib/ai/runner";
import { aiDependencies } from "@/lib/ai/server";
import { dubaiDate } from "@/lib/ai/config";
import { deliverApproved } from "@/lib/collections/send";
import { collectionSenders } from "@/lib/messaging/server";
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
    // Each run stops by the deadline, leaving time for the incident sweep and the outbox before maxDuration.
    const deadline = started + 240_000; const skipped: string[] = []; const failed: string[] = [];
    for (const run of queued) {
      if (Date.now() > deadline - 30_000) { skipped.push(run); continue; }
      // One run's failure (for example a claim error) must not stop the batch, the sweep or the outbox.
      try { if (await executeRun(run, deps, { deadline })) executed.push(run); }
      catch (error) { failed.push(run); console.error("Scheduled agent run failed", run, error instanceof Error ? error.message : error); }
    }
    // Runs left for lack of time are marked, not left queued, so they are visible and free the active-run cap.
    await agentControl(deps.pool).skipRuns(skipped).catch(error => console.error("Skipped agent runs not marked", error instanceof Error ? error.message : error));
    // Stuck runs produce no finish call, so the sweep is what catches them.
    const incidents = await agentControl(deps.pool).detectIncidents();
    // Retry approved collections emails that were not sent right after approval.
    const outbox = await deliverApproved(deps.pool, collectionSenders(), 25);
    return Response.json({ queued: queued.length, executed: executed.length, skipped: skipped.length, failed: failed.length, incidents, outbox }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Scheduler unavailable" }, { status: 503 }); }
}
