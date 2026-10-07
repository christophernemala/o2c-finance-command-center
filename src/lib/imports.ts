import { addAmounts, positiveAmount } from "./money";
export type ImportKind = "invoices" | "bank_lines";
export const columns = {
  invoices: ["number", "account", "customer", "issued_at", "due_date", "amount", "currency"],
  bank_lines: ["reference", "booked_at", "direction", "amount", "currency"],
} as const;
export interface ImportPreview { rows: Record<string, string>[]; total: string; errors: string[] }
/** Bounded RFC 4180 style parser. Quoted commas/newlines and escaped quotes are supported. */
export function parseCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).byteLength > 1024 * 1024) throw new Error("File limit is 1 MB.");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  const flushCell = () => { row.push(cell.trim()); cell = ""; closed = false; };
  const flushRow = () => { flushCell(); if (row.some(Boolean)) rows.push(row); row = []; if (rows.length > 2001) throw new Error("Row limit is 2,000."); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("Unexpected quote in CSV.");
      quoted = true;
    } else if (char === ",") flushCell();
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[i + 1] === "\n") i++; flushRow(); }
    else { if (closed) throw new Error("Unexpected content after quoted CSV field."); cell += char; }
    if (cell.length > 4000) throw new Error("Field limit is 4,000 characters.");
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (cell || row.length || closed) flushRow();
  return rows;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function previewImport(text: string, kind: ImportKind): ImportPreview {
  const grid = parseCsv(text); const expected: readonly string[] = columns[kind];
  const headers = grid.shift() ?? [];
  if (headers.length !== expected.length || new Set(headers).size !== headers.length || expected.some(key => !headers.includes(key))) {
    throw new Error(`Required headers: ${expected.join(", ")}.`);
  }
  if (!grid.length) throw new Error("File has no data rows.");
  const rows: Record<string, string>[] = []; const errors: string[] = []; const seen = new Set<string>();
  grid.forEach((values, index) => {
    try {
      if (values.length !== headers.length) throw new Error("Column count differs from the header.");
      const row = Object.fromEntries(headers.map((key, i) => [key, values[i]]));
      if (values.some(value => !value || value.length > 200)) throw new Error("All fields are required; maximum length is 200.");
      if (row.currency !== "AED") throw new Error("Currency must be AED.");
      row.amount = positiveAmount(row.amount);
      for (const key of kind === "invoices" ? ["issued_at", "due_date"] : ["booked_at"]) {
        if (!validDate(row[key])) throw new Error(`${key} must be a valid YYYY-MM-DD date.`);
      }
      if (kind === "bank_lines" && !["credit", "debit"].includes(row.direction)) throw new Error("Direction must be credit or debit.");
      const identity = row.number ?? row.reference;
      if (identity.length > (kind === "invoices" ? 100 : 200)) throw new Error("Reference is too long.");
      if (kind === "invoices" && row.account.length > 100) throw new Error("Account is too long.");
      if (seen.has(identity)) throw new Error("Duplicate reference in this file.");
      seen.add(identity); rows.push(row);
    } catch (error) { errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid row."}`); }
  });
  return { rows, total: addAmounts(rows.map(row => row.amount)), errors };
}
