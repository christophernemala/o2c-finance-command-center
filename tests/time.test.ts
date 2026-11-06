import { test } from "node:test";
import assert from "node:assert/strict";
import { entityDate, entityMonthStart, formatCalendarDate, formatEntityTime, isTimeZone } from "../src/lib/time";

test("each entity gets its own today around its own midnight", () => {
  const at = new Date("2026-03-31T19:45:00Z"); // 23:45 in Dubai (UTC+4), 01:15 next day in Kolkata (UTC+5:30)
  assert.equal(entityDate("Asia/Dubai", at), "2026-03-31");
  assert.equal(entityDate("Asia/Kolkata", at), "2026-04-01", "an invoice due 2026-03-31 is overdue in Kolkata, due today in Dubai");
  assert.equal(entityDate("Asia/Kuwait", at), "2026-03-31");
  assert.equal(entityMonthStart("Asia/Kolkata", at), "2026-04-01");
  assert.equal(entityMonthStart("Asia/Dubai", at), "2026-03-01", "collected this month differs at month end");
});

test("New York day boundaries follow daylight saving", () => {
  // DST began 2026-03-08 at 02:00 local: midnight is 05:00Z before, 04:00Z after.
  assert.equal(entityDate("America/New_York", new Date("2026-03-07T04:59:00Z")), "2026-03-06");
  assert.equal(entityDate("America/New_York", new Date("2026-03-07T05:00:00Z")), "2026-03-07");
  assert.equal(entityDate("America/New_York", new Date("2026-03-09T03:59:00Z")), "2026-03-08");
  assert.equal(entityDate("America/New_York", new Date("2026-03-09T04:00:00Z")), "2026-03-09");
  // DST ended 2026-11-01: midnight is 05:00Z again afterwards.
  assert.equal(entityDate("America/New_York", new Date("2026-11-02T04:59:00Z")), "2026-11-01");
  assert.equal(entityDate("America/New_York", new Date("2026-11-02T05:00:00Z")), "2026-11-02");
});

test("only real IANA zones are accepted", () => {
  for (const zone of ["Asia/Dubai", "Asia/Kolkata", "Asia/Kuwait", "America/New_York", "UTC", "Europe/London"]) assert.ok(isTimeZone(zone), zone);
  for (const zone of ["Dubai", "GMT+4", "Asia/Nowhere", "", "Asia/Dubai; drop table", 4]) assert.equal(isTimeZone(zone), false, String(zone));
  assert.throws(() => entityDate("Mars/Olympus"), /Unsupported time zone/);
});

test("display names the zone and calendar dates never shift", () => {
  assert.match(formatEntityTime("2026-03-31T19:45:00Z", "Asia/Kolkata"), /Apr 1, 2026.*1:15.*GMT\+5:30/);
  assert.match(formatEntityTime("2026-03-31T19:45:00Z", "Asia/Dubai"), /Mar 31, 2026.*11:45.*GMT\+4/);
  assert.equal(formatCalendarDate("2026-03-31"), "Mar 31, 2026");
  assert.throws(() => formatCalendarDate("31/03/2026"));
  assert.throws(() => formatCalendarDate("2026-02-31"), /Invalid date/, "impossible dates never roll over to another day");
});
