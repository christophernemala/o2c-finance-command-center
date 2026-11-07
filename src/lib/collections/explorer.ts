import Decimal from "decimal.js";
import { addAmounts } from "../money";
import type { WorklistRow } from "../../types/collections";
export const bands = [
  { id: "1_30", label: "1–30 days", min: 1, max: 30 },
  { id: "31_60", label: "31–60 days", min: 31, max: 60 },
  { id: "61_90", label: "61–90 days", min: 61, max: 90 },
  { id: "91_120", label: "91–120 days", min: 91, max: 120 },
  { id: "121_180", label: "121–180 days", min: 121, max: 180 },
  { id: "181_plus", label: "181+ days", min: 181, max: Infinity },
] as const;
export type RiskBand = "all" | typeof bands[number]["id"];
export type WorklistSort = "overdue" | "age" | "customer";
export function riskBands(rows: WorklistRow[]) {
  return bands.map(band => { const accounts = rows.filter(row => row.oldest_days >= band.min && row.oldest_days <= band.max);
    return { ...band, count: accounts.length, amount: addAmounts(accounts.map(row => row.overdue)) };
  });
}
/** These bands classify accounts by their oldest invoice, not individual invoice balances. */
export function filterWorklist(rows: WorklistRow[], query: string, selected: RiskBand, sort: WorklistSort) {
  const band = bands.find(item => item.id === selected); const search = query.trim().toLocaleLowerCase("en");
  return rows.filter(row => (!band || row.oldest_days >= band.min && row.oldest_days <= band.max)
    && (!search || `${row.customer} ${row.account}`.toLocaleLowerCase("en").includes(search)))
    .sort((a, b) => (sort === "age" ? b.oldest_days - a.oldest_days : sort === "customer" ? a.customer.localeCompare(b.customer) : new Decimal(b.overdue).cmp(a.overdue)) || a.account.localeCompare(b.account));
}
