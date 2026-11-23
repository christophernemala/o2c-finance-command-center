"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, BarChart3, Check, ClipboardCheck, FileSpreadsheet, Gauge, Landmark, Paperclip, Send, ShieldCheck, Sparkles, TriangleAlert, Wrench, X } from "lucide-react";
import { Spinner } from "./ui/controls";
import { CopilotMascot } from "./copilot-mascot";
import type { AiSpendStatus } from "@/types/agents";

export interface PendingCopilotRequest { requestId: string; message: string; files: { id: string; name: string }[]; allowProposals: boolean }
type ToolStatus = "running" | "ok" | "error";
interface ToolUse { tool: string; status: ToolStatus }
interface Turn { role: "user" | "assistant"; content: string; tools?: ToolUse[]; error?: boolean; retryable?: boolean; retry?: PendingCopilotRequest }
const suggestions = [
  { text: "Who are my top 5 overdue customers?", prompt: "Who are my top 5 overdue customers and how much do they owe?", icon: ClipboardCheck },
  { text: "Summarise AR aging and risk changes", prompt: "Summarise AR aging and tell me what changed risk-wise.", icon: BarChart3 },
  { text: "Which bank credits could match invoices?", prompt: "Which bank credits can be matched to invoices today?", icon: Landmark },
  { text: "Explain DSO and CEI", prompt: "What are DSO and CEI right now, and how are they calculated?", icon: Gauge },
];
const toolNames: Record<string, string> = {
  get_ar_overview: "AR overview", list_invoices: "Invoice ledger", get_cash_match_candidates: "Cash match candidates", get_ar_kpi_pack: "AR KPI pack",
  get_short_payment_candidates: "Short-payment candidates", get_collections_worklist: "Collections worklist", get_outstanding_breakdown: "Outstanding breakdown",
  get_customer_account: "Customer account", read_uploaded_file: "Attached spreadsheet", propose_receipt: "Receipt proposal",
  propose_allocation: "Allocation proposal", propose_collection_message: "Collection message proposal", propose_credit_note: "Credit note proposal",
  place_credit_hold: "Credit hold proposal", auto_post_if_policy_allows: "Policy-controlled posting",
};
const proposalTools = new Set(["propose_receipt", "propose_allocation", "propose_collection_message", "propose_credit_note", "place_credit_hold", "auto_post_if_policy_allows"]);
const isZero = (value: string | null) => value === null || /^0(?:\.0+)?$/.test(value);

function toolLabel(tool: string) {
  return toolNames[tool] ?? tool.replace(/^get_/, "").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

/** Streams answers from /api/copilot. Nothing is stored in browser storage; history lives in PostgreSQL. */
const MAX_FILES = 5; // matches the /api/copilot files limit
export function Copilot({ tenant, entity, entityName = "Selected legal entity", thread, initial, aiReady, canWrite, budget, pending = null }: {
  tenant: string; entity: string; entityName?: string; thread: string; initial: Turn[]; aiReady: boolean; canWrite: boolean; budget: AiSpendStatus | null; pending?: PendingCopilotRequest | null;
}) {
  const [turns, setTurns] = useState<Turn[]>(() => pending ? [...initial, { role: "assistant", content: "This Copilot request was interrupted or may still be running. Check its saved status below; no duplicate model call will be started.", error: true, retryable: true, retry: pending }] : initial);
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]); const [uploading, setUploading] = useState(false); const [notice, setNotice] = useState(""); const [announcement, setAnnouncement] = useState("");
  const [recovering, setRecovering] = useState(!!pending);
  const [allowProposals, setAllowProposals] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null); const end = useRef<HTMLDivElement>(null);
  const aiAllowed = aiReady && !!budget?.configured && !budget.paused && !isZero(budget.remaining_usd);
  const update = (change: (turn: Turn) => Turn) => setTurns(current => current.length ? [...current.slice(0, -1), change(current[current.length - 1])] : current);

  async function send(request: PendingCopilotRequest) {
    setBusy(true); setNotice(""); setAnnouncement("Copilot is preparing an answer.");
    update(turn => ({ ...turn, content: "", error: false, retryable: false, retry: request, tools: [] }));
    try {
      const response = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, entity, thread, requestId: request.requestId, message: request.message, files: request.files, allowProposals: request.allowProposals }) });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: "The Copilot is unavailable." }));
        update(turn => ({ ...turn, content: body.error ?? "The Copilot is unavailable.", error: true, retryable: true, retry: request })); setAnnouncement(body.error ?? "The Copilot is unavailable."); return;
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.split("\n").find(entry => entry.startsWith("data: ")); if (!line) continue;
          const event = JSON.parse(line.slice(6)) as { type: string; delta?: string; tool?: string; status?: ToolStatus; text?: string; message?: string };
          if (event.type === "text") update(turn => ({ ...turn, content: turn.content + event.delta }));
          if (event.type === "tool") update(turn => ({ ...turn, content: turn.content && !turn.content.endsWith("\n") ? `${turn.content}\n` : turn.content, tools: [...(turn.tools ?? []).filter(row => !(row.tool === event.tool && row.status === "running")), { tool: event.tool!, status: event.status! }] }));
          if (event.type === "done") { setRecovering(false); update(turn => ({ ...turn, content: event.text ?? turn.content, error: false, retryable: false })); setAnnouncement(event.text ?? "Copilot answer ready."); }
          if (event.type === "error") { setRecovering(false); update(turn => ({ ...turn, content: event.message ?? "Something went wrong.", error: true, retryable: true, retry: request })); setAnnouncement(event.message ?? "Copilot could not complete the request."); }
        }
        end.current?.scrollIntoView({ block: "end" });
      }
    } catch {
      update(turn => ({ ...turn, content: "The connection was interrupted. Retry this same request to retrieve its result; the server will not start a duplicate model call.", error: true, retryable: true, retry: request })); setAnnouncement("The connection was interrupted. Check the same request to retrieve its saved result.");
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

  return <section aria-label="Customer Copilot" className={`copilot-shell${busy ? " is-thinking" : ""}`}>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
    <header className="copilot-topbar">
      <div className="copilot-identity"><span className="copilot-spark"><Sparkles size={18} aria-hidden="true"/></span><div><span className="copilot-eyebrow">O2C FINANCE ASSISTANT</span><h2>Customer Copilot</h2></div></div>
      <div className="copilot-topbar-badges"><span className={`copilot-state ${aiAllowed ? "is-ready" : "is-setup"}`}><span aria-hidden="true" className="copilot-state-dot"/>{aiAllowed ? "AI available" : "Setup required"}</span><span className="copilot-scope"><ShieldCheck size={14} aria-hidden="true"/> {entityName}</span></div>
    </header>

    <div className="copilot-transcript">
      {!turns.length && <div className="copilot-welcome">
        <div className="copilot-hero">
          <div className="copilot-hero-copy"><span className="copilot-hero-kicker"><Sparkles size={13} aria-hidden="true"/> ENTITY-SCOPED FINANCE SEARCH</span>
            <h3>Receivables answers, with the evidence behind them.</h3>
            <p>Ask about customers, invoices, collections, cash matching or reported KPIs. Answers use this legal entity’s finance tools, and source checks stay visible in the conversation.</p>
            <div className="copilot-hero-tags"><span><ShieldCheck size={14} aria-hidden="true"/> Scoped to {entityName}</span><span><FileSpreadsheet size={14} aria-hidden="true"/> CSV / Excel analysis</span></div>
          </div>
          <button type="button" className="copilot-hero-companion" onClick={() => void ask(suggestions[0].prompt)} disabled={!aiAllowed || busy || recovering}
            aria-label="Ask Copilot who the top 5 overdue customers are and how much they owe"
            title="Run the overdue-customer starter with the selected-entity Copilot">
            <span className="copilot-hero-companion-art"><CopilotMascot className="copilot-hero-mascot" thinking={busy}/></span>
            <span className="copilot-hero-companion-copy"><span className="copilot-hero-companion-kicker">QUICK CHECK</span><span className="copilot-hero-companion-title">Overdue review</span><span className="copilot-hero-companion-note">Top 5 customers · amounts owed</span></span>
            <ArrowRight className="copilot-hero-companion-arrow" size={14} aria-hidden="true"/>
          </button>
        </div>
        <div className="copilot-suggestion-heading"><div><h3>Try asking</h3><p>Suggested for your finance workspace</p></div><span className="copilot-suggestion-label">4 STARTERS</span></div>
        <div className="copilot-suggestions">{suggestions.map(({ text, prompt, icon: Icon }) => <button key={text} type="button" disabled={!aiAllowed || busy || recovering} onClick={() => void ask(prompt)} className="copilot-suggestion">
          <span className="copilot-suggestion-icon"><Icon size={17} aria-hidden="true"/></span><span>{text}</span><ArrowRight size={16} className="copilot-suggestion-arrow" aria-hidden="true"/>
        </button>)}</div>
      </div>}

      {!!turns.length && <div className="copilot-messages">{turns.map((turn, index) => {
        const isLast = index === turns.length - 1; const toolRows = turn.tools ?? [];
        const completedCount = toolRows.filter(row => row.status === "ok" && !proposalTools.has(row.tool)).length;
        return turn.role === "user" ? <div key={index} className="copilot-user-row"><div className="copilot-user-message">{turn.content}</div></div> :
          <article key={index} className={`copilot-assistant-row${turn.error ? " has-error" : ""}`}>
            <CopilotMascot className="copilot-message-mascot" thinking={busy && isLast}/>
            <div className="copilot-answer">
              <div className="copilot-answer-header"><span>O2C Copilot</span>{completedCount > 0 && <span className="copilot-verified-count"><Check size={12} aria-hidden="true"/> {completedCount} data {completedCount === 1 ? "tool" : "tools"} completed</span>}{busy && isLast && <span className="copilot-thinking-label"><span className="pulse-dot"/> Working</span>}</div>
              {toolRows.length > 0 && <ul className="copilot-source-list" aria-label="Finance tools and actions used by this answer">{toolRows.map((row, toolIndex) => {
                const proposal = proposalTools.has(row.tool); const Icon = row.status === "running" ? Wrench : row.status === "error" ? TriangleAlert : proposal ? ShieldCheck : Check;
                const state = row.status === "running" ? "Running" : row.status === "error" ? "Unavailable" : proposal ? "Approval required" : "Completed";
                return <li key={`${row.tool}-${toolIndex}`} className={`copilot-source-chip status-${row.status}${proposal ? " is-proposal" : ""}`}><Icon size={13} aria-hidden="true"/><span>{toolLabel(row.tool)}</span><span className="copilot-source-state">{state}</span></li>;
              })}</ul>}
              {!turn.error && turn.content ? <p className="copilot-answer-text">{turn.content}</p> : !turn.error && busy && isLast ? <p className="copilot-answer-text copilot-answer-loading"><Spinner size={14}/>Checking scoped finance records…</p> : null}
              {turn.error && <div role="alert" className="copilot-error-note">{turn.content}</div>}
              {turn.role === "assistant" && turn.error && turn.retryable && turn.retry && <button type="button" className="button secondary copilot-retry" disabled={busy} onClick={() => void retry(turn.retry!)}>Retry/check this same request (no duplicate model call)</button>}
            </div>
          </article>;
      })}</div>}
      <div ref={end}/>
    </div>

    <form onSubmit={submit} className="copilot-composer-wrap">
      {(files.length > 0 || notice) && <div className="copilot-attachments">{files.map(file => <span key={file.id} className="copilot-file-chip"><FileSpreadsheet size={14} aria-hidden="true"/><span>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter(row => row.id !== file.id))}><X size={14}/></button></span>)}{notice && <span role="status" className="copilot-notice">{notice}</span>}</div>}
      {canWrite && <label className="copilot-proposal-toggle"><input type="checkbox" checked={allowProposals} onChange={event => setAllowProposals(event.target.checked)} disabled={!aiAllowed || busy || recovering}/><span>Allow pending proposals for this message. A separate approver must still review them.</span></label>}
      <div className="copilot-composer">
        <input ref={fileInput} type="file" accept=".csv,.xlsx" className="sr-only" id="copilot-file" disabled={!aiAllowed || uploading || busy || recovering} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
        <label htmlFor="copilot-file" className={`copilot-attach${!aiAllowed || recovering ? " is-disabled" : ""}`} aria-label="Attach CSV or Excel file" title="Attach CSV or Excel file">{uploading ? <Spinner size={18}/>:<Paperclip size={18}/>}</label>
        <label className="sr-only" htmlFor="copilot-input">Message</label>
        <textarea id="copilot-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} rows={1} disabled={!aiAllowed || recovering} placeholder={recovering ? "Check the pending Copilot request before asking another question" : !aiReady ? "AI provider not configured" : aiAllowed ? "Ask about customers, invoices, cash or KPIs…" : "Set an available workspace AI budget to continue"} className="copilot-input"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); } }}/>
        <button className="copilot-send" disabled={!aiAllowed || busy || recovering || !draft.trim()} aria-label="Send message" title="Send message">{busy ? <Spinner size={18}/>:<Send size={18}/>}</button>
      </div>
      <div className="copilot-footer"><p className="copilot-budget-note">{budgetMessage}</p><p className="copilot-safety-note">{canWrite ? "Copilot is read-only unless you enable proposals for a message. It cannot approve or post." : "This role can ask questions and view data, but cannot create proposals through Copilot."}</p></div>
    </form>
  </section>;
}
