"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChartNoAxesCombined, FileSpreadsheet, Search, Users, ReceiptText, ArrowRight } from "lucide-react";
import { formatAed } from "@/lib/money";
export type WorkspaceSearchItem = { label: string; detail: string; href: string; kind: "Workspace" | "Action" | "KPI" | "Chart" | "Customer" | "Invoice" | "Record" };
type Item = WorkspaceSearchItem;
type InvoiceMatch = { id: string; number: string; customer: string; account: string; due_date: string; open: string };
type RemoteState = { query: string; results: InvoiceMatch[]; status: string };
export function WorkspaceSearch({ items, tenant, entity, previewMode = false }: { items: Item[]; tenant: string; entity: string; previewMode?: boolean }) {
  const [query, setQuery] = useState(""); const [open, setOpen] = useState(false); const [activeIndex, setActiveIndex] = useState(0); const [remoteState, setRemoteState] = useState<RemoteState>({ query: "", results: [], status: "" });
  const input = useRef<HTMLInputElement>(null); const shell = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en");
    if (!normalized) return [];
    return items.filter(item => `${item.label} ${item.detail}`.toLocaleLowerCase("en").includes(normalized)).slice(0, 7);
  }, [items, query]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); input.current?.focus(); setOpen(true); }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const normalized = query.trim();
    if (previewMode || normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteState({ query: normalized, results: [], status: "Searching invoice records…" });
      try {
        const params = new URLSearchParams({ q: normalized, tenant, entity });
        const response = await fetch(`/api/search?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) { setRemoteState({ query: normalized, results: [], status: response.status === 401 ? "Sign in again to search financial records." : "Invoice search is temporarily unavailable." }); return; }
        const result = await response.json() as { results?: InvoiceMatch[] };
        setRemoteState({ query: normalized, results: Array.isArray(result.results) ? result.results : [], status: "" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRemoteState({ query: normalized, results: [], status: "Invoice search is temporarily unavailable." });
      }
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, tenant, entity, previewMode]);
  const normalizedQuery = query.trim();
  const currentRemote = remoteState.query === normalizedQuery ? remoteState : { query: normalizedQuery, results: [], status: normalizedQuery.length >= 2 && !previewMode ? "Searching invoice records…" : "" };
  const invoiceItems: Item[] = currentRemote.results.map(row => ({
    label: row.number,
    detail: `${row.customer} · ${row.account} · ${formatAed(row.open)} open · due ${row.due_date}`,
    href: `${items.find(item => item.label === "Receivables")?.href ?? "/"}${items.find(item => item.label === "Receivables")?.href.includes("?") ? "&" : "?"}q=${encodeURIComponent(query.trim())}`,
    kind: "Invoice",
  }));
  const all = [...matches, ...invoiceItems.filter(row => !matches.some(local => local.label === row.label && local.kind === row.kind))].slice(0, 10);
  const icon = (kind: Item["kind"]) => kind === "Customer" || kind === "Record" ? <Users size={16}/> : kind === "Invoice" ? <ReceiptText size={16}/> : kind === "KPI" || kind === "Chart" ? <ChartNoAxesCombined size={16}/> : kind === "Action" ? <FileSpreadsheet size={16}/> : kind === "Workspace" && /copilot/i.test(query) ? <Bot size={16}/> : <Search size={16}/>;
  return <div className="workspace-search" ref={shell} onFocus={() => setOpen(true)} onBlur={event => { if (!shell.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label className="sr-only" htmlFor="workspace-search-input">Search workspaces, customers, invoices, KPIs, and charts</label>
    <Search className="workspace-search-icon" size={17} aria-hidden="true"/>
    <input id="workspace-search-input" ref={input} type="search" value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); input.current?.blur(); }
      else if (event.key === "ArrowDown" && all.length) { event.preventDefault(); setActiveIndex(index => (index + 1) % all.length); }
      else if (event.key === "ArrowUp" && all.length) { event.preventDefault(); setActiveIndex(index => (index + all.length - 1) % all.length); }
      else if (event.key === "Enter" && all.length) { event.preventDefault(); shell.current?.querySelectorAll<HTMLAnchorElement>('[role="option"]')[activeIndex]?.click(); }
    }} placeholder="Search customers, invoices, reports…" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open && query.trim().length > 0} aria-controls="workspace-search-results" aria-activedescendant={open && all.length ? `search-result-${activeIndex}` : undefined} aria-label="Search O2C workspaces and records"/>
    <kbd className="search-shortcut" aria-hidden="true">⌘ K</kbd>
    {open && query.trim() && <div className="workspace-search-results" id="workspace-search-results" role="listbox" aria-label="Search results">
      {all.map((item, index) => <Link id={`search-result-${index}`} key={`${item.kind}-${item.label}-${index}`} href={item.href} role="option" aria-selected={index === activeIndex} onMouseMove={() => setActiveIndex(index)} onClick={() => setOpen(false)}>
        <span className="search-result-icon">{icon(item.kind)}</span><span className="search-result-copy"><strong>{item.label}</strong><span>{item.detail}</span></span><span className="search-result-kind">{item.kind}</span>
      </Link>)}
      {currentRemote.status && <p className="search-status" role="status">{currentRemote.status}</p>}
      {!all.length && !currentRemote.status && <p className="search-status">No matching workspace, KPI, chart, or customer record.</p>}
      {all.length > 0 && <p className="search-hint"><ArrowRight size={12}/> Search invoices across the selected entity · Enter opens the matching workspace.</p>}
    </div>}
  </div>;
}
