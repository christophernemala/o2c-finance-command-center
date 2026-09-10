/**
 * ExcelUpload / reconciliationEngine.ts
 * ──────────────────────────────────────
 * Multi-criteria matching engine that reconciles uploaded bank-statement lines
 * against uploaded or in-memory invoices.  Each pair is scored 0 → 100 and
 * categorised as Matched / Suggested / Exception / Unmatched.
 */

import type { BankStatementLine, FinanceRow, ReconciliationResult } from "../../shared/types";

/* ── helpers ──────────────────────────────────────────────────────── */

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyMatch(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 75;
  /* simple bigram overlap */
  const bigramsA = new Set<string>();
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2));
  let overlap = 0;
  for (let i = 0; i < nb.length - 1; i++) if (bigramsA.has(nb.slice(i, i + 2))) overlap++;
  const total = Math.max(bigramsA.size, nb.length - 1, 1);
  return Math.round((overlap / total) * 100);
}

function amountMatch(bankAmount: number, invoiceAmount: number): number {
  if (bankAmount === 0 || invoiceAmount === 0) return 0;
  if (Math.abs(bankAmount - invoiceAmount) < 0.01) return 100;
  const ratio = Math.min(bankAmount, invoiceAmount) / Math.max(bankAmount, invoiceAmount);
  if (ratio >= 0.999) return 95;
  if (ratio >= 0.95) return 60;
  if (ratio >= 0.80) return 30;
  return 0;
}

/* ── scoring weights ─────────────────────────────────────────────── */

const WEIGHTS = {
  invoiceNumber: 0.35,
  bankReference: 0.20,
  amount: 0.25,
  customerName: 0.10,
  customerNumber: 0.10,
} as const;

interface ScoredMatch {
  invoiceIndex: number;
  score: number;
  breakdown: Record<string, number>;
}

function scorePair(bank: BankStatementLine, invoice: Partial<FinanceRow>): ScoredMatch["breakdown"] {
  return {
    invoiceNumber: bank.invoiceNumber && invoice.invoiceNumber
      ? fuzzyMatch(bank.invoiceNumber, invoice.invoiceNumber)
      : 0,
    bankReference: bank.bankReference && invoice.bankReference
      ? fuzzyMatch(bank.bankReference, invoice.bankReference)
      : 0,
    amount: amountMatch(Math.abs(bank.amount), Math.abs(invoice.amount ?? 0)),
    customerName: fuzzyMatch(bank.customerName, invoice.customerName ?? ""),
    customerNumber: fuzzyMatch(bank.customerNumber, invoice.customerNumber ?? ""),
  };
}

function weightedScore(breakdown: Record<string, number>): number {
  let score = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const s = breakdown[key] ?? 0;
    /* only count weights for criteria that have at least some data */
    if (s > 0 || (breakdown[key] !== undefined && breakdown[key] === 0)) {
      score += s * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? Math.round(score / totalWeight) : 0;
}

/* ── public API ───────────────────────────────────────────────────── */

export interface UploadReconciliationResult extends ReconciliationResult {
  uploadSource: "customer";
  criteriaBreakdown: Record<string, number>;
}

export interface ReconciliationSummary {
  totalBankLines: number;
  totalInvoices: number;
  matched: number;
  suggested: number;
  exception: number;
  unmatched: number;
  totalMatchedAed: number;
  totalExceptionAed: number;
  matchRate: number;
  results: UploadReconciliationResult[];
}

export function reconcileUpload(
  bankStatements: BankStatementLine[],
  invoices: Partial<FinanceRow>[],
): ReconciliationSummary {
  const results: UploadReconciliationResult[] = [];
  const usedInvoices = new Set<number>();

  for (const bank of bankStatements) {
    /* score all invoices */
    const candidates: ScoredMatch[] = invoices.map((inv, idx) => {
      const breakdown = scorePair(bank, inv);
      return { invoiceIndex: idx, score: weightedScore(breakdown), breakdown };
    });

    /* sort by descending score */
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const bestInvoice = best ? invoices[best.invoiceIndex] : undefined;

    let matchStatus: ReconciliationResult["matchStatus"];
    let matchConfidence = best?.score ?? 0;
    let exceptionReason: string | undefined;

    if (best && best.score >= 80 && !usedInvoices.has(best.invoiceIndex)) {
      matchStatus = "Matched";
      usedInvoices.add(best.invoiceIndex);
    } else if (best && best.score >= 50 && !usedInvoices.has(best.invoiceIndex)) {
      matchStatus = "Suggested";
    } else if (best && usedInvoices.has(best.invoiceIndex)) {
      matchStatus = "Exception";
      exceptionReason = "Best match invoice already consumed by a prior bank line.";
      matchConfidence = Math.min(matchConfidence, 40);
    } else if (best && best.score < 50 && best.score > 0) {
      matchStatus = "Exception";
      exceptionReason = buildExceptionReason(best.breakdown);
    } else {
      matchStatus = "Unmatched";
      matchConfidence = 0;
      exceptionReason = "No matching invoice found in uploaded data.";
    }

    results.push({
      bankReference: bank.bankReference,
      invoiceNumber: bestInvoice?.invoiceNumber ?? "",
      customerName: best ? (bestInvoice?.customerName ?? bank.customerName) : bank.customerName,
      customerNumber: best ? (bestInvoice?.customerNumber ?? bank.customerNumber) : bank.customerNumber,
      amount: bank.amount,
      matchStatus,
      matchConfidence,
      exceptionReason,
      uploadSource: "customer",
      criteriaBreakdown: best?.breakdown ?? {},
    });
  }

  const matched = results.filter((r) => r.matchStatus === "Matched").length;
  const suggested = results.filter((r) => r.matchStatus === "Suggested").length;
  const exception = results.filter((r) => r.matchStatus === "Exception").length;
  const unmatched = results.filter((r) => r.matchStatus === "Unmatched").length;

  return {
    totalBankLines: bankStatements.length,
    totalInvoices: invoices.length,
    matched,
    suggested,
    exception,
    unmatched,
    totalMatchedAed: results.filter((r) => r.matchStatus === "Matched").reduce((s, r) => s + r.amount, 0),
    totalExceptionAed: results.filter((r) => r.matchStatus !== "Matched").reduce((s, r) => s + r.amount, 0),
    matchRate: bankStatements.length > 0 ? Math.round((matched / bankStatements.length) * 100) : 0,
    results,
  };
}

function buildExceptionReason(breakdown: Record<string, number>): string {
  const issues: string[] = [];
  if ((breakdown.invoiceNumber ?? 0) < 50) issues.push("invoice number mismatch");
  if ((breakdown.amount ?? 0) < 50) issues.push("amount difference");
  if ((breakdown.bankReference ?? 0) < 50) issues.push("bank reference mismatch");
  if ((breakdown.customerName ?? 0) < 50) issues.push("customer name mismatch");
  return issues.length ? `Low confidence: ${issues.join(", ")}.` : "No strong match criteria found.";
}
