"use client";
import { useRef, useState } from "react";
import { previewImport, columns, type ImportKind, type ImportPreview } from "@/lib/imports";
import { Money } from "./ui";
import { MutationForm } from "./mutation-form";
export function ImportReview({ tenant, entity }: { tenant: string; entity: string }) {
  const [kind, setKind] = useState<ImportKind>("invoices"); const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState(""); const [reading, setReading] = useState(false); const generation = useRef(0);
  async function read(file?: File) {
    const revision = ++generation.current; setPreview(null); setError(""); if (!file) return; setReading(true);
    try {
      if (file.size > 1024 * 1024 || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a UTF-8 CSV file up to 1 MB.");
      const result = previewImport(await file.text(), kind);
      if (revision === generation.current) setPreview(result);
    } catch (error) { if (revision === generation.current) setError(error instanceof Error ? error.message : "Could not read file."); }
    finally { if (revision === generation.current) setReading(false); }
  }
  return <MutationForm upload>
    <input type="hidden" name="tenant" value={tenant}/><input type="hidden" name="entity" value={entity}/><input type="hidden" name="view" value="imports"/><input type="hidden" name="intent" value="stage"/>
    <label>Import type<select name="kind" value={kind} onChange={event => { generation.current++; setKind(event.target.value as ImportKind); setPreview(null); setError(""); setReading(false); }}><option value="invoices">Open invoices from your source system</option><option value="bank_lines">Bank statement lines</option></select></label>
    <p className="text-sm leading-6 text-muted">Exact headers: <code className="break-all">{columns[kind].join(", ")}</code>. Amounts use a decimal point without thousands separators. All currencies must be AED. Invoice imports must contain gross, entirely unpaid invoices; partially paid opening balances require a controlled migration.</p>
    <label key={kind}>UTF-8 CSV · 1 MB · 2,000 rows<input required type="file" name="file" accept=".csv,text/csv" onChange={event => void read(event.target.files?.[0])}/></label>
    {reading && <p role="status" className="text-muted">Validating file…</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {preview && <div className="rounded-lg border border-line p-4">
      <p className="font-medium">{preview.rows.length} valid rows · {preview.errors.length} rejected rows · control total <Money value={preview.total}/></p>
      <p className="mt-2 text-sm text-muted">Preview only. No records have been committed.</p>
      {!!preview.errors.length && <ul className="mt-3 space-y-1 text-sm text-danger">{preview.errors.slice(0,20).map(message => <li key={message}>{message}</li>)}{preview.errors.length>20 && <li>{preview.errors.length-20} additional rejected rows. Correct the file before staging.</li>}</ul>}
      <details className="mt-3"><summary className="font-medium">Inspect first five validated rows</summary><pre className="mt-3 overflow-auto text-xs">{JSON.stringify(preview.rows.slice(0,5),null,2)}</pre></details>
    </div>}
    <button className="button" disabled={!preview || reading || preview.errors.length>0 || !preview.rows.length}>Stage for independent review</button>
  </MutationForm>;
}
