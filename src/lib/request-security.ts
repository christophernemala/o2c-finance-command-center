/** Compare the browser Origin with the actual HTTP Host; Next may normalize its internal URL. */
export function sameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin"); const host = headers.get("host");
  if (!origin || !host || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    return ["https:", "http:"].includes(parsed.protocol) && parsed.host.toLowerCase() === host.toLowerCase() && parsed.origin === origin;
  } catch { return false; }
}

/** Bound actual streamed bytes before the multipart parser allocates file buffers. */
export async function boundedFormRequest(request: Request, limit: number): Promise<Request | Response> {
  const reject = () => new Response("Request too large", { status: 413, headers: { "Cache-Control": "no-store" } });
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return reject();
  if (!request.body) return reject();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return reject(); }
      chunks.push(value);
    }
  } catch {
    return new Response("Invalid request", { status: 400, headers: { "Cache-Control": "no-store" } });
  } finally { reader.releaseLock(); }
  if (!size) return reject();
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: bytes });
}
