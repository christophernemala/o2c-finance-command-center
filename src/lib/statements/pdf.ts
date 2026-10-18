import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatAed } from "../money";

/** paid is cash applied; credited is posted credit notes. A debit note line is labelled as such. */
export interface StatementLine { number: string; document_type: "invoice" | "debit_note"; issued_at: string; due_date: string; gross: string; paid: string; credited: string; open: string; days_overdue: number }
export interface StatementData { as_of: string; entity: string; customer: string; account: string; lines: StatementLine[]; total_open: string; total_overdue: string }

const decimal = /^-?(0|[1-9]\d{0,27})(\.\d{1,2})?$/;
export function validateStatement(value: unknown): StatementData {
  const data = value as StatementData;
  if (!data || typeof data.customer !== "string" || !Array.isArray(data.lines) || !decimal.test(data.total_open) || !decimal.test(data.total_overdue)) throw new Error("Statement unavailable");
  for (const line of data.lines) if (![line.gross, line.paid, line.credited, line.open].every(amount => typeof amount === "string" && decimal.test(amount))
    || !["invoice", "debit_note"].includes(line.document_type)) throw new Error("Statement unavailable");
  return data;
}
const ascii = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?"); // standard PDF fonts cover Latin-1 only
const money = (value: string) => ascii(formatAed(value));
const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");

/** Open-items statement built only from ledger figures. Amounts are formatted from decimal strings, never floats. */
export async function statementPdf(input: StatementData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Statement of account ${input.account}`); pdf.setProducer("O2C Finance Command Center"); pdf.setCreationDate(new Date(`${input.as_of}T00:00:00Z`));
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.043, 0.071, 0.125), muted = rgb(0.337, 0.376, 0.447), line = rgb(0.89, 0.906, 0.929);
  const columns = [{ x: 48, w: 100, label: "Document" }, { x: 148, w: 60, label: "Issued" }, { x: 208, w: 60, label: "Due" },
    { x: 268, w: 70, label: "Amount", right: true }, { x: 338, w: 70, label: "Paid", right: true }, { x: 408, w: 70, label: "Credited", right: true }, { x: 478, w: 70, label: "Open", right: true }];
  let page: PDFPage = pdf.addPage([595.28, 841.89]); let y = 790;
  const text = (target: PDFPage, value: string, x: number, at: number, font: PDFFont = regular, size = 9, color = ink, right = false, width = 0) =>
    target.drawText(ascii(value), { x: right ? x + width - font.widthOfTextAtSize(ascii(value), size) : x, y: at, size, font, color });
  const header = () => {
    text(page, "Statement of account", 48, y, bold, 16); y -= 22;
    text(page, input.entity, 48, y, regular, 10, muted); text(page, `As of ${ddmmyyyy(input.as_of)}`, 400, y, regular, 10, muted, true, 147); y -= 28;
    text(page, input.customer, 48, y, bold, 11); y -= 14; text(page, `Account ${input.account}`, 48, y, regular, 9, muted); y -= 26;
    for (const column of columns) text(page, column.label, column.x, y, bold, 8, muted, column.right, column.w);
    y -= 8; page.drawLine({ start: { x: 48, y }, end: { x: 548, y }, thickness: 0.75, color: line }); y -= 14;
  };
  header();
  for (const item of input.lines) {
    if (y < 90) { page = pdf.addPage([595.28, 841.89]); y = 790; header(); }
    const values = [item.number, ddmmyyyy(item.issued_at), ddmmyyyy(item.due_date), money(item.gross), money(item.paid), money(item.credited), money(item.open)];
    columns.forEach((column, index) => text(page, values[index], column.x, y, index === 6 ? bold : regular, 9, ink, column.right, column.w));
    const detail = [item.document_type === "debit_note" ? "Debit note" : "", item.days_overdue > 0 ? `${item.days_overdue} days overdue` : ""].filter(Boolean).join(" · ");
    if (detail) text(page, detail, 48, y - 11, regular, 7, muted);
    y -= detail ? 26 : 18;
  }
  if (!input.lines.length) { text(page, "No open invoices.", 48, y, regular, 9, muted); y -= 18; }
  y -= 4; page.drawLine({ start: { x: 298, y: y + 10 }, end: { x: 548, y: y + 10 }, thickness: 0.75, color: line });
  text(page, "Total open", 298, y - 4, bold, 10); text(page, money(input.total_open), 458, y - 4, bold, 10, ink, true, 90);
  text(page, "Of which overdue", 298, y - 20, regular, 9, muted); text(page, money(input.total_overdue), 458, y - 20, regular, 9, muted, true, 90);
  text(page, "Paid is cash received and applied. Credited is credit notes issued against the document.", 48, 36, regular, 7, muted);
  text(page, "Generated from the ledger by O2C Finance Command Center. Please contact Accounts Receivable about any item you dispute.", 48, 48, regular, 7, muted);
  return pdf.save();
}
