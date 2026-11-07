/** Server-only sessions: opaque tokens are never readable by browser JavaScript. */
export function sessionCookieOptions(env: Record<string, string | undefined> = process.env) {
  return { httpOnly: true, sameSite: "lax" as const, secure: env.VERCEL === "1" || (env.NODE_ENV === "production" && env.AUTH_LOGIN_IP_SOURCE !== "loopback"), path: "/" };
}
