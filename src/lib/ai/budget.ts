import type { Routine } from "../postgres/client";
import type { TokenUsage } from "./pricing";

type RpcClient = { rpc(name: Routine, input: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
export interface AiSpendController {
  reserve(input: { call: number; model: string; inputBytes: number; maxOutputTokens: number }): Promise<void>;
  settle(input: { call: number; model: string; usage: TokenUsage }): Promise<void>;
  /** Only called after a reservation if the model request was never sent. */
  release(call: number): Promise<void>;
}

function publicError(message: string) {
  if (/daily budget is not configured/i.test(message)) return "Workspace AI is disabled until an administrator sets a daily USD budget.";
  if (/daily budget is paused/i.test(message)) return "Workspace AI is paused because its daily USD budget is set to zero.";
  if (/daily spend cap would be exceeded/i.test(message)) return "The workspace daily AI spend cap would be exceeded; this model request was not sent.";
  if (/model has no configured price/i.test(message)) return "This AI model has no approved price entry; the model request was not sent.";
  return "The AI budget could not be verified, so the model request was not sent.";
}

export class AiSpendError extends Error {
  constructor(message: string) { super(message); this.name = "AiSpendError"; }
}

export function aiSpendController(client: RpcClient, tenant: string, entity: string, request: string): AiSpendController {
  const callRpc = async (name: Routine, input: Record<string, unknown>) => {
    const result = await client.rpc(name, { p_tenant: tenant, p_entity: entity, ...input });
    if (result.error) throw new AiSpendError(publicError(result.error.message));
    return result.data;
  };
  return {
    async reserve(input) {
      try {
        await callRpc("reserve_ai_spend", { p_request: request, p_call: input.call, p_model: input.model, p_input_bytes: input.inputBytes, p_max_output: input.maxOutputTokens });
      } catch (error) {
        if (error instanceof AiSpendError) throw error;
        throw new AiSpendError("The AI budget could not be verified, so the model request was not sent.");
      }
    },
    async settle(input) {
      try {
        await callRpc("settle_ai_spend", { p_request: request, p_call: input.call, p_model: input.model, p_input_tokens: input.usage.input,
          p_output_tokens: input.usage.output, p_cache_read_tokens: input.usage.cacheRead, p_cache_write_tokens: input.usage.cacheWrite });
      } catch {
        throw new AiSpendError("Provider usage could not be recorded; the full reservation remains held. Check provider usage before retrying.");
      }
    },
    async release(call) {
      try { await callRpc("release_ai_spend", { p_request: request, p_call: call }); }
      catch { /* The reservation remains held if release cannot be confirmed. */ }
    },
  };
}
