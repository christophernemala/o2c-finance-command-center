import { strFromU8, unzipSync } from "fflate";
import { parseCsv } from "./imports";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_ROWS = 5000, MAX_COLUMNS = 60, MAX_PART_BYTES = 20 * 1024 * 1024;
export interface Sheet { name: string; rows: string[][] }

const decode = (value: string) => value.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, entity: string) => {
  const named: Record<string, string> = { lt: "<", gt: ">", quot: "\"", apos: "'", amp: "&" };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
  return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
});
const text = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => decode(match[1])).join("");
function columnIndex(reference: string) {
  const letters = /^([A-Z]{1,3})\d+$/.exec(reference)?.[1]; if (!letters) return -1;
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** Read values (not formulas or styles) from an .xlsx workbook. Bounded against zip bombs and huge sheets. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes, { filter: file => file.originalSize <= MAX_PART_BYTES && (/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(file.name)) });
  const part = (name: string) => files[name] ? strFromU8(files[name]) : "";
  const workbook = part("xl/workbook.xml"); if (!workbook) throw new Error("Not an Excel workbook");
  const shared = [...part("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => text(match[1]));
  const targets = Object.fromEntries([...part("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map(match => [
    /\bId="([^"]+)"/.exec(match[0])?.[1], /\bTarget="([^"]+)"/.exec(match[0])?.[1]?.replace(/^\/?(xl\/)?/, "xl/")]));
  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].slice(0, 20).map(match => {
    const name = decode(/\bname="([^"]*)"/.exec(match[0])?.[1] ?? "Sheet");
    const relation = /\br:id="([^"]+)"/.exec(match[0])?.[1];
    const xml = part(targets[relation ?? ""] ?? "");
    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_ROWS) break;
      const values: string[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attributes = cell[1]; const body = cell[2] ?? "";
        const index = columnIndex(/\br="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? ""); const column = index < 0 ? values.length : index;
        if (column >= MAX_COLUMNS) continue;
        const type = /\bt="([^"]+)"/.exec(attributes)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? text(body) : type === "b" ? (raw === "1" ? "TRUE" : "FALSE") : decode(raw ?? "");
        while (values.length < column) values.push("");
        values[column] = value;
      }
      if (values.some(Boolean)) rows.push(values);
    }
    return { name, rows };
  });
}

/** One page of a CSV or XLSX file for the copilot. Numbers stay as the exact text stored in the file. */
export function describeWorkbook(bytes: Uint8Array, mediaType: string, sheet: string | null, offset: number, limit: number) {
  const sheets: Sheet[] = mediaType === XLSX_TYPE ? readXlsx(bytes) : [{ name: "CSV", rows: parseCsv(new TextDecoder().decode(bytes)) }];
  const selected = sheets.find(entry => entry.name === sheet) ?? sheets[0];
  if (!selected) throw new Error("The file has no sheets");
  const [header = [], ...data] = selected.rows;
  return {
    sheets: sheets.map(entry => ({ name: entry.name, data_rows: Math.max(entry.rows.length - 1, 0) })),
    sheet: selected.name, header, total_rows: data.length, offset,
    rows: data.slice(offset, offset + limit),
    note: data.length > offset + limit ? `More rows available; continue from offset ${offset + limit}.` : "End of sheet.",
  };
}
