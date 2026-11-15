"use client";
import { useRef, useState, type FormEvent } from "react";
import { Bot, FileSpreadsheet, Paperclip, Send, Wrench, X } from "lucide-react";
import { Spinner } from "./ui/controls";
import type { AiSpendStatus } from "@/types/agents";

export interface PendingCopilotRequest { requestId: string; message: string; files: { id: string; name: string }[]; allowProposals: boolean }
interface Turn { role: "user" | "assistant"; content: string; tools?: { tool: string; status: string }[]; error?: boolean; retryable?: boolean; retry?: PendingCopilotRequest }
const suggestions = [
  "Who are my top 5 overdue customers and how much do they owe?",
  "Summarise AR aging and tell me what changed risk-wise.",
  "Which bank credits can be matched to invoices today?",
  "What are DSO and CEI right now, and how are they calculated?",
];
const toolNames: Record<string, string> = { get_ar_overview: "AR position", list_invoices: "invoices", get_cash_match_candidates: "cash matching", get_ar_kpi_pack: "KPI pack", read_uploaded_file: "uploaded file", propose_receipt: "receipt proposal", propose_allocation: "allocation proposal" };
const isZero = (value: string | null) => value === null || /^0(?:\.0+)?$/.test(value);

/** Streams answers from /api/copilot. Nothing is stored in browser storage; history lives in PostgreSQL. */
const MAX_FILES = 5; // matches the /api/copilot files limit
export function Copilot({ tenant, entity, thread, initial, aiReady, canWrite, budget, pending = null }: { tenant: string; entity: string; thread: string; initial: Turn[]; aiReady: boolean; canWrite: boolean; budget: AiSpendStatus | null; pending?: PendingCopilotRequest | null }) {
  const [turns, setTurns] = useState<Turn[]>(() => pending ? [...initial, { role: "assistant", content: "This Copilot request was interrupted or may still be running. Check its saved status below; no duplicate model call will be started.", error: true, retryable: true, retry: pending }] : initial);
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]); const [uploading, setUploading] = useState(false); const [notice, setNotice] = useState("");
  const [recovering, setRecovering] = useState(!!pending);
  const [allowProposals, setAllowProposals] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null); const end = useRef<HTMLDivElement>(null);
  const aiAllowed = aiReady && !!budget?.configured && !budget.paused && !isZero(budget.remaining_usd);
  const update = (change: (turn: Turn) => Turn) => setTurns(current => current.length ? [...current.slice(0, -1), change(current[current.length - 1])] : current);

  async function send(request: PendingCopilotRequest) {
    setBusy(true); setNotice("");
    update(turn => ({ ...turn, content: "", error: false, retryable: false, retry: request, tools: [] }));
    try {
      const response = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, entity, thread, requestId: request.requestId, message: request.message, files: request.files, allowProposals: request.allowProposals }) });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: "The Copilot is unavailable." }));
        update(turn => ({ ...turn, content: body.error ?? "The Copilot is unavailable.", error: true, retryable: true, retry: request })); return;
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.split("\n").find(entry => entry.startsWith("data: ")); if (!line) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; delta?: string; tool?: string; status?: string; text?: string; message?: string };
          if (event.type === "text") update(turn => ({ ...turn, content: turn.content + event.delta }));
          if (event.type === "tool") update(turn => ({ ...turn, content: turn.content && !turn.content.endsWith("\n") ? `${turn.content}\n` : turn.content, tools: [...(turn.tools ?? []).filter(row => !(row.tool === event.tool && row.status === "running")), { tool: event.tool!, status: event.status! }] }));
          if (event.type === "done") { setRecovering(false); update(turn => ({ ...turn, content: event.text ?? turn.content, error: false, retryable: false })); }
          if (event.type === "error") { setRecovering(false); update(turn => ({ ...turn, content: event.message ?? "Something went wrong.", error: true, retryable: true, retry: request })); }
        }
        end.current?.scrollIntoView({ block: "end" });
      }
    } catch {
      update(turn => ({ ...turn, content: "The connection was interrupted. Retry this same request to retrieve its result; the server will not start a duplicate model call.", error: true, retryable: true, retry: request }));
    } finally { setBusy(false); }
  }
  async function ask(question: string) {
    if (!question.trim() || busy || recovering || !aiAllowed) return;
    const attached = files; const proposalPermission = canWrite && allowProposals;
    const request: PendingCopilotRequest = { requestId: globalThis.crypto.randomUUID(), message: question, files: attached, allowProposals: proposalPermission };
    setFiles([]); setDraft(""); setAllowProposals(false);
    setTurns(current => [...current, { role: "user", content: question + (attached.length ? `\n${attached.map(file => file.name).join(", ")}` : "") },
      { role: "assistant", content: "", tools: [], retry: request }]);
    await send(request);
  }
  async function retry(request: PendingCopilotRequest) { if (busy) return; await send(request); }
  async function upload(file: File) {
    if (!aiAllowed) { setNotice("AI is disabled until a workspace administrator configures an available daily budget."); if (fileInput.current) fileInput.current.value = ""; return; }
    if (uploading || files.length >= MAX_FILES) { setNotice(uploading ? "Wait for the current upload to finish." : `Attach at most ${MAX_FILES} files to one question.`); if (fileInput.current) fileInput.current.value = ""; return; }
    setUploading(true); setNotice("");
    const form = new FormData(); form.set("tenant", tenant); form.set("entity", entity); form.set("file", file);
    try {
      const response = await fetch("/api/copilot/files", { method: "POST", body: form }); const body = await response.json();
      if (!response.ok) setNotice(body.error ?? "Upload failed."); else setFiles(current => [...current, body]);
    } catch { setNotice("Upload failed."); } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(draft); };
  const budgetMessage = !aiReady ? "AI provider is not configured on this server." : !budget ? "AI budget status is unavailable; model calls are blocked until it can be checked." : !budget.configured
    ? "AI is disabled until a workspace administrator sets a daily USD budget." : budget.paused ? "AI is paused because the daily budget is set to USD 0." : isZero(budget.remaining_usd)
      ? `The daily AI budget is exhausted for ${budget.date} (Asia/Dubai).` : `Daily budget: USD ${budget.daily_limit_usd} · estimated used: USD ${budget.spent_usd} · held: USD ${budget.reserved_usd} · remaining: USD ${budget.remaining_usd} (${budget.date}, Asia/Dubai).`;

  return <section aria-label="O2C Copilot" className="flex min-h-[640px] flex-col rounded-[22px] border border-line bg-canvas">
    <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6" aria-live="polite">
      {!turns.length && <div className="mx-auto max-w-2xl py-10 text-center"><span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-link"><Bot size={24} aria-hidden="true"/></span>
        <h2 className="text-xl font-semibold">Ask about your receivables</h2><p className="mt-2 text-sm text-muted">Answers come from live tool calls against this legal entity. Attach a CSV or Excel file to analyse it alongside your ledger.</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">{suggestions.map(text => <button key={text} type="button" disabled={!aiAllowed || busy || recovering} onClick={() => void ask(text)} className="rounded-xl border border-line bg-surface p-3 text-left text-sm hover:border-primary">{text}</button>)}</div></div>}
      {turns.map((turn, index) => <div key={index} className={`chat-bubble ${turn.role}${turn.error ? " border-danger text-danger" : ""}`}>
        {turn.role === "assistant" && !!turn.tools?.length && <ul className="mb-2 flex flex-wrap gap-2 whitespace-normal">{turn.tools.map((row, i) => <li key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-1 text-xs text-muted">{row.status === "running" ? <Spinner size={12}/>:<Wrench size={12} aria-hidden="true"/>}{toolNames[row.tool] ?? row.tool}{row.status === "error" ? " · failed" : ""}</li>)}</ul>}
        {turn.content || (busy && index === turns.length - 1 ? <span className="inline-flex items-center gap-2 text-muted"><Spinner size={14}/>Working…</span> : "")}
        {turn.role === "assistant" && turn.error && turn.retryable && turn.retry && <button type="button" className="button secondary mt-3" disabled={busy} onClick={() => void retry(turn.retry!)}>Retry/check this same request (no duplicate model call)</button>}
      </div>)}
      <div ref={end}/>
    </div>
    <form onSubmit={submit} className="border-t border-line bg-surface p-4">
      {(files.length > 0 || notice) && <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">{files.map(file => <span key={file.id} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-link"><FileSpreadsheet size={14} aria-hidden="true"/>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter(row => row.id !== file.id))}><X size={14}/></button></span>)}{notice && <span className="text-danger">{notice}</span>}</div>}
      {canWrite && <label className="mb-3 flex items-start gap-2 text-xs leading-5 text-muted"><input type="checkbox" checked={allowProposals} onChange={event => setAllowProposals(event.target.checked)} disabled={!aiAllowed || busy || recovering} className="mt-1"/><span>Allow Copilot to create pending proposals for this message. An independent approver must still review them.</span></label>}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" accept=".csv,.xlsx" className="sr-only" id="copilot-file" disabled={!aiAllowed || uploading || busy || recovering} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
        <label htmlFor="copilot-file" className={`button secondary shrink-0 cursor-pointer${!aiAllowed || recovering ? " pointer-events-none opacity-60" : ""}`} aria-label="Attach CSV or Excel file">{uploading ? <Spinner size={18}/>:<Paperclip size={18}/>}</label>
        <label className="sr-only" htmlFor="copilot-input">Message</label>
        <textarea id="copilot-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} rows={1} disabled={!aiAllowed || recovering} placeholder={recovering ? "Check the pending Copilot request before asking another question" : !aiReady ? "AI provider not configured" : aiAllowed ? "Ask about customers, invoices, cash, KPIs or an attached file…" : "Set an available workspace AI budget to continue"} className="min-h-[48px] flex-1"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); } }}/>
        <button className="button shrink-0" disabled={!aiAllowed || busy || recovering || !draft.trim()} aria-label="Send">{busy ? <Spinner size={18}/>:<Send size={18}/>}</button>
      </div>
      <p className="mt-2 text-xs text-muted">{budgetMessage}</p>
      <p className="mt-2 text-xs text-muted">{canWrite ? "Copilot is read-only unless you enable proposal permission for that message. It cannot approve or post a proposal." : "This role can ask questions and view data, but cannot create proposals through Copilot."}</p>
    </form>
  </section>;
}
