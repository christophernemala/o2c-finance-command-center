import Decimal from "decimal.js";
// USD per million tokens (Anthropic first-party list prices). Unknown models report no cost
// rather than a guessed one. Cache writes use the 5-minute rate (1.25x input).
const prices: Record<string, { input: string; output: string; cacheRead: string; cacheWrite: string }> = {
  "claude-opus-5-5": { input: "4", output: "20", cacheRead: "0.20", cacheWrite: "5" },
  "claude-sonnet-5-5": { input: "2", output: "10", cacheRead: "0.20", cacheWrite: "2.5" },
};
export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
export function usageCost(model: string, usage: TokenUsage): string | null {
  const price = prices[model]; if (!price) return null;
  const million = new Decimal(1_000_000);
  return new Decimal(usage.input).mul(price.input).plus(new Decimal(usage.output).mul(price.output))
    .plus(new Decimal(usage.cacheRead).mul(price.cacheRead)).plus(new Decimal(usage.cacheWrite).mul(price.cacheWrite))
    .div(million).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}
