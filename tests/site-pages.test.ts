import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import robots from "../src/app/robots";
import NotFound, { metadata as notFoundMeta } from "../src/app/not-found";
import Privacy from "../src/app/privacy/page";

test("robots disallows crawling the private application", () => {
  assert.deepEqual(robots(), { rules: [{ userAgent: "*", disallow: "/" }] });
});
test("404 page is branded and links back to the workspace", () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  assert.match(html, /This page does not exist/); assert.match(html, /href="\/"/); assert.equal(notFoundMeta.title, "Page not found");
});
test("privacy page is marked as a draft and names every data processor", () => {
  const html = renderToStaticMarkup(createElement(Privacy));
  assert.match(html, /Draft pending legal review/);
  for (const name of ["PostgreSQL", "Vercel", "Upstash", "Anthropic"]) assert.ok(html.includes(name), name);
});

test("the product is branded Closewise with role display names over unchanged stored roles", async () => {
  const { default: manifest } = await import("../src/app/manifest");
  const app = manifest();
  assert.equal(app.name, "Closewise");
  assert.equal(app.theme_color, "#ffffff");
  const { roleLabel } = await import("../src/lib/roles");
  assert.deepEqual(["admin", "approver", "maker", "viewer"].map(roleLabel), ["Admin", "AR Manager", "AR Clerk", "Viewer"]);
  assert.equal(roleLabel("unknown"), "unknown", "an unexpected stored value is shown as is, never mapped to a permission");
  for (const inherited of ["toString", "constructor", "__proto__"]) assert.equal(roleLabel(inherited), inherited, "inherited object keys are not labels");
});
