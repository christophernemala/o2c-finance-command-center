import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, aggregateAmount, positiveAmount, addAmounts, subtractAmounts, formatAed, agingBucket } from "../src/lib/money";
test("financial decimal arithmetic preserves cents and maximum amounts", () => {
  assert.equal(addAmounts(["0.10","0.20"]),"0.30");
  assert.equal(subtractAmounts("1000.00","999.99"),"0.01");
  assert.equal(amount("9999999999999.99"),"9999999999999.99");
  assert.match(formatAed("9999999999999.99"),/9,999,999,999,999\.99/);
  assert.match(formatAed("0.00"),/0\.00/);
  assert.equal(aggregateAmount(addAmounts(["9999999999999.99","9999999999999.99"])),"19999999999999.98");
});
test("strict amount contracts reject numbers, locale ambiguity, overflow and fractional cents", () => {
  for (const value of [0.1,"1,000.00","1e2","NaN","-0.01","1.001","10000000000000.00",null," 1.00 "]) assert.throws(()=>amount(value));
  assert.throws(()=>positiveAmount("0.00"));
});
test("aging boundaries separate current, 30, 60, 90 and 91 days", () => {
  const asOf="2026-10-04";
  for (const [days,bucket] of [[0,"Current"],[1,"1–30"],[30,"1–30"],[31,"31–60"],[60,"31–60"],[61,"61–90"],[90,"61–90"],[91,"90+"]] as const) {
    const date=new Date(`${asOf}T00:00:00Z`); date.setUTCDate(date.getUTCDate()-days);
    assert.equal(agingBucket(date.toISOString().slice(0,10),asOf),bucket);
  }
});
