/**
 * Active ISO 4217 currencies and their minor units (decimal places).
 *
 * The minor units come from ISO 4217, not from Intl: ICU shows several currencies with
 * fewer digits than ISO does (IQD is 3 in ISO but 0 in ICU; LBP, RSD and others are 2 in ISO
 * but 0 in ICU). Amounts are always validated and formatted with the ISO figure.
 *
 * Excluded: fund and accounting codes (CLF, UYW, UYI, BOV, CHE, CHW, COU, MXV, USN, XDR, XSU,
 * XUA, metals and test codes) and withdrawn codes: CUC, HRK (2023), SLL (replaced by SLE) and ZWL (replaced by ZWG in 2024).
 */
const zero = ["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"] as const;
const three = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"] as const;
const two = [
  "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BMD", "BND", "BOB", "BRL", "BSD", "BTN",
  "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR",
  "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IRR", "JMD", "KES", "KGS",
  "KHR", "KPW", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK",
  "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "QAR", "RON", "RSD", "RUB", "SAR",
  "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TOP", "TRY",
  "TTD", "TWD", "TZS", "UAH", "USD", "UYU", "UZS", "VES", "WST", "XCD", "XCG", "YER", "ZAR", "ZMW", "ZWG",
] as const;

export type CurrencyCode = (typeof zero)[number] | (typeof two)[number] | (typeof three)[number];
const minor = new Map<string, 0 | 2 | 3>([...zero.map(c => [c, 0] as const), ...two.map(c => [c, 2] as const), ...three.map(c => [c, 3] as const)]);

/** Every supported code, sorted, for selects and validation. */
export const currencyCodes = [...minor.keys()].sort() as CurrencyCode[];
export function isCurrency(value: unknown): value is CurrencyCode { return typeof value === "string" && minor.has(value); }
export function minorUnits(currency: string): 0 | 2 | 3 {
  const units = minor.get(currency);
  if (units === undefined) throw new Error(`Unsupported currency: ${currency}`);
  return units;
}
/** HTML `pattern` for an amount input in this currency: at most 16 integer digits and the currency's own decimals. */
export function amountInputPattern(currency: string): string {
  const units = minorUnits(currency);
  return units === 0 ? "(0|[1-9][0-9]{0,15})" : `(0|[1-9][0-9]{0,15})(\\.[0-9]{1,${units}})?`;
}
