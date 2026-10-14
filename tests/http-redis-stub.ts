/** Test-only fake transport; never loaded by the application or production scripts. */
if (process.env.O2C_HTTP_TEST !== "1") throw new Error("HTTP test transport requires explicit test mode");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (new URL(url).origin === "https://o2c-http-test.upstash.io") {
    const command = JSON.parse(input instanceof Request ? await input.clone().text() : String(init?.body));
    return Response.json({ result: String(command[1]).includes("ZREM', key, ARGV") ? 1 : [1, 0] });
  }
  return original(input, init);
};
