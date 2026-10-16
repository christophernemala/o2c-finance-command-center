# Application flow

Screen map and the main journeys. `DESIGN.md` holds the acceptance rule for each screen. The clickable prototype for slice 2 is linked from `docs/TRACKER.md`.

## Screen map

```
/login ── /auth/verify (TOTP) ── / (workspace, ?view=…)
                                   ├─ overview        KPIs, charts, DSO/CEI
                                   ├─ copilot         chat + file upload
                                   ├─ agents          Agent Console: run, stream, history, policy
                                   ├─ customers       directory
                                   ├─ receivables     invoice ledger
                                   ├─ reconciliation  cash application proposals
                                   ├─ approvals       maker/checker inbox
                                   ├─ reports         AR pack + Excel
                                   ├─ cashflow · ecl · imports (/imports/[id]) · audit
/signup (invitation activation) · /auth/security (authenticator) · /privacy · 404
```

## Journeys built today

1. **Import and approve source data.** A maker uploads an invoice or bank CSV in Import review. The file is validated and staged, and a different approver commits it.
2. **Cash application by agent.**
   1. A user selects Run on the Cash application agent, or the daily cron starts it.
   2. The agent reads the match candidates and proposes receipts and allocations.
   3. Exact matches are posted within the active policy. The rest wait in Approvals.
   4. The run stream shows every step.
3. **Manual cash application.** A maker proposes a receipt or allocation, an approver approves it, and then it is posted as a separate step.
4. **Ask the copilot.** The user asks a question, optionally attaching a CSV or .xlsx file. The copilot calls scoped tools under the user's role and streams the answer, and the conversation is saved for that user only.
5. **Management report.** Open Reports to see aging, DSO, CEI and top debtors, and download the Excel pack. The reporting agent can also write the narrative.
6. **Set autonomy.** An admin proposes auto-execution limits and a different approver activates them. Auto-posting stays off until then.

## Journeys in slice 2

7. **Morning collections.** The collections agent ranks overdue customers and drafts messages. A controller reviews and submits a draft to the outbox, and a manager approves it before the platform submits it through Resend. Controllers can also propose SMS or WhatsApp replies to contacts with recorded channel consent; these use the same independent approval flow and Twilio sender.
8. **Promises and disputes.** A promise to pay is logged on an invoice, and a broken promise raises a flag. A dispute removes the invoice from dunning and auto-match until it is resolved.
9. **Credit holds and limits.** An agent or maker places a hold, and only an approver can release it. Limit changes need maker/checker approval.
10. **Statement of account.** On the customer page, generate the PDF statement and download it or attach it to an email.
11. **Agent operations.** Incidents are detected automatically, then investigated through the trace and the handoff comparison. A guardrail is drafted, simulated on past runs, and promoted from Monitor to Warn to Block with approval.
