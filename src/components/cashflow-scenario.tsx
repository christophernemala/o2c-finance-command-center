"use client";
import { useMemo, useState } from "react";
import { simulateCashflowScenario, type CashflowRun } from "@/lib/cashflow";
import { Money, Panel } from "./ui";
import { CashflowTimeline } from "./cashflow-timeline";

export function CashflowScenario({ run }: { run: CashflowRun }) {
  const [receiptDelay, setReceiptDelay] = useState(0);
  const [paymentDelay, setPaymentDelay] = useState(0);
  const scenario = useMemo(() => simulateCashflowScenario(run, { receiptDelayWeeks: receiptDelay, paymentDelayWeeks: paymentDelay }), [run, receiptDelay, paymentDelay]);
  const base = scenario.base;
  const closingDelta = scenario.weeks[12].closing_delta;
  return <Panel title="Cashflow timing scenarios" subtitle="Change explicit week-shift assumptions and compare with the approved source run.">
    <div className="space-y-5 p-5 sm:p-6">
      <p className="rounded-xl border border-warning/30 bg-surface-muted p-4 text-sm leading-6"><strong>What-if only.</strong> These browser-only timing shifts are not saved, approved, rebased, sent to the ledger, or treated as an updated forecast. No receipt or payment is created or deleted; amounts shifted beyond week 13 are shown separately.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Receipt delay assumption
          <span className="mt-1 block text-xs font-normal text-muted">Shift every supplied incoming movement later by this many weeks.</span>
          <select className="mt-2 w-full" value={receiptDelay} onChange={event => setReceiptDelay(Number(event.target.value))}>{[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value} {value === 1 ? "week" : "weeks"}</option>)}</select>
        </label>
        <label className="text-sm font-medium">Payment deferral assumption
          <span className="mt-1 block text-xs font-normal text-muted">Shift every supplied outgoing movement later by this many weeks.</span>
          <select className="mt-2 w-full" value={paymentDelay} onChange={event => setPaymentDelay(Number(event.target.value))}>{[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value} {value === 1 ? "week" : "weeks"}</option>)}</select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-muted p-4"><p className="text-xs text-muted">Week 13 closing · approved base</p><p className="mt-2 font-semibold"><Money value={base[12].closing}/></p></div>
        <div className="rounded-xl bg-surface-muted p-4"><p className="text-xs text-muted">Week 13 closing · what-if</p><p className="mt-2 font-semibold"><Money value={scenario.weeks[12].closing}/></p></div>
        <div className="rounded-xl bg-surface-muted p-4"><p className="text-xs text-muted">Change vs approved base</p><p className="mt-2 font-semibold"><Money value={closingDelta}/></p></div>
      </div>
      <p className="text-xs leading-5 text-muted">Model: shift incoming by {receiptDelay} week(s), outgoing by {paymentDelay} week(s); all other values, source references and opening cash remain unchanged. There is no probability weighting or inferred collection behavior.</p>
      <CashflowTimeline weeks={scenario.weeks} scenario/>
      {(scenario.outside_horizon_receipts !== "0.00" || scenario.outside_horizon_payments !== "0.00") && <p className="rounded-lg border border-line p-3 text-sm">Shifted beyond the 13-week display: receipts <Money value={scenario.outside_horizon_receipts}/> · payments <Money value={scenario.outside_horizon_payments}/> (still present in the source run, excluded from the shown horizon).</p>}
      <div className="desktop-record-table overflow-auto" role="region" aria-label="Weekly closing cash comparison" tabIndex={0}><table><caption className="sr-only">Approved base and timing scenario closing cash by week</caption><thead><tr><th scope="col">Week</th><th scope="col" className="money">Approved base</th><th scope="col" className="money">What-if</th><th scope="col" className="money">Difference</th></tr></thead><tbody>{scenario.weeks.map((week, index) => <tr key={week.starts_on}><th scope="row">W{index + 1}<p className="text-xs font-normal">{week.starts_on}</p></th><td className="money"><Money value={base[index].closing}/></td><td className="money"><Money value={week.closing}/></td><td className="money"><Money value={week.closing_delta}/></td></tr>)}</tbody></table></div>
      <ul className="record-cards" aria-label="Weekly closing cash comparison">{scenario.weeks.map((week, index) => <li className="record-card" key={week.starts_on}><div className="record-card-header"><div><strong>Week {index + 1}</strong><p>{week.starts_on}</p></div><span className="data-scope">AED</span></div><dl><div><dt>Approved base</dt><dd><Money value={base[index].closing}/></dd></div><div><dt>What-if</dt><dd><Money value={week.closing}/></dd></div><div><dt>Difference</dt><dd><Money value={week.closing_delta}/></dd></div></dl></li>)}</ul>
    </div>
  </Panel>;
}
