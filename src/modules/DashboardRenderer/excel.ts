import { writeFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";

type SheetRows = Record<string, unknown>[];

export function exportWorkbook(path: string, sheets: Record<string, object[]>) {
  const entries: Record<string, Uint8Array> = {};
  const sheetNames = Object.keys(sheets);

  entries["[Content_Types].xml"] = xml(`[Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    ${sheetNames.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  </Types>`);
  entries["_rels/.rels"] = xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  entries["xl/_rels/workbook.xml.rels"] = xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetNames.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  entries["xl/workbook.xml"] = xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((name, i) => `<sheet name="${escapeXml(name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  entries["xl/styles.xml"] = xml(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Inter"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Inter"/></font><font><b/><sz val="15"/><color rgb="FFFFFFFF"/><name val="Inter"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F8BFF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B1F52"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`);

  sheetNames.forEach((name, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = xml(sheetXml(name, (sheets[name] ?? []) as SheetRows));
  });

  writeFileSync(path, Buffer.from(zipSync(entries)));
}

function sheetXml(title: string, rows: SheetRows) {
  const columns = Object.keys(rows[0] ?? {});
  const widthCols = columns.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i < 3 ? 28 : 18}" customWidth="1"/>`).join("");
  const titleRow = `<row r="1">${cell(1, 1, title, 2)}</row>`;
  const header = `<row r="2">${columns.map((column, i) => cell(2, i + 1, toHeader(column), 1)).join("")}</row>`;
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 3}">${columns.map((column, columnIndex) => cell(rowIndex + 3, columnIndex + 1, row[column])).join("")}</row>`).join("");
  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widthCols}</cols><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${titleRow}${header}${body}</sheetData></worksheet>`;
}

function cell(row: number, column: number, value: unknown, style = 0) {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
}

function columnName(index: number) {
  let name = "";
  while (index > 0) {
    const mod = (index - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    index = Math.floor((index - mod) / 26);
  }
  return name;
}

function toHeader(key: string) {
  if (key.includes(" ")) return key;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function xml(value: string) {
  return strToU8(value.trim());
}
