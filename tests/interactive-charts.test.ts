import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceCharts } from "../src/components/finance-charts";
test("financial visuals offer accessible chart controls, exact balances and meaningful state names", () => {
  const html = renderToStaticMarkup(createElement(FinanceCharts, { charts: [{ key: "collections", title: "Collection states", description: "Recorded collection balances", unit: "AED", series: [{ label: "follow_up", value: "9999999999999.99" }, { label: "promise_to_pay", value: "0.10" }] }] }));
  assert.match(html, /Bar chart/); assert.match(html, /Donut chart/); assert.match(html, /Exact figures/);
  assert.match(html, /Follow-up due/); assert.match(html, /Promise to pay/);
  assert.match(html, /9,999,999,999,999.99/);
  assert.doesNotMatch(html, /follow_up|promise_to_pay|confidence/i);
});
