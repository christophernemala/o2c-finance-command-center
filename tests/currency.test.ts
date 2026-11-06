import { test } from "node:test";
import assert from "node:assert/strict";
import { amountIn, formatMoney as format, roundMoney, subtractMoney, sumMoney } from "../src/lib/money";
import { amountInputPattern, currencyCodes, isCurrency, minorUnits } from "../src/lib/currency";

test("minor units follow ISO 4217, not the runtime's display digits", () => {
  assert.equal(minorUnits("KWD"), 3); assert.equal(minorUnits("BHD"), 3); assert.equal(minorUnits("OMR"), 3);
  assert.equal(minorUnits("IQD"), 3, "ICU shows IQD with 0 digits; ISO says 3");
  assert.equal(minorUnits("JPY"), 0); assert.equal(minorUnits("AED"), 2); assert.equal(minorUnits("USD"), 2); assert.equal(minorUnits("INR"), 2);
  assert.equal(minorUnits("LBP"), 2, "ICU shows LBP with 0 digits; ISO says 2");
  for (const code of ["CLF", "XDR", "HRK", "ZWL", "aed", "XXX", ""]) assert.equal(isCurrency(code), false, code);
  assert.throws(() => minorUnits("XDR"), /Unsupported currency/);
  // Intl accepts any well-formed three-letter code, so membership is pinned explicitly: a change to the list must change this test.
  assert.equal(currencyCodes.length, 156);
  assert.equal(new Set(currencyCodes).size, currencyCodes.length, "no duplicates");
  for (const code of ["USD", "EUR", "GBP", "INR", "AED", "SAR", "KWD", "BHD", "OMR", "JPY", "ZWG", "SLE", "XCG", "VES"]) assert.ok(isCurrency(code), code);
  for (const withdrawn of ["CUC", "HRK", "SLL", "ZWL", "VEF", "MRO"]) assert.equal(isCurrency(withdrawn), false, `${withdrawn} is withdrawn`);
});

test("amounts are validated against their currency's decimal places", () => {
  assert.equal(amountIn("1.234", "KWD"), "1.234");
  assert.equal(amountIn("1.2", "KWD"), "1.200");
  assert.throws(() => amountIn("1.2345", "KWD"), /at most 3 decimal places/);
  assert.equal(amountIn("1234", "JPY"), "1234");
  assert.throws(() => amountIn("100.5", "JPY"), /at most 0 decimal places/);
  assert.equal(amountIn("10.5", "AED"), "10.50");
  assert.throws(() => amountIn("10.555", "AED"));
  for (const bad of [1.5, "1,000", "", " 1", "01", "1e3", null]) assert.throws(() => amountIn(bad, "USD"), `${String(bad)}`);
  assert.throws(() => amountIn("1", "XDR"), /Unsupported currency/);
  assert.equal(amountIn("9999999999999999.999", "KWD"), "9999999999999999.999", "16 integer digits fit numeric(20,4)");
  assert.throws(() => amountIn("10000000000000000", "USD"));
});

test("sums never mix currencies and keep three decimals exact", () => {
  assert.deepEqual(sumMoney([{ amount: "1.234", currency: "KWD" }, { amount: "0.001", currency: "KWD" }, { amount: "2.1", currency: "KWD" }]), { amount: "3.335", currency: "KWD" });
  assert.deepEqual(sumMoney([{ amount: "0.1", currency: "BHD" }, { amount: "0.2", currency: "BHD" }]), { amount: "0.300", currency: "BHD" }, "no float drift");
  assert.throws(() => sumMoney([{ amount: "1", currency: "KWD" }, { amount: "1", currency: "USD" }]), /different currencies/);
  assert.throws(() => subtractMoney({ amount: "1", currency: "AED" }, { amount: "1", currency: "INR" }), /different currencies/);
  assert.deepEqual(subtractMoney({ amount: "1.000", currency: "OMR" }, { amount: "0.001", currency: "OMR" }), { amount: "0.999", currency: "OMR" });
});

test("rounding is banker's rounding at one explicit point", () => {
  assert.equal(roundMoney("2.345", "AED"), "2.34"); assert.equal(roundMoney("2.355", "AED"), "2.36");
  assert.equal(roundMoney("1.2345", "KWD"), "1.234"); assert.equal(roundMoney("1.2355", "KWD"), "1.236");
  assert.equal(roundMoney("100.5", "JPY"), "100"); assert.equal(roundMoney("101.5", "JPY"), "102");
});

test("formatting uses the currency's own decimals and the locale's numerals", () => {
  // Intl separates code and number with a no-break space, which the UI keeps; compare with plain spaces.
  const formatMoney = (...args: Parameters<typeof format>) => format(...args).replace(/\u00a0/g, " ");
  assert.equal(formatMoney("1.234", "KWD"), "KWD 1.234");
  assert.equal(formatMoney("1234", "JPY"), "JPY 1,234");
  assert.equal(formatMoney("-1234567.5", "AED"), "-AED 1,234,567.50", "the locale places the sign");
  assert.equal(formatMoney("-0.5", "AED"), "-AED 0.50", "a negative amount under one keeps its sign");
  assert.match(format("-1.5", "BHD", "ar-BH"), /^\u200f?\u061c?-?.*١٫٥٠٠/u, "RTL keeps the locale's own sign and marks");
  assert.throws(() => format("1.2345", "KWD"), /at most 3 decimal places/, "display never rounds silently");
  assert.equal(formatMoney("1234567.5", "INR", "en-IN"), "INR 12,34,567.50");
  assert.equal(formatMoney("1234.5", "EUR", "de-DE"), "1.234,50 EUR");
  assert.match(formatMoney("1.891", "BHD", "ar-BH"), /٫٨٩١/, "fraction digits follow the locale");
  assert.equal(formatMoney("99999999999999999.123", "KWD"), "KWD 99,999,999,999,999,999.123", "beyond Number precision stays exact");
});

test("amount inputs take their pattern from the currency", () => {
  const matches = (currency: string, value: string) => new RegExp(`^(?:${amountInputPattern(currency)})$`).test(value);
  assert.ok(matches("KWD", "1.234")); assert.ok(!matches("KWD", "1.2345"));
  assert.ok(matches("JPY", "1234")); assert.ok(!matches("JPY", "1.5"));
  assert.ok(matches("AED", "10.50")); assert.ok(!matches("AED", "10.505"));
});
