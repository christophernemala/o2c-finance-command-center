import { NextRequest } from "next/server";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { access } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { aiDependencies } from "@/lib/ai/server";
import { dubaiDate } from "@/lib/ai/config";
import { runCopilot, type CopilotEvent, type CopilotTurn } from "@/lib/ai/copilot";
export const maxDuration = 300;
const input = z.strictObject({
  tenant: z.uuid(), entity: z.uuid(), thread: z.uuid(), message: z.string().trim().min(1).max(8000),
  files: z.array(z.strictObject({ id: z.uuid(), name: z.string().min(1).max(200) })).max(5),
});
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return json(403, { error: "Forbidden" });
  const body = await boundedFormRequest(request, 64 * 1024);
  if (body instanceof Response) return body;
  let data: z.infer<typeof input>;
  try { data = input.parse(await body.json()); } catch { return json(400, { error: "Invalid request" }); }
  const auth = await access(); if (!auth) return json(401, { error: "Sign in again" });
  const membership = auth.memberships.find(row => row.tenant_id === data.tenant); if (!membership) return json(403, { error: "Forbidden" });
  const limited = await apiLimit(auth.user.id, "copilot"); if (limited) return limited;
  const deps = aiDependencies(); const config = deps.config; const call = deps.call;
  if (!config || !call) return json(503, { error: "The AI provider is not configured on this server (ANTHROPIC_API_KEY)." });
  const scope = { p_tenant: data.tenant, p_entity: data.entity };
  const history = await auth.client.rpc("copilot_history", { ...scope, p_thread: data.thread });
  if (history.error) return json(403, { error: "Conversation unavailable" });
  const saved = await auth.client.rpc("copilot_append", { ...scope, p_thread: data.thread, p_role: "user", p_content: data.message, p_trace: [] });
  if (saved.error) return json(403, { error: "Conversation unavailable" });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: CopilotEvent) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* client disconnected */ } };
      try {
        const result = await runCopilot({
          client: auth.client, config, call, tenant: data.tenant, entity: data.entity, asOf: dubaiDate(), role: membership.role,
          thread: data.thread, message: data.message, files: data.files, history: history.data as CopilotTurn[], emit,
          readFile: async id => {
            const file = await auth.client.rpc("copilot_file", { ...scope, p_id: id });
            if (file.error) throw new Error("File unavailable");
            const value = file.data as { name: string; media_type: string; content_base64: string };
            return { name: value.name, mediaType: value.media_type, bytes: new Uint8Array(Buffer.from(value.content_base64, "base64")) };
          },
        });
        const text = result.text || (result.error ? `I could not complete this answer: ${result.error}` : "No answer was produced.");
        await auth.client.rpc("copilot_append", { ...scope, p_thread: data.thread, p_role: "assistant", p_content: text, p_trace: result.trace });
        emit(result.status === "failed" && !result.text ? { type: "error", message: text } : { type: "done", text });
      } catch { emit({ type: "error", message: "The copilot is unavailable right now. Your question was saved; try again shortly." }); }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
