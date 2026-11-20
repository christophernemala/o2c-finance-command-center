"use client";
import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { parseCsv } from "@/lib/imports";
import { parseEclDetailRows, parseEclRunDetail, type EclProvisionResult } from "@/lib/ecl-provisions";
import { eclDetailHeaders } from "@/lib/source-adapters";
import { readXlsx, type Sheet } from "@/lib/xlsx-read";
import type { Snapshot } from "@/types/workspace";
import { Badge, Empty, Money, Panel } from "./ui";

const maxFileBytes = 8 * 1024 * 1024;
type EclRun = Snapshot["ecl_runs"][number];

export function EclProvisionList({ runs }: { runs: EclRun[] }) {
  const runDetails = useMemo(() => runs.map(run => ({ run, ...parseEclRunDetail(run.scenario, `Preserved run ${run.id}`) })), [runs]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [analysis, setAnalysis] = useState<EclProvisionResult | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const runOptions = runDetails.filter(item => item.result || item.error);
  const selectedRun = runOptions.find(item => item.run.id === selectedRunId) ?? runOptions[0];

  function showSheet(sheet: Sheet, label: string) {
    if (sheet.truncated) throw new Error("This worksheet exceeds 2,000 data rows or 60 columns. Split it into smaller source files.");
    if (sheet.contains_formulas) throw new Error("Formula cells are not accepted. Upload a source workbook with reviewed values only.");
    setAnalysis(parseEclDetailRows(sheet.rows, { sourceLabel: label }));
    setError("");
  }
  async function readFile(file?: File) {
    setAnalysis(null); setSheets([]); setFileName(""); setError(""); setSheetName("");
    if (!file) return;
    try {
      if (file.size > maxFileBytes) throw new Error("Choose a CSV or XLSX file up to 8 MB.");
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv")) {
        const result = parseEclDetailRows(parseCsv(await file.text()), { sourceLabel: `${file.name} · local analysis only` });
        setAnalysis(result); setFileName(file.name); return;
      }
      if (!name.endsWith(".xlsx")) throw new Error("Choose a .csv or .xlsx customer detail file.");
      const workbook = readXlsx(new Uint8Array(await file.arrayBuffer()));
      if (!workbook.length) throw new Error("The workbook has no readable worksheet.");
      setSheets(workbook); setFileName(file.name);
      const first = workbook[0]; setSheetName(first.name); showSheet(first, `${file.name} · ${first.name} · local analysis only`);
    } catch (cause) {
      setAnalysis(null); setError(cause instanceof Error ? cause.message : "The source file could not be validated.");
    }
  }
  function selectSheet(name: string) {
    setSheetName(name);
    const sheet = sheets.find(item => item.name === name);
    if (!sheet) return;
    try { showSheet(sheet, `${fileName} · ${sheet.name} · local analysis only`); }
    catch (cause) { setAnalysis(null); setError(cause instanceof Error ? cause.message : "Worksheet validation failed."); }
  }
  function clearAnalysis() { setAnalysis(null); setError(""); setSheets([]); setFileName(""); setSheetName(""); }
  const displayed = analysis;
  return <div className="space-y-6">
    <Panel title="Preserved ECL measurement runs" subtitle="Model assumptions and aggregate results are supplied by your governed measurement process.">
      {runs.length ? <div className="divide-y divide-line">{runs.map(run => <article key={run.id} className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Model {run.model_version} · {run.as_of}</h3><Badge value={run.status}/></div><p>Aggregate allowance: <Money value={run.allowance}/></p><p className="break-all text-sm text-muted">Exposure snapshot: {run.exposure_snapshot}</p><details><summary>Scenarios, weights, overlays, and lineage</summary><pre role="region" aria-label="Preserved ECL scenario JSON" tabIndex={0} className="mt-3 overflow-auto rounded bg-surface-muted p-4 text-xs">{run.scenario}</pre></details></article>)}</div>
        : <div className="p-5 sm:p-6"><Empty title="No preserved ECL runs on this page">Connect a governed ECL measurement process with frozen exposure, model version, scenarios, overlays, and approval evidence. No default loss rates or automatic provisions are applied.</Empty></div>}
    </Panel>
      <Panel title="Customer-level provision detail" subtitle="Only source-provided customer rows from a recognized preserved run are shown here; the aggregate run is never allocated across customers.">
      {runOptions.length ? <div className="p-5 sm:p-6">
        <label className="block max-w-xl text-sm font-medium">Preserved ECL run
          <select className="mt-2 w-full" value={selectedRun?.run.id ?? selectedRunId} onChange={event => setSelectedRunId(event.target.value)}>{runOptions.map(({ run }) => <option key={run.id} value={run.id}>Model {run.model_version} · {run.as_of} · {run.status} · AED {run.allowance}</option>)}</select>
        </label>
        {selectedRun?.error ? <p role="alert" className="mt-4 rounded-xl border border-warning p-4 text-sm">Run customer detail was present but failed validation: {selectedRun.error}</p>
          : selectedRun?.result ? <ProvisionResult result={selectedRun.result} runAllowance={selectedRun.run.allowance} runStatus={selectedRun.run.status}/>
          : <p className="mt-4 text-sm text-muted">This preserved run has no versioned customer-level detail. Its aggregate allowance cannot be split into customer amounts without source rows.</p>}
      </div> : <div className="p-5 sm:p-6"><p className="text-sm text-muted">No preserved ECL run includes the versioned <code>customer_provisions</code> detail. Aggregate balances are not allocated to customers.</p></div>}
      <div className="border-t border-line p-5 sm:p-6"><h3 className="font-semibold">Supply a customer detail schema to your governed ECL run</h3><p className="mt-2 text-sm leading-6 text-muted">For run-backed rows, the trusted source can include <code>schema_version: o2c.ecl-customer-detail.v1</code>, <code>detail_complete</code>, and <code>customer_provisions</code> in the run’s scenario JSON. Each detail row must carry the exact fields listed below. A source connector or privileged ingestion workflow is not configured here.</p><pre role="region" aria-label="Customer detail schema example" tabIndex={0} className="mt-3 overflow-auto rounded-xl bg-surface-muted p-3 text-xs">{`{
  "schema_version": "o2c.ecl-customer-detail.v1",
  "detail_complete": true,
  "customer_provisions": [
    { "account": "…", "customer": "…", "exposure": "0.00", "pd_percent": "0.00", "lgd_percent": "0.00", "source_provision": "0.00", "currency": "AED", "source_reference": "…" }
  ]
}`}</pre></div>
    </Panel>
    <Panel title="Analyze an ECL detail file" subtitle="CSV/XLSX, exact AED fields, local-only arithmetic check. No upload or database write.">
      <div className="space-y-4 p-5 sm:p-6">
        <label className="block text-sm font-medium">Choose customer-level ECL detail<input className="mt-2 block w-full" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void readFile(event.target.files?.[0])}/></label>
        <p className="text-xs leading-5 text-muted">Exact headers and order: <code className="break-all">{eclDetailHeaders.join(", ")}</code>. CSV up to 1 MB; XLSX up to 8 MB; up to 2,000 rows; formula cells and non-AED amounts are rejected. This file is read in your browser only and is not saved.</p>
        {sheets.length > 1 && <label className="block text-sm">Worksheet<select className="mt-2 w-full" value={sheetName} onChange={event => selectSheet(event.target.value)}>{sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}{sheet.truncated ? " · exceeds safe limit" : ""}</option>)}</select></label>}
        {error && <p role="alert" className="rounded-xl border border-warning p-4 text-sm">{error}</p>}
        {displayed && <><ProvisionResult result={displayed}/><button type="button" className="button secondary" onClick={clearAnalysis}>Clear local analysis</button></>}
      </div>
    </Panel>
    <p className="rounded-xl border border-line bg-surface-muted p-4 text-xs leading-5 text-muted"><strong>Limit:</strong> the displayed check calculates exposure × PD × LGD and compares it with the source provision values. It does not model staging, lifetime probability curves, discounting, forward-looking scenarios, overlays, write-offs or governance choices, and is not an IFRS 9 conclusion or an accounting posting. The supplied approved run remains authoritative.</p>
  </div>;
}

function ProvisionResult({ result, runAllowance, runStatus }: { result: EclProvisionResult; runAllowance?: string; runStatus?: string }) {
  const runDetailDifference = runAllowance === undefined ? null : new Decimal(result.total_source_provision).minus(runAllowance).toFixed(2);
  return <div className="mt-5 space-y-4">
    <div className="rounded-xl border border-line bg-surface-muted p-4"><div className="flex flex-wrap items-center justify-between gap-3"><strong>{result.source_label}</strong><span className="data-scope">{result.complete ? "Source marks detail complete" : "Completeness not asserted"}</span></div><p className="mt-2 text-xs text-muted">{result.source_rows} source line(s) · {result.customers.length} customer account(s) · arithmetic cross-check only</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs text-muted">Exposure in detail</dt><dd className="mt-1"><Money value={result.total_exposure}/></dd></div><div><dt className="text-xs text-muted">Simple EAD × PD × LGD</dt><dd className="mt-1"><Money value={result.total_simple_ecl}/></dd></div><div><dt className="text-xs text-muted">Source provision total</dt><dd className="mt-1"><Money value={result.total_source_provision}/></dd></div><div><dt className="text-xs text-muted">Arithmetic difference</dt><dd className="mt-1"><Money value={result.total_difference}/></dd></div></dl>
      {runAllowance && runDetailDifference !== null && <p className="mt-3 text-xs leading-5 text-muted">Preserved run allowance: <Money value={runAllowance}/> · customer-source provision subtotal less run allowance: <Money value={runDetailDifference}/> · run status: {runStatus}. A difference is disclosed, not auto-reconciled.</p>}
    </div>
    <ul className="record-cards" aria-label="Customer-level provision detail">{result.customers.map(row => <li className="record-card" key={row.account}><div className="record-card-header"><div><strong>{row.customer}</strong><p>{row.account} · {row.rows} source row(s)</p></div><span className="data-scope">AED</span></div><dl><div><dt>Exposure</dt><dd><Money value={row.exposure}/></dd></div><div><dt>Simple formula check</dt><dd><Money value={row.simple_ecl}/></dd></div><div><dt>Source provision</dt><dd><Money value={row.source_provision}/></dd></div><div><dt>Difference</dt><dd><Money value={row.difference}/></dd></div></dl><details className="mt-3 text-xs"><summary>Inspect source references</summary><ul className="mt-2 list-disc space-y-1 pl-5">{row.source_references.map((reference, index) => <li key={`${reference}-${index}`} className="break-all">{reference}</li>)}</ul></details></li>)}</ul>
    <div className="desktop-record-table overflow-auto"><table><caption className="sr-only">Customer-level provision calculation and source comparison</caption><thead><tr><th scope="col">Customer / account</th><th scope="col" className="money">Exposure</th><th scope="col" className="money">EAD × PD × LGD</th><th scope="col" className="money">Source provision</th><th scope="col" className="money">Difference</th><th scope="col">Source references</th></tr></thead><tbody>{result.customers.map(row => <tr key={row.account}><th scope="row">{row.customer}<p className="text-xs font-normal">{row.account} · {row.rows} row(s)</p></th><td className="money"><Money value={row.exposure}/></td><td className="money"><Money value={row.simple_ecl}/></td><td className="money"><Money value={row.source_provision}/></td><td className="money"><Money value={row.difference}/></td><td>{row.source_references.join(", ")}</td></tr>)}</tbody></table></div>
  </div>;
}
