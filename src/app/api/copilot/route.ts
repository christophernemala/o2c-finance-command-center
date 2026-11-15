import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { routeAccess } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { aiDependencies } from "@/lib/ai/server";
import { aiSpendController } from "@/lib/ai/budget";
import { dubaiDate } from "@/lib/ai/config";
import { runCopilot, type CopilotEvent, type CopilotTurn } from "@/lib/ai/copilot";
export const maxDuration = 300;
const input = z.strictObject({
  tenant: z.uuid(), entity: z.uuid(), thread: z.uuid(), requestId: z.uuid(), message: z.string().trim().min(1).max(8000),
  files: z.array(z.strictObject({ id: z.uuid(), name: z.string().min(1).max(200) })).max(5),
  allowProposals: z.boolean().optional().default(false),
});
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function oneEvent(event: CopilotEvent) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); controller.close(); } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return json(403, { error: "Forbidden" });
  const body = await boundedFormRequest(request, 64 * 1024);
  if (body instanceof Response) return body;
  let data: z.infer<typeof input>;
  try { data = input.parse(await body.json()); } catch { return json(400, { error: "Invalid request" }); }
  const auth = await routeAccess(); if (auth === "mfa") return json(401, { error: "Verify your authenticator code to continue" }); if (!auth) return json(401, { error: "Sign in again" });
  const membership = auth.memberships.find(row => row.tenant_id === data.tenant); if (!membership) return json(403, { error: "Forbidden" });
  const allowProposals = data.allowProposals && ["maker", "admin"].includes(membership.role);
  const limited = await apiLimit(auth.user.id, "copilot"); if (limited) return limited;
  const deps = aiDependencies(); const config = deps.config; const call = deps.call;
  if (!config || !call) return json(503, { error: "The AI provider is not configured on this server (ANTHROPIC_API_KEY)." });
  const scope = { p_tenant: data.tenant, p_entity: data.entity };
  const fingerprint = createHash("sha256").update(JSON.stringify({ tenant: data.tenant, entity: data.entity, thread: data.thread,
    message: data.message, files: data.files, allowProposals }), "utf8").digest("hex");
  const started = await auth.client.rpc("copilot_start_turn", { ...scope, p_thread: data.thread, p_request: data.requestId, p_fingerprint: fingerprint,
    p_content: data.message, p_payload: { files: data.files, allowProposals } });
  if (started.error) {
    if (/idempotency key conflict/i.test(started.error.message)) return json(409, { error: "This request ID belongs to a different Copilot message." });
    if (/forbidden|conversation unavailable/i.test(started.error.message)) return json(403, { error: "Conversation unavailable" });
    if (/full/i.test(started.error.message)) return json(409, { error: "This conversation is full. Start a new conversation." });
    return json(400, { error: "Could not safely start this Copilot turn." });
  }
  const turn = started.data as { status: "started" | "running" | "busy" | "completed" | "failed"; response?: string | null; history?: CopilotTurn[] };
  if (turn.status === "completed") return oneEvent({ type: "done", text: turn.response ?? "No answer was recorded." });
  if (turn.status === "failed") return oneEvent({ type: "error", message: turn.response ?? "This Copilot turn did not complete." });
  if (turn.status === "running" || turn.status === "busy") return json(409, { error: "A Copilot turn is already running in this conversation. Retry this same request shortly; it will not start a duplicate model call." });
  if (turn.status !== "started") return json(500, { error: "Could not safely start this Copilot turn." });

  const runController = new AbortController();
  const abortFromRequest = () => runController.abort(request.signal.reason);
  if (request.signal.aborted) abortFromRequest();
  else request.signal.addEventListener("abort", abortFromRequest, { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: CopilotEvent) => {
        if (runController.signal.aborted) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* client disconnected */ }
      };
      try {
        const result = await runCopilot({
          client: auth.client, config, call, spend: aiSpendController(auth.client, data.tenant, data.entity, data.requestId),
          tenant: data.tenant, entity: data.entity, asOf: dubaiDate(), role: membership.role,
          thread: data.thread, message: data.message, files: data.files, history: turn.history ?? [],
          allowProposals, signal: runController.signal,
          readFile: async id => {
            const file = await auth.client.rpc("copilot_file", { ...scope, p_id: id });
            if (file.error) throw new Error("File unavailable");
            const value = file.data as { name: string; media_type: string; content_base64: string };
            return { name: value.name, mediaType: value.media_type, bytes: new Uint8Array(Buffer.from(value.content_base64, "base64")) };
          },
          emit,
        });
        const note = result.status === "failed" ? `I could not complete this answer: ${result.error ?? "the run stopped"}` : null;
        const text = result.text ? (note ? `${result.text}\n\n${note}` : result.text) : note ?? "No answer was produced.";
        const saved = await auth.client.rpc("copilot_finish_turn", { ...scope, p_thread: data.thread, p_request: data.requestId,
          p_status: result.status === "failed" ? "failed" : "completed", p_content: text, p_trace: result.trace });
        if (saved.error) emit({ type: "error", message: "The answer could not be safely saved. Retry this same request to check whether it finished; a duplicate model call will not be started." });
        else if (result.status === "failed") emit({ type: "error", message: text });
        else emit({ type: "done", text });
      } catch {
        const text = "The Copilot turn failed before a result could be produced. You can retry the same request without starting a second model call.";
        const saved = await auth.client.rpc("copilot_finish_turn", { ...scope, p_thread: data.thread, p_request: data.requestId, p_status: "failed", p_content: text, p_trace: [] });
        if (!saved.error) emit({ type: "error", message: text });
        else emit({ type: "error", message: "The turn outcome could not be recorded. Retry this same request to check its status; the request ID prevents duplicate model work." });
      } finally {
        request.signal.removeEventListener("abort", abortFromRequest);
        try { controller.close(); } catch { /* stream already cancelled */ }
      }
    },
    cancel(reason) {
      if (!runController.signal.aborted) runController.abort(reason);
      request.signal.removeEventListener("abort", abortFromRequest);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
