import Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "./config";
import { emptyUsage, type TokenUsage } from "./pricing";
import { toolDefinitions, type AgentTool, type ToolContext } from "./tools";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type ModelCaller = (params: Params, onText?: (delta: string) => void) => Promise<Anthropic.Beta.BetaMessage>;
export type LoopEvent =
  | { type: "thinking"; text: string }
  | { type: "message"; text: string }
  | { type: "tool_call"; id: string; tool: string; input: unknown }
  | { type: "tool_result"; id: string; tool: string; ok: boolean; output: unknown; duration_ms: number };
export interface LoopResult { status: "succeeded" | "failed"; text: string; error?: string; usage: TokenUsage; model: string; turns: number }

export function anthropicCaller(apiKey: string): ModelCaller {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 5 * 60 * 1000 });
  return async (params, onText) => {
    const stream = client.beta.messages.stream(params);
    if (onText) stream.on("text", onText);
    return stream.finalMessage();
  };
}

const MAX_RESULT_CHARS = 60_000;
export function serializeResult(value: unknown) {
  const json = JSON.stringify(value ?? null);
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}… [truncated; request a smaller page]` : json;
}

/**
 * Manual tool loop: every step is surfaced through onEvent so callers can persist it before the next
 * model turn. Tool inputs are validated with zod (eager input streaming sends them unvalidated).
 */
export async function runLoop(options: {
  call: ModelCaller; model: string; effort: Effort; system: string; tools: AgentTool[]; context: ToolContext;
  messages: Anthropic.Beta.BetaMessageParam[]; maxTurns: number; onEvent: (event: LoopEvent) => Promise<void>; onText?: (delta: string) => void;
}): Promise<LoopResult> {
  const usage = emptyUsage(); let served = options.model; let finalText = "";
  const definitions = toolDefinitions(options.tools);
  const registry = new Map(options.tools.map(entry => [entry.name, entry]));
  for (let turn = 1; turn <= options.maxTurns; turn++) {
    const message = await options.call({
      model: options.model, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: options.effort },
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: options.system }],
      tools: definitions, tool_choice: { type: "auto" }, messages: options.messages,
    }, options.onText);
    served = message.model;
    usage.input += message.usage.input_tokens; usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0; usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
    const turnText: string[] = [];
    for (const block of message.content) {
      if (block.type === "thinking" && block.thinking.trim()) await options.onEvent({ type: "thinking", text: block.thinking });
      if (block.type === "text" && block.text.trim()) { turnText.push(block.text); await options.onEvent({ type: "message", text: block.text }); }
    }
    if (turnText.length) finalText = turnText.join("\n");
    // Append the full content (thinking blocks included) so the next turn continues the same reasoning.
    options.messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "refusal") return { status: "failed", text: finalText, error: "The model declined this request.", usage, model: served, turns: turn };
    if (message.stop_reason === "max_tokens") return { status: "failed", text: finalText, error: "The model reached its output limit before finishing.", usage, model: served, turns: turn };
    if (message.stop_reason === "pause_turn") continue;
    const calls = message.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !calls.length) return { status: "succeeded", text: finalText, usage, model: served, turns: turn };
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    // Sequential execution keeps the persisted step order identical to the effect order in PostgreSQL.
    for (const use of calls) {
      await options.onEvent({ type: "tool_call", id: use.id, tool: use.name, input: use.input });
      const started = Date.now(); let ok = true; let output: unknown;
      try {
        const entry = registry.get(use.name); if (!entry) throw new Error(`Unknown tool ${use.name}`);
        const parsed = entry.schema.safeParse(use.input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "input"} ${issue.message}`).join("; ")}`);
        output = await entry.run(parsed.data, options.context);
      } catch (error) { ok = false; output = { error: error instanceof Error ? error.message : "Tool failed" }; }
      const duration = Date.now() - started;
      await options.onEvent({ type: "tool_result", id: use.id, tool: use.name, ok, output, duration_ms: duration });
      results.push({ type: "tool_result", tool_use_id: use.id, content: serializeResult(output), ...(ok ? {} : { is_error: true }) });
    }
    options.messages.push({ role: "user", content: results });
  }
  return { status: "failed", text: finalText, error: `Stopped after ${options.maxTurns} model turns.`, usage, model: served, turns: options.maxTurns };
}
