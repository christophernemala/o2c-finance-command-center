import Decimal from "decimal.js";
import { positiveAmount } from "./money";
import { eclDetailHeaders } from "./source-adapters";

const Exact = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
const ratePattern = /^(?:100(?:\.0{1,4})?|(?:0|[1-9]\d?)(?:\.\d{1,4})?)$/;
const safeText = (value: unknown, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /^[=+@-]/.test(value.trim())) {
    throw new Error("A required text field is invalid or begins with a spreadsheet formula marker.");
  }
  return value.trim();
};

export interface EclSourceLine {
  account: string;
  customer: string;
  exposure: string;
  pd_percent: string;
  lgd_percent: string;
  source_provision: string;
  currency: "AED";
  source_reference: string;
}
export interface CustomerProvision {
  account: string;
  customer: string;
  exposure: string;
  simple_ecl: string;
  source_provision: string;
  difference: string;
  source_references: string[];
  rows: number;
}
export interface EclProvisionResult {
  customers: CustomerProvision[];
  source_rows: number;
  total_exposure: string;
  total_simple_ecl: string;
  total_source_provision: string;
  total_difference: string;
  complete: boolean;
  source_label: string;
}

function percent(value: unknown): string {
  if (typeof value !== "string" || !ratePattern.test(value)) throw new Error("PD and LGD must be decimal percentages from 0 to 100, with at most four decimal places.");
  return new Exact(value).toFixed(4);
}

/** Exact, bounded parser shared by local file analysis and preserved run details. */
export function parseEclDetailRows(rows: string[][], options: { complete?: boolean; sourceLabel?: string } = {}): EclProvisionResult {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 2001) throw new Error("Provide a header and 1–2,000 ECL detail rows.");
  const headers = rows[0].map(value => value.trim());
  if (headers.length !== eclDetailHeaders.length || headers.some((value, index) => value !== eclDetailHeaders[index])) {
    throw new Error(`Use these exact columns in this order: ${eclDetailHeaders.join(", ")}.`);
  }
  const grouped = new Map<string, { account: string; customer: string; exposure: InstanceType<typeof Exact>; simple: InstanceType<typeof Exact>; source: InstanceType<typeof Exact>; references: string[]; rows: number }>();
  for (const [index, row] of rows.slice(1).entries()) {
    if (!Array.isArray(row) || row.length !== eclDetailHeaders.length) throw new Error(`Row ${index + 2} has a missing or extra column.`);
    const [accountRaw, customerRaw, exposureRaw, pdRaw, lgdRaw, sourceProvisionRaw, currencyRaw, sourceReferenceRaw] = row;
    const account = safeText(accountRaw, 100);
    const customer = safeText(customerRaw, 200);
    const exposure = positiveAmount(exposureRaw);
    const pd = percent(pdRaw);
    const lgd = percent(lgdRaw);
    const sourceProvision = typeof sourceProvisionRaw === "string" && /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(sourceProvisionRaw)
      ? new Exact(sourceProvisionRaw).toFixed(2)
      : (() => { throw new Error(`Row ${index + 2} has an invalid source provision.`); })();
    if (currencyRaw !== "AED") throw new Error(`Row ${index + 2} must be in AED; no automatic FX conversion is applied.`);
    const reference = safeText(sourceReferenceRaw, 200);
    const group = grouped.get(account);
    if (group && group.customer !== customer) throw new Error(`Account ${account} has conflicting customer names.`);
    const simple = new Exact(exposure).mul(pd).mul(lgd).div(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    const target = group ?? { account, customer, exposure: new Exact(0), simple: new Exact(0), source: new Exact(0), references: [], rows: 0 };
    target.exposure = target.exposure.plus(exposure);
    target.simple = target.simple.plus(simple);
    target.source = target.source.plus(sourceProvision);
    target.references.push(reference);
    target.rows += 1;
    grouped.set(account, target);
  }
  if (!grouped.size) throw new Error("No customer-level source rows were found.");
  const customers = [...grouped.values()].sort((left, right) => left.account.localeCompare(right.account)).map(row => ({
    account: row.account,
    customer: row.customer,
    exposure: row.exposure.toFixed(2),
    simple_ecl: row.simple.toFixed(2),
    source_provision: row.source.toFixed(2),
    difference: row.simple.minus(row.source).toFixed(2),
    source_references: row.references,
    rows: row.rows,
  }));
  const total = (key: "exposure" | "simple_ecl" | "source_provision") => customers.reduce((sum, row) => sum.plus(row[key]), new Exact(0)).toFixed(2);
  const totalExposure = total("exposure");
  const totalSimple = total("simple_ecl");
  const totalSource = total("source_provision");
  return {
    customers,
    source_rows: rows.length - 1,
    total_exposure: totalExposure,
    total_simple_ecl: totalSimple,
    total_source_provision: totalSource,
    total_difference: new Exact(totalSimple).minus(totalSource).toFixed(2),
    complete: options.complete === true,
    source_label: options.sourceLabel ?? "Uploaded source file · local analysis only",
  };
}

/**
 * Read only the versioned customer detail contract embedded in a trusted ECL
 * run's scenario JSON. Unknown/older scenario formats are not inferred.
 */
export function parseEclRunDetail(scenario: string, sourceLabel: string): { result: EclProvisionResult | null; error: string | null } {
  let value: unknown;
  try { value = JSON.parse(scenario); } catch { return { result: null, error: null }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { result: null, error: null };
  const record = value as Record<string, unknown>;
  if (record.schema_version !== "o2c.ecl-customer-detail.v1" || !Array.isArray(record.customer_provisions)) return { result: null, error: null };
  try {
    const objects = record.customer_provisions as Record<string, unknown>[];
    const rows = [
      [...eclDetailHeaders],
      ...objects.map(item => eclDetailHeaders.map(header => typeof item?.[header] === "string" ? item[header] as string : "")),
    ];
    return { result: parseEclDetailRows(rows, { complete: record.detail_complete === true, sourceLabel }), error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : "Customer-level detail could not be validated." };
  }
}
