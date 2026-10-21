import { parseCsv } from "./imports";
export interface SegmentRow { account: string; category: string; region: string }
export interface SegmentPreview { rows: SegmentRow[]; errors: string[] }
/** One customer from the form: a blank field keeps the current value (its key is omitted); clearing is explicit. */
export function singleSegmentRow(input: { account: string; category: string; region: string; clear_category?: boolean; clear_region?: boolean }): Partial<SegmentRow> & { account: string } {
  const row: Partial<SegmentRow> & { account: string } = { account: input.account };
  if (input.clear_category) row.category = ""; else if (input.category) row.category = input.category;
  if (input.clear_region) row.region = ""; else if (input.region) row.region = input.region;
  return row;
}
const header = ["account", "category", "region"];
// A value that a spreadsheet would run as a formula is refused rather than silently altered.
const formula = /^[=+\-@\t\r]/;
/** Parse an account,category,region CSV. An empty category or region clears it. */
export function parseSegments(text: string): SegmentPreview {
  const errors: string[] = []; let grid: string[][];
  try { grid = parseCsv(text); } catch (error) { return { rows: [], errors: [error instanceof Error ? error.message : "Unreadable CSV."] }; }
  const head = (grid.shift() ?? []).map(cell => cell.toLowerCase());
  if (head.join(",") !== header.join(",")) return { rows: [], errors: [`The first row must be exactly: ${header.join(",")}`] };
  if (!grid.length) return { rows: [], errors: ["The file has no rows."] };
  const seen = new Set<string>(); const rows: SegmentRow[] = [];
  grid.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== 3) { errors.push(`Row ${line}: expected 3 columns.`); return; }
    const [account, category, region] = cells;
    if (!account || account.length > 60) errors.push(`Row ${line}: account is required (at most 60 characters).`);
    else if (seen.has(account)) errors.push(`Row ${line}: account ${account} appears more than once.`);
    for (const [name, value] of [["category", category], ["region", region]] as const) {
      if (value.length > 60) errors.push(`Row ${line}: ${name} is longer than 60 characters.`);
      if (formula.test(value)) errors.push(`Row ${line}: ${name} cannot start with = + - or @.`);
      if (value.toLowerCase() === "unassigned") errors.push(`Row ${line}: "Unassigned" is reserved; leave ${name} empty instead.`);
    }
    seen.add(account); rows.push({ account, category, region });
  });
  return { rows: errors.length ? [] : rows, errors: errors.slice(0, 20) };
}
