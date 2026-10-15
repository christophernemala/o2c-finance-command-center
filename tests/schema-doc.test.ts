import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { schemaMarkdown } from "../scripts/schema-doc";
test("docs/SCHEMA.md matches the migrations", async () => {
  const committed = await readFile(new URL("../docs/SCHEMA.md", import.meta.url), "utf8");
  assert.equal(committed, await schemaMarkdown(), "Run `npm run docs:schema` and commit the result.");
});
