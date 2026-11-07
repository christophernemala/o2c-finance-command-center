/** Time zones: timestamps are stored in UTC and converted only for display and for day boundaries. */
const zones = new Set(Intl.supportedValuesOf("timeZone"));
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  if (zones.has(value) || value === "UTC") return true;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(value); } catch { return false; }
}
function zone(timeZone: string): string { if (!isTimeZone(timeZone)) throw new Error(`Unsupported time zone: ${timeZone}`); return timeZone; }
/** The calendar date (YYYY-MM-DD) in the entity's zone at the given instant. */
export function entityDate(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
/** First day of the entity-local month containing the instant, as YYYY-MM-DD. */
export function entityMonthStart(timeZone: string, at: Date = new Date()): string { return `${entityDate(timeZone, at).slice(0, 7)}-01`; }
/** A timestamp shown in the entity's zone, with the zone named so the reader knows which clock it is. */
export function formatEntityTime(value: string | Date, timeZone: string, locale = "en"): string {
  const at = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(at.getTime())) throw new Error("Invalid timestamp");
  // Engines roll impossible calendar dates over (2026-02-31 becomes 3 March), so reject them instead of showing another day.
  const written = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (written) { const day = new Date(Date.UTC(+written[1], +written[2] - 1, +written[3])); if (day.toISOString().slice(0, 10) !== written[0]) throw new Error("Invalid timestamp"); }
  return new Intl.DateTimeFormat(locale, { timeZone: zone(timeZone), year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(at);
}
/** A calendar date (due date, as-of date) shown without shifting it through any zone. */
export function formatCalendarDate(value: string, locale = "en"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  const date = new Date(`${value}T00:00:00Z`); // Impossible dates such as 2026-02-31 must not roll over to another day.
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid date");
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(date);
}
