"use client";
import { useRef, useState } from "react";
import { previewImport, previewImportRows, columns, type ImportKind, type ImportPreview } from "@/lib/imports";
import { readXlsx, type Sheet } from "@/lib/xlsx-read";
import { Money } from "./ui";
import { MutationForm } from "./mutation-form";
const MAX_CSV_BYTES = 1 * 1024 * 1024;
const MAX_XLSX_BYTES = 8 * 1024 * 1024;
function tryPreview(sheet: Sheet, kind: ImportKind) {
  if (sheet.truncated) throw new Error("This worksheet exceeds the safe import limit. Split it into files of no more than 2,000 data rows and 60 columns.");
  if (sheet.contains_formulas) throw new Error("Formula cells are not accepted for finance source imports. Paste the verified values into a new workbook and upload that file.");
  return previewImportRows(sheet.rows, kind);
}
export function ImportReview({ tenant, entity }: { tenant: string; entity: string }) {
  const [kind, setKind] = useState<ImportKind>("invoices"); const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]); const [sheetName, setSheetName] = useState("");
  const [error, setError] = useState(""); const [reading, setReading] = useState(false); const generation = useRef(0);
  function clearPreview() { generation.current++; setPreview(null); setSheets([]); setSheetName(""); setError(""); setReading(false); }
  function selectSheet(name: string, workbook = sheets, selectedKind = kind) {
    setSheetName(name); setPreview(null); setError("");
    const sheet = workbook.find(entry => entry.name === name);
    if (!sheet) { setError("Choose a worksheet from this workbook."); return; }
    try { setPreview(tryPreview(sheet, selectedKind)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not validate this worksheet."); }
  }
  async function read(file?: File) {
    const revision = ++generation.current; setPreview(null); setSheets([]); setSheetName(""); setError("");
    if (!file) return;
    setReading(true);
    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) throw new Error("Choose a .csv or .xlsx file.");
      const limit = name.endsWith(".csv") ? MAX_CSV_BYTES : MAX_XLSX_BYTES;
      if (file.size > limit) throw new Error(name.endsWith(".csv") ? "Choose a CSV file up to 1 MB." : "Choose an XLSX file up to 8 MB.");
      if (name.endsWith(".csv")) {
        const result = previewImport(await file.text(), kind);
        if (revision === generation.current) setPreview(result);
      } else if (name.endsWith(".xlsx")) {
        const workbook = readXlsx(new Uint8Array(await file.arrayBuffer()));
        if (!workbook.length) throw new Error("The Excel workbook has no readable worksheets.");
        let chosen = workbook[0];
        for (const candidate of workbook) {
          try { tryPreview(candidate, kind); chosen = candidate; break; }
          catch { /* Look for a worksheet with the exact required source headers. */ }
        }
        if (revision === generation.current) {
          setSheets(workbook);
          selectSheet(chosen.name, workbook, kind);
        }
    }
    } catch (reason) { if (revision === generation.current) setError(reason instanceof Error ? reason.message : "Could not read file."); }
    finally { if (revision === generation.current) setReading(false); }
  }
  return <MutationForm upload>
    <input type="hidden" name="tenant" value={tenant}/><input type="hidden" name="entity" value={entity}/><input type="hidden" name="view" value="imports"/><input type="hidden" name="intent" value="stage"/>
    <input type="hidden" name="sheet" value={sheetName}/>
    <label>Import type<select name="kind" value={kind} onChange={event => { clearPreview(); setKind(event.target.value as ImportKind); }}><option value="invoices">Open invoices from your source system</option><option value="bank_lines">Bank statement lines</option></select></label>
    <p className="text-sm leading-6 text-muted">Exact headers: <code className="break-all">{columns[kind].join(", ")}</code>. Amounts use a decimal point without thousands separators. All currencies must be AED. Invoice imports must contain gross, entirely unpaid invoices; partially paid opening balances require a controlled migration.</p>
    <p className="rounded-lg border border-line bg-surface-muted p-3 text-xs leading-5">This screen stages only those exact invoice/bank file schemas. Copilot table analysis is conversation-only; ECL detail is a separate browser-local check. No arbitrary ERP or bank API connector is configured; each needs dedicated credentials, mapping, validation and an approval path.</p>
    <label>CSV up to 1 MB or Excel workbook up to 8 MB · 2,000 data rows<input required type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void read(event.target.files?.[0])}/></label>
    {sheets.length > 1 && <label>Worksheet to import<select value={sheetName} onChange={event => selectSheet(event.target.value)}>{sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}{sheet.truncated ? " · exceeds safe limit" : ""}</option>)}</select></label>}
    {reading && <p role="status" className="text-muted">Validating workbook…</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {preview && <div className="rounded-lg border border-line p-4">
      <p className="font-medium">{preview.rows.length} valid rows · {preview.errors.length} rejected rows · control total <Money value={preview.total}/></p>
      <p className="mt-2 text-sm text-muted">Preview only. No records have been committed. {sheets.length ? `Worksheet: ${sheetName}.` : ""} An independent reviewer must still approve the staged batch.</p>
      {!!preview.errors.length && <ul className="mt-3 space-y-1 text-sm text-danger">{preview.errors.slice(0,20).map(message => <li key={message}>{message}</li>)}{preview.errors.length>20 && <li>{preview.errors.length-20} additional rejected rows. Correct the file before staging.</li>}</ul>}
      <details className="mt-3"><summary className="font-medium">Inspect first five validated rows</summary><pre role="region" aria-label="First five validated import rows" tabIndex={0} className="mt-3 max-h-64 overflow-auto text-xs">{JSON.stringify(preview.rows.slice(0,5),null,2)}</pre></details>
    </div>}
    <button className="button" disabled={!preview || reading || preview.errors.length>0 || !preview.rows.length}>Stage for independent review</button>
  </MutationForm>;
}
