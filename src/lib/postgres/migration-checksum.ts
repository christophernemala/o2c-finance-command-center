import { createHash } from "node:crypto";

/** Preserve migration integrity across LF/CRLF checkouts without accepting SQL edits. */
export function migrationChecksumMatches(sql: string, stored: string): boolean {
  const lf = sql.replaceAll("\r\n", "\n");
  return [sql, lf, lf.replaceAll("\n", "\r\n")].some(value =>
    createHash("sha256").update(value).digest("hex") === stored);
}
