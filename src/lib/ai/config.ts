export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export interface AiConfig { apiKey: string; model: string; agentEffort: Effort; copilotEffort: Effort }
const efforts: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
const effort = (value: string | undefined, fallback: Effort): Effort => efforts.includes(value as Effort) ? value as Effort : fallback;
/** Server-only provider settings. Missing key means AI features render as "not configured". */
export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.AI_MODEL?.trim() || "claude-opus-5-5";
  if (!/^[a-z0-9.-]{3,64}$/.test(model)) return null;
  return { apiKey, model, agentEffort: effort(env.AI_AGENT_EFFORT, "medium"), copilotEffort: effort(env.AI_COPILOT_EFFORT, "low") };
}
export function dubaiDate(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(at);
}
