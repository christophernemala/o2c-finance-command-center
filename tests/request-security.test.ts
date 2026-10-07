import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/lib/request-security";
test("CSRF accepts the browser host despite internal Next URL normalization",()=>{
  assert.equal(sameOrigin(new Headers({host:"127.0.0.1:4174",origin:"http://127.0.0.1:4174"})),true);
  assert.equal(sameOrigin(new Headers({host:"finance.example",origin:"https://finance.example"})),true);
  for(const origin of ["null","https://attacker.example","https://finance.example:444","https://finance.example.evil.test","https://finance.example/path"]) assert.equal(sameOrigin(new Headers({host:"finance.example",origin})),false);
  assert.equal(sameOrigin(new Headers({host:"finance.example"})),false);
});
