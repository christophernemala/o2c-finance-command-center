import "server-only";
import { createLoginLimiter, loginLimiterConfig } from "./login-limiter";
export async function apiLimit(userId: string, scope: "commands" | "agents" | "export"): Promise<Response | null> {
  try {
    const settings = loginLimiterConfig(); if (!settings) throw new Error("Protection unavailable");
    const result = await createLoginLimiter(settings).reserveApi(userId, scope);
    return result.allowed ? null : new Response("Too many requests", { status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" } });
  } catch { return new Response("Request protection unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
