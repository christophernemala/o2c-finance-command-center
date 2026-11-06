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
export function amountExceeds(value: string, limit: string): boolean {
  return new Money(amount(value)).gt(amount(limit));
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

// Currency-aware money. Amounts stay decimal strings; every operation names its currency.
import { minorUnits } from "./currency";
export interface MoneyValue { amount: string; currency: string }
/** Validates an amount against the currency's own decimal places (KWD 3, AED 2, JPY 0) and up to 16 integer digits. */
export function amountIn(value: unknown, currency: string): string {
  const units = minorUnits(currency);
  const pattern = units === 0 ? /^-?(?:0|[1-9]\d{0,15})$/ : new RegExp(`^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,${units}})?$`);
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`Use a ${currency} amount with at most ${units} decimal places.`);
  return new Money(value).toFixed(units);
}
/** The one explicit rounding point: banker's rounding (half to even) to the currency's minor units. */
export function roundMoney(value: string, currency: string): string {
  const decimal = new Money(value);
  if (!decimal.isFinite()) throw new Error("Invalid amount");
  return decimal.toDecimalPlaces(minorUnits(currency), Decimal.ROUND_HALF_EVEN).toFixed(minorUnits(currency));
}
function sameCurrency(values: MoneyValue[]): string {
  const [first] = values; if (!first) throw new Error("No amounts");
  if (values.some(value => value.currency !== first.currency)) throw new Error("Cannot combine amounts in different currencies");
  return first.currency;
}
export function sumMoney(values: MoneyValue[]): MoneyValue {
  const currency = sameCurrency(values);
  return { currency, amount: values.reduce((sum, value) => sum.plus(amountIn(value.amount, currency)), new Money(0)).toFixed(minorUnits(currency)) };
}
export function subtractMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  const currency = sameCurrency([left, right]);
  return { currency, amount: new Money(amountIn(left.amount, currency)).minus(amountIn(right.amount, currency)).toFixed(minorUnits(currency)) };
}
/** Locale presentation with the ISO decimal places, without converting the value to Number. */
export function formatMoney(value: string, currency: string, locale = "en"): string {
  const decimal = new Money(value);
  if (!decimal.isFinite()) throw new Error("Invalid amount");
  const units = minorUnits(currency);
  const [integer, fraction = ""] = decimal.abs().toFixed(units).split(".");
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: units, maximumFractionDigits: units }).formatToParts(BigInt(integer));
  // formatToParts on a BigInt emits a zero fraction of the right length; swap in the real digits, in the locale's numerals.
  const digits = localDigits(locale);
  const text = parts.map(part => part.type === "fraction" ? [...fraction].map(d => digits[Number(d)]).join("") : part.value).join("");
  return `${decimal.isNegative() && !decimal.isZero() ? "−" : ""}${text}`;
}
function localDigits(locale: string): string[] { const format = new Intl.NumberFormat(locale, { useGrouping: false }); return Array.from({ length: 10 }, (_, d) => format.format(d)); }
