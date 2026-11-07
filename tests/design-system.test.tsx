// Test files run outside the Next.js JSX transform, so the classic runtime needs React in scope.
import React from "react"; void React;
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, DataTable, ErrorState, Input, MoneyText, Skeleton, Spinner, StatTile, Switch, sortRows, type Column } from "../src/components/ui";

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
  // Adjacent amounts above Number.MAX_SAFE_INTEGER are equal as Numbers; only an exact decimal comparison orders them.
  const huge = [{ id: "y", customer: "Y", balance: "9007199254740992.2" }, { id: "x", customer: "X", balance: "9007199254740992.1" }];
  assert.equal(Number(huge[0].balance), Number(huge[1].balance), "the fixture really is indistinguishable as a Number");
  assert.deepEqual(sortRows(huge, columns, "balance:asc").map(row => row.id), ["x", "y"]);
  assert.deepEqual(sortRows([...huge].reverse(), columns, "balance:desc").map(row => row.id), ["y", "x"]);
  const broken = [...rows, { id: "e", customer: "Bad", balance: "not-a-number" }];
  assert.deepEqual(sortRows(broken, columns, "balance:asc").map(row => row.id), ["c", "a", "b", "d", "e"], "a malformed amount sorts last with the missing ones instead of throwing");
  assert.deepEqual(sortRows(broken, columns, "balance:desc").map(row => row.id), ["b", "a", "c", "d", "e"], "and stays last when the order is reversed");
});

test("the data table renders sortable headers, a filter and phone cards", () => {
  const html = renderToStaticMarkup(<DataTable caption="Receivables" rows={rows} columns={columns} rowKey={row => row.id} sort="balance:desc"
    hrefFor={change => `/?${new URLSearchParams({ view: "receivables", ...change })}`}/>);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /href="\/\?view=receivables&amp;sort=balance%3Aasc"/, "clicking the active column flips it");
  assert.match(html, /<input type="hidden" name="view" value="receivables"\/>/, "the filter keeps the other parameters");
  assert.match(html, /class="ds-table-cards"/);
  assert.match(html, /class="ds-table-sort"[\s\S]*<option value="balance:desc" selected="">Balance ↓<\/option>/, "phones get a sort control");
  assert.match(html, /KWD.9,999,999,999,999,999.990/, "three decimals, no precision lost");
  assert.match(renderToStaticMarkup(<DataTable caption="Empty" rows={[]} columns={columns} rowKey={row => row.id} query="x" hrefFor={() => "/"}/>), /No rows match this filter/);
  assert.match(renderToStaticMarkup(<DataTable caption="Empty" rows={[]} columns={columns} rowKey={row => row.id} query="   " hrefFor={() => "/"}/>), /There are no rows yet/, "a blank filter is no filter");
  const two = renderToStaticMarkup(<><DataTable caption="Same" rows={rows} columns={columns} rowKey={row => row.id} hrefFor={() => "/"}/><DataTable caption="Same" rows={rows} columns={columns} rowKey={row => row.id} hrefFor={() => "/"}/></>);
  const ids = [...two.matchAll(/<input id="([^"]+)"[^>]*name="q"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, 2, "two tables with the same caption get distinct filter ids");
});

test("KPI and error states are explicit", () => {
  assert.match(renderToStaticMarkup(<StatTile label="DSO" state={{ kind: "insufficient", reason: "fewer than 30 days of invoices" }}/>), /Not enough data: fewer than 30 days/);
  assert.match(renderToStaticMarkup(<StatTile label="DSO" state={{ kind: "error", retryHref: "/?view=overview" }}/>), /Couldn&#x27;t load.*Retry/);
  assert.match(renderToStaticMarkup(<StatTile label="DSO" state={{ kind: "value", value: "42 days", asOf: "2026-03-31" }}/>), /42 days.*Mar 31, 2026/);
  const forbidden = renderToStaticMarkup(<ErrorState kind="forbidden" retryHref="/x"/>);
  assert.match(forbidden, /role="alert"/); assert.match(forbidden, /don&#x27;t have access/);
});

test("switches and spinners keep native semantics", () => {
  const html = renderToStaticMarkup(<Switch name="attach" defaultChecked label="Attach statement PDF"/>);
  assert.match(html, /<label class="ds-switch-row"><input type="checkbox" role="switch" class="ds-switch" name="attach" checked=""\/><span>Attach statement PDF<\/span><\/label>/);
  assert.match(renderToStaticMarkup(<Spinner/>), /<span class="ds-spinner" aria-hidden="true"><\/span>/, "decorative by default");
  assert.match(renderToStaticMarkup(<Spinner label="Loading"/>), /role="status" aria-label="Loading"/);
});

test("primitives: buttons don't submit by default, caller validity is kept, skeleton widths stay positive", () => {
  assert.match(renderToStaticMarkup(<Button>Open</Button>), /type="button"/);
  assert.match(renderToStaticMarkup(<Button type="submit">Save</Button>), /type="submit"/);
  assert.match(renderToStaticMarkup(<Input id="ref" label="Reference" aria-invalid/>), /aria-invalid="true"/, "externally validated fields stay invalid");
  assert.match(renderToStaticMarkup(<Input id="ref" label="Reference" error="Required"/>), /aria-invalid="true"/);
  assert.doesNotMatch(renderToStaticMarkup(<Input id="ref" label="Reference"/>), /aria-invalid/);
  const widths = [...renderToStaticMarkup(<Skeleton lines={10}/>).matchAll(/width:(-?\d+)%/g)].map(match => Number(match[1]));
  assert.equal(widths.length, 10); assert.ok(widths.every(width => width > 0), widths.join(","));
});

test("a sort request for a non-sortable column is not announced as a sort", () => {
  const plain: Column<Row>[] = [{ key: "customer", header: "Customer", cell: row => row.customer, primary: true }, { key: "note", header: "Note", cell: () => "—" }];
  const html = renderToStaticMarkup(<DataTable rows={rows} columns={plain} caption="Accounts" rowKey={row => row.id} sort="note:asc" hrefFor={() => "/?"}/>);
  assert.doesNotMatch(html, /aria-sort/);
});
