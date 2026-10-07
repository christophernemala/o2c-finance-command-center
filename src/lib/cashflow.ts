import Decimal from "decimal.js";
import { positiveAmount } from "./money";

const Exact = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
const day = 86_400_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface ForecastEntry {
  id: string; date: string; direction: "in" | "out";
  category: "operating" | "investing" | "financing";
  amount: string; source_reference: string;
}
export interface CashflowRun {
  id: string; tenant_id: string; entity_id: string; starts_on: string;
  opening_cash: string; scenario: string; model_version: string; source_digest: string;
  maker: string; checker: string; approved_at: string; evidence: string;
  confidence_percent: string | null; confidence_method: string | null;
  entries: ForecastEntry[];
}
export interface ForecastWeek {
  starts_on: string; ends_on: string; opening: string; incoming: string;
  outgoing: string; operating_net: string; investing_net: string;
  financing_net: string; net: string; closing: string;
}
function date(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid forecast date");
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new Error("Invalid forecast date");
  return parsed;
}
/** Forecast inputs are preserved approved records, never inferred invoice due dates. */
export function validateCashflowRun(value: unknown, tenant: string, entity: string): CashflowRun {
  if (!value || typeof value !== "object") throw new Error("Invalid forecast");
  const run = value as CashflowRun;
  if (run.tenant_id !== tenant || run.entity_id !== entity || !uuid.test(run.id)
    || !uuid.test(run.maker) || !uuid.test(run.checker) || run.maker === run.checker) throw new Error("Invalid forecast scope or approval");
  const start = date(run.starts_on);
  if (typeof run.opening_cash !== "string" || !/^-?(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(run.opening_cash)) throw new Error("Invalid opening cash");
  for (const key of ["scenario", "model_version", "evidence"] as const) {
    if (typeof run[key] !== "string" || !run[key].trim() || run[key].length > 2000) throw new Error("Missing forecast lineage");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(run.source_digest) || !Number.isFinite(Date.parse(run.approved_at))) throw new Error("Invalid forecast approval evidence");
  if (run.confidence_percent !== null) {
    if (typeof run.confidence_percent !== "string" || !/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(run.confidence_percent)
      || typeof run.confidence_method !== "string" || !run.confidence_method.trim() || run.confidence_method.length > 2000) throw new Error("Invalid confidence methodology");
  } else if (run.confidence_method !== null) throw new Error("Incomplete confidence");
  if (!Array.isArray(run.entries) || run.entries.length > 2000) throw new Error("Invalid forecast entries");
  const ids = new Set<string>();
  for (const entry of run.entries) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 200 || ids.has(entry.id)) throw new Error("Duplicate or invalid forecast entry");
    ids.add(entry.id);
    const at = date(entry.date);
    if (at < start || at >= start + 91 * day) throw new Error("Forecast entry outside 13-week horizon");
    if (!["in", "out"].includes(entry.direction) || !["operating", "investing", "financing"].includes(entry.category)) throw new Error("Invalid forecast classification");
    positiveAmount(entry.amount);
    if (typeof entry.source_reference !== "string" || !entry.source_reference.trim() || entry.source_reference.length > 2000) throw new Error("Missing forecast source");
  }
  return run;
}
export function forecastWeeks(input: CashflowRun): ForecastWeek[] {
  const run = validateCashflowRun(input, input.tenant_id, input.entity_id);
  const start = date(run.starts_on);
  const buckets = Array.from({ length: 13 }, () => ({ incoming: new Exact(0), outgoing: new Exact(0), operating: new Exact(0), investing: new Exact(0), financing: new Exact(0) }));
  for (const entry of run.entries) {
    const bucket = buckets[Math.floor((date(entry.date) - start) / (7 * day))];
    const value = new Exact(entry.amount);
    bucket[entry.direction === "in" ? "incoming" : "outgoing"] = bucket[entry.direction === "in" ? "incoming" : "outgoing"].plus(value);
    bucket[entry.category] = bucket[entry.category].plus(entry.direction === "in" ? value : value.negated());
  }
  let cash = new Exact(run.opening_cash);
  return buckets.map((bucket, index) => {
    const opening = cash.toFixed(2); const net = bucket.incoming.minus(bucket.outgoing); cash = cash.plus(net);
    return { starts_on: new Date(start + index * 7 * day).toISOString().slice(0, 10), ends_on: new Date(start + (index * 7 + 6) * day).toISOString().slice(0, 10),
      opening, incoming: bucket.incoming.toFixed(2), outgoing: bucket.outgoing.toFixed(2), operating_net: bucket.operating.toFixed(2),
      investing_net: bucket.investing.toFixed(2), financing_net: bucket.financing.toFixed(2), net: net.toFixed(2), closing: cash.toFixed(2) };
  });
}
/** Only the dimensionless drawing ratio becomes a JS number; amounts stay decimal. */
export function chartRatio(value: string, maximum: string): number {
  const numerator = new Exact(value); const denominator = new Exact(maximum);
  if (!numerator.isFinite() || !denominator.isFinite() || denominator.lt(0)) throw new Error("Invalid chart scale");
  return denominator.isZero() ? 0 : numerator.div(denominator).toDecimalPlaces(6).toNumber();
}
