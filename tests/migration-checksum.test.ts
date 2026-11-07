import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { migrationChecksumMatches } from "../src/lib/postgres/migration-checksum";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
test("migration integrity accepts historical Windows and Unix line endings", () => {
  const sql = "begin;\nselect 1;\ncommit;\n";
  const windows = sql.replaceAll("\n", "\r\n");
  assert.equal(migrationChecksumMatches(sql, digest(windows)), true);
  assert.equal(migrationChecksumMatches(windows, digest(sql)), true);
  assert.equal(migrationChecksumMatches(sql, digest(sql)), true);
});
test("migration integrity still rejects changed SQL, comments and whitespace", () => {
  const hash = digest("select 1;\n");
  for (const changed of ["select 2;\n", "select 1; -- changed\n", "select  1;\n", "select 1;"])
    assert.equal(migrationChecksumMatches(changed, hash), false);
});
