import Decimal from "decimal.js";
const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
const amountPattern = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
export function amount(value: unknown): string {
  if (typeof value !== "string" || !amountPattern.test(value)) {
    throw new Error("Use an AED decimal amount with at most 13 integer digits and two decimal places.");
  }
  return new Money(value).toFixed(2);
}
export function positiveAmount(value: unknown): string {
  const parsed = amount(value);
  if (new Money(parsed).lte(0)) throw new Error("Amount must be greater than zero.");
  return parsed;
}
export function aggregateAmount(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,27})(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid aggregate amount");
  return new Money(value).toFixed(2);
}
export function addAmounts(values: string[]): string {
  return values.reduce((sum, value) => sum.plus(amount(value)), new Money(0)).toFixed(2);
}
export function subtractAmounts(left: string, right: string): string {
  return new Money(amount(left)).minus(amount(right)).toFixed(2);
}
/** Locale presentation without converting financial decimals into Number. */
export function formatAed(value: string): string {
  const decimal = new Money(value);
  if (!decimal.isFinite()) throw new Error("Invalid amount");
  const [integer, fraction] = decimal.abs().toFixed(2).split(".");
  const parts = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).formatToParts(BigInt(integer));
  return `${decimal.isNegative() && !decimal.isZero() ? "−" : ""}${parts.map(part => part.type === "fraction" ? fraction : part.value).join("")}`;
}
export function agingBucket(dueDate: string, asOf: string): string {
  const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(days)) throw new Error("Invalid reporting date");
  return days <= 0 ? "Current" : days <= 30 ? "1–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+";
}
