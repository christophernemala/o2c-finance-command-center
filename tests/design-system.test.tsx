// Test files run outside the Next.js JSX transform, so the classic runtime needs React in scope.
import React from "react"; void React;
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, ErrorState, MoneyText, StatTile, sortRows, type Column } from "../src/components/ui";

type Row = { id: string; customer: string; balance: string | null };
const rows: Row[] = [{ id: "a", customer: "Zeta", balance: "10.5" }, { id: "b", customer: "Alpha", balance: "9999999999999999.99" }, { id: "c", customer: "Mid", balance: "10.49" }, { id: "d", customer: "None", balance: null }];
const columns: Column<Row>[] = [
  { key: "customer", header: "Customer", cell: row => row.customer, sortValue: row => row.customer, primary: true },
  { key: "balance", header: "Balance", cell: row => row.balance === null ? "—" : <MoneyText value={row.balance} currency="KWD"/>, sortValue: row => row.balance, numeric: true, align: "end" },
];

test("sorting compares amounts exactly and keeps missing values last", () => {
  assert.deepEqual(sortRows(rows, columns, "balance:asc").map(row => row.id), ["c", "a", "b", "d"]);
  assert.deepEqual(sortRows(rows, columns, "balance:desc").map(row => row.id), ["b", "a", "c", "d"]);
  assert.deepEqual(sortRows(rows, columns, "customer:asc").map(row => row.id), ["b", "c", "d", "a"]);
  assert.deepEqual(sortRows(rows, columns, "unknown:asc").map(row => row.id), ["a", "b", "c", "d"], "an unknown sort keeps the given order");
  assert.deepEqual(sortRows(rows, columns, undefined, "  zE ").map(row => row.id), ["a"]);
});

test("the data table renders sortable headers, a filter and phone cards", () => {
  const html = renderToStaticMarkup(<DataTable caption="Receivables" rows={rows} columns={columns} rowKey={row => row.id} sort="balance:desc"
    hrefFor={change => `/?${new URLSearchParams({ view: "receivables", ...change })}`}/>);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /href="\/\?view=receivables&amp;sort=balance%3Aasc"/, "clicking the active column flips it");
  assert.match(html, /<input type="hidden" name="view" value="receivables"\/>/, "the filter keeps the other parameters");
  assert.match(html, /class="ds-table-cards"/);
  assert.match(html, /KWD.9,999,999,999,999,999.990/, "three decimals, no precision lost");
  assert.match(renderToStaticMarkup(<DataTable caption="Empty" rows={[]} columns={columns} rowKey={row => row.id} query="x" hrefFor={() => "/"}/>), /No rows match this filter/);
});

test("KPI and error states are explicit", () => {
  assert.match(renderToStaticMarkup(<StatTile label="DSO" state={{ kind: "insufficient", reason: "fewer than 30 days of invoices" }}/>), /Not enough data: fewer than 30 days/);
  assert.match(renderToStaticMarkup(<StatTile label="DSO" state={{ kind: "error", retryHref: "/?view=overview" }}/>), /Couldn&#x27;t load.*Retry/);
  assert.match(renderToStaticMarkup(<StatTile label="DSO" state={{ kind: "value", value: "42 days", asOf: "2026-03-31" }}/>), /42 days.*Mar 31, 2026/);
  const forbidden = renderToStaticMarkup(<ErrorState kind="forbidden" retryHref="/x"/>);
  assert.match(forbidden, /role="alert"/); assert.match(forbidden, /don&#x27;t have access/);
});
