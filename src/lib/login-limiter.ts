import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";

interface LimiterConfig { url: string; token: string; secret: string }
interface Ticket { key: string; id: string }
const reserveScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window = 900000
local retry = 0
for index, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  local limit = index == 1 and 5 or 30
  if redis.call('ZCARD', key) >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    retry = math.max(retry, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
  end
end
if retry > 0 then return {0, retry} end
for _, key in ipairs(KEYS) do
  redis.call('ZADD', key, now, ARGV[1])
  redis.call('PEXPIRE', key, window)
end
return {1, 0}
`;
export function loginLimiterConfig(env: Record<string, string | undefined> = process.env): LimiterConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL; const token = env.UPSTASH_REDIS_REST_TOKEN; const secret = env.AUTH_RATE_LIMIT_SECRET;
  if (!url || !token || !secret || secret.length < 32 || /\s/.test(token)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".upstash.io") || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
    return { url: parsed.origin, token, secret };
  } catch { return null; }
}
export function trustedLoginIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.NODE_ENV !== "production") return "127.0.0.1";
  if (env.VERCEL !== "1") throw new Error("Trusted proxy configuration required");
  // Vercel overwrites this header at its edge. Never trust client X-Forwarded-For.
  const ip = headers.get("x-vercel-forwarded-for")?.split(",")[0].trim();
  if (!ip || !isIP(ip)) throw new Error("Trusted client address unavailable");
  return ip;
}
/** Durable atomic slots include in-flight calls; success removes only its own slot. */
export function createLoginLimiter(config: LimiterConfig, transport: typeof fetch = fetch) {
  const digest = (value: string) => createHmac("sha256", config.secret).update(value).digest("hex");
  async function command(body: (string | number)[]): Promise<unknown> {
    const response = await transport(config.url, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Login protection unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || "error" in data || !("result" in data)) throw new Error("Login protection unavailable");
    return data.result;
  }
  return {
    async reserve(email: string, ip: string): Promise<{ allowed: boolean; retryAfter: number; ticket: Ticket }> {
      const ticket = { key: `o2c:{login}:account:${digest(email.trim().toLowerCase())}`, id: randomUUID() };
      const result = await command(["EVAL", reserveScript, 2, ticket.key, `o2c:{login}:ip:${digest(ip)}`, ticket.id]);
      if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0]) || !Number.isInteger(result[1]) || result[1] < 0 || result[1] > 900
        || (result[0] === 1 && result[1] !== 0) || (result[0] === 0 && result[1] === 0)) throw new Error("Invalid login protection result");
      return { allowed: result[0] === 1, retryAfter: result[1], ticket };
    },
    async succeed(ticket: Ticket): Promise<void> {
      const result = await command(["ZREM", ticket.key, ticket.id]);
      if (result !== 0 && result !== 1) throw new Error("Invalid login protection result");
    },
  };
}
