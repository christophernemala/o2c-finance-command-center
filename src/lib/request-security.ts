/** Compare the browser Origin with the actual HTTP Host; Next may normalize its internal URL. */
export function sameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin"); const host = headers.get("host");
  if (!origin || !host || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    return ["https:", "http:"].includes(parsed.protocol) && parsed.host.toLowerCase() === host.toLowerCase() && parsed.origin === origin;
  } catch { return false; }
}
