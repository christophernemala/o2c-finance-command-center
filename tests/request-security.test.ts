import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/lib/request-security";
test("CSRF accepts the browser host despite internal Next URL normalization",()=>{
  assert.equal(sameOrigin(new Headers({host:"127.0.0.1:4174",origin:"http://127.0.0.1:4174"})),true);
  assert.equal(sameOrigin(new Headers({host:"finance.example",origin:"https://finance.example"})),true);
  for(const origin of ["null","https://attacker.example","https://finance.example:444","https://finance.example.evil.test","https://finance.example/path"]) assert.equal(sameOrigin(new Headers({host:"finance.example",origin})),false);
  assert.equal(sameOrigin(new Headers({host:"finance.example"})),false);
});

test("request limits count streamed bytes even with missing or forged lengths", async () => {
  const { boundedFormRequest } = await import("../src/lib/request-security");
  for (const length of [undefined, "1", "4"]) {
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
    if (length) headers.set("content-length", length);
    const result = await boundedFormRequest(new Request("https://finance.example/api", { method: "POST", headers, body: "a=12345" }), 4);
    assert.ok(result instanceof Response); assert.equal(result.status, 413);
  }
  const result = await boundedFormRequest(new Request("https://finance.example/api", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1" }), 3);
  assert.ok(result instanceof Request); assert.equal((await result.formData()).get("a"), "1");
});

test("session cookies are HttpOnly, same-site and secure on hosted production", async () => {
  const { sessionCookieOptions } = await import("../src/lib/auth/cookie-options");
  assert.deepEqual(sessionCookieOptions({ NODE_ENV: "production" }), { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  assert.equal(sessionCookieOptions({ NODE_ENV: "development" }).httpOnly, true);
  assert.equal(sessionCookieOptions({ NODE_ENV: "production", VERCEL: "1", AUTH_LOGIN_IP_SOURCE: "loopback" }).secure, true);
  assert.equal(sessionCookieOptions({ NODE_ENV: "production", AUTH_LOGIN_IP_SOURCE: "loopback" }).secure, false);
});
