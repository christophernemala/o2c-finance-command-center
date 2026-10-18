import type Anthropic from "@anthropic-ai/sdk";
import type { AiConfig } from "./config";
import { copilotSystemPrompt } from "./agents";
import { runLoop, type LoopEvent, type ModelCaller } from "./loop";
import { toolsFor, type FinanceRpc, type ToolContext } from "./tools";

export interface CopilotTurn { seq: number; role: "user" | "assistant"; content: string }
export type CopilotEvent = { type: "text"; delta: string } | { type: "tool"; tool: string; status: "running" | "ok" | "error" } | { type: "done"; text: string } | { type: "error"; message: string };
export interface CopilotFileRef { id: string; name: string }

/** One copilot turn as the signed-in user. History is text-only so every turn starts append-only. */
export async function runCopilot(input: {
  client: FinanceRpc; config: AiConfig; call: ModelCaller; tenant: string; entity: string; asOf: string; role: string;
  thread: string; message: string; files: CopilotFileRef[]; history: CopilotTurn[];
  readFile: ToolContext["readFile"]; emit: (event: CopilotEvent) => void;
}) {
  const trace: { tool: string; ok: boolean; input: unknown }[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of input.history.slice(-20)) {
    const last = messages.at(-1);
    if (last && last.role === turn.role && typeof last.content === "string") last.content += `\n\n${turn.content}`;
    else messages.push({ role: turn.role, content: turn.content });
  }
  if (messages[0]?.role === "assistant") messages.shift();
  const attachments = input.files.length ? `\n\n[Attached files: ${input.files.map(file => `${file.name} (file_id ${file.id})`).join("; ")}]` : "";
  const scopeNote = `[Scope: legal entity ${input.entity}, as of ${input.asOf} Asia/Dubai, user role ${input.role}]`;
  const userContent = `${scopeNote}\n${input.message}${attachments}`;
  if (messages.at(-1)?.role === "user") messages.push({ role: "assistant", content: "Noted." });
  messages.push({ role: "user", content: userContent });
  const canWrite = ["maker", "admin"].includes(input.role);
  const context: ToolContext = { client: input.client, tenant: input.tenant, entity: input.entity, asOf: input.asOf, actor: "copilot", findings: [], readFile: input.readFile };
  const result = await runLoop({
    call: input.call, model: input.config.model, effort: input.config.copilotEffort, maxTurns: 10,
    system: copilotSystemPrompt, tools: toolsFor("copilot", canWrite), context, messages,
    onText: delta => input.emit({ type: "text", delta }),
    onEvent: async (event: LoopEvent) => {
      if (event.type === "tool_call") { trace.push({ tool: event.tool, ok: true, input: event.input }); input.emit({ type: "tool", tool: event.tool, status: "running" }); }
      if (event.type === "tool_result") { for (let i = trace.length - 1; i >= 0; i--) if (trace[i].tool === event.tool) { trace[i].ok = event.ok; break; } input.emit({ type: "tool", tool: event.tool, status: event.ok ? "ok" : "error" }); }
    },
  });
  return { ...result, trace };
}
