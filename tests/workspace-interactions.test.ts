import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import type { WorklistRow } from "../src/types/collections";

test("working chart controls, aging selection and forecast week inspection", async () => {
  const win = new Window({ url: "http://localhost/" });
  // The DOM emulator does not implement native animation cancellation promises reliably.
  // Let Framer use its JavaScript fallback; real browser animations remain enabled.
  Reflect.deleteProperty(win.Element.prototype, "animate");
  const globals = { window: win, self: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, SVGElement: win.SVGElement, Element: win.Element, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); }
  const { createRoot } = await import("react-dom/client");
  const { ChartExplorer } = await import("../src/components/chart-explorer");
  const { CollectionsExplorer } = await import("../src/components/collections-explorer");
  const { CashflowTimeline } = await import("../src/components/cashflow-timeline");
  const container = win.document.createElement("div"); win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const click = async (button: ReturnType<typeof container.querySelector>) => { assert.ok(button); await act(async () => { button.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); }); };
  const buttonNamed = (name: string) => [...container.querySelectorAll("button")].find(button => button.textContent?.includes(name)) ?? null;
  try {
    await act(async () => { root.render(createElement(ChartExplorer, { charts: [{ key: "aging", title: "Receivables aging", unit: "AED", description: "Test source", series: [{ label: "Current", value: "0.10" }, { label: "90+ days", value: "0.20" }] }] })); });
    await click(buttonNamed("90+ days"));
    assert.equal(buttonNamed("90+ days")?.getAttribute("aria-pressed"), "true");
    assert.match(container.querySelector('[aria-live="polite"]')?.textContent ?? "", /90\+ days.*0.20/);
    await click(container.querySelector('button[title="Donut chart"]'));
    assert.equal(container.querySelector('button[title="Donut chart"]')?.getAttribute("aria-pressed"), "true");
    assert.ok(container.querySelector("circle"));
    await click(container.querySelector('button[title="Exact figures"]'));
    assert.match(container.querySelector("table")?.textContent ?? "", /Current.*0.10.*90\+ days.*0.20/);

    const row = (name: string, days: number): WorklistRow => ({ customer_id: name, customer: name, account: name, oldest_days: days, overdue: "0.10", open: "0.10", overdue_invoices: 1, disputed_invoices: 0, broken_promises: 0, open_promises: 0, on_hold: false, contacts: 1, credit_limit: null, last_message: null });
    await act(async () => { root.render(createElement(CollectionsExplorer, { rows: [row("Recent account", 20), row("Escalation account", 190)], tenant: "t", entity: "e", sidebar: null })); });
    assert.equal(container.querySelectorAll("tbody tr").length, 2);
    await click(buttonNamed("181+ days"));
    assert.equal(container.querySelectorAll("tbody tr").length, 1);
    assert.match(container.querySelector("tbody")?.textContent ?? "", /Escalation account/);
    assert.match(container.querySelector("tbody a")?.getAttribute("href") ?? "", /tenant=t&entity=e&customer=Escalation\+account/);
    await click(buttonNamed("Clear account filters"));
    assert.equal(container.querySelectorAll("tbody tr").length, 2);

    const weeks = ["2026-10-01", "2026-10-08"].map((date, i) => ({ starts_on: date, ends_on: date, opening: "0.10", incoming: "0.20", outgoing: "0.00", operating_net: "0.20", investing_net: "0.00", financing_net: "0.00", net: "0.20", closing: i ? "0.50" : "0.30" }));
    await act(async () => { root.render(createElement(CashflowTimeline, { weeks })); });
    await click(container.querySelector('button[aria-label="Inspect week 2, starting 2026-10-08"]'));
    assert.match(container.querySelector('[aria-live="polite"]')?.textContent ?? "", /Week 2.*0.50/);
  } finally {
    await act(async () => { root.unmount(); }); await win.happyDOM.abort();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
