/**
 * ExcelUpload / excelParser.ts
 * ─────────────────────────────
 * Client-side .xlsx parser that converts uploaded bank-statement and invoice
 * workbooks into typed arrays the reconciliation engine can consume.
 *
 * Uses the lightweight SheetJS-compatible binary approach via the `fflate`
 * decompression library already bundled in this project, plus a minimal
 * XML-to-row parser.  No additional npm dependency is needed.
 */

import type { BankStatementLine, FinanceRow } from "../../shared/types";

/* ── tiny xlsx helpers (zip → xml → rows) ─────────────────────────── */

import { unzipSync } from "fflate";

interface RawSheet {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

const decoder = new TextDecoder();

function xmlText(xml: string, tag: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) results.push(match[1].trim());
  return results;
}

/**
 * Parse an xlsx ArrayBuffer into an array of RawSheet objects.
 */
export function parseXlsx(buffer: ArrayBuffer): RawSheet[] {
  const zip = unzipSync(new Uint8Array(buffer));
  /* shared strings table */
  const sstBytes = zip["xl/sharedStrings.xml"];
  const sharedStrings: string[] = sstBytes
    ? xmlText(decoder.decode(sstBytes), "t")
    : [];

  /* workbook.xml → sheet names */
  const wbBytes = zip["xl/workbook.xml"];
  const sheetNames: string[] = wbBytes
    ? xmlText(decoder.decode(wbBytes), "sheet").length
      ? (() => {
          const xml = decoder.decode(wbBytes);
          const names: string[] = [];
          const re = /<sheet\s+name="([^"]+)"/gi;
          let m: RegExpExecArray | null;
          while ((m = re.exec(xml)) !== null) names.push(m[1]);
          return names;
        })()
      : ["Sheet1"]
    : ["Sheet1"];

  /* parse each sheet */
  const sheets: RawSheet[] = [];
  for (let i = 0; i < sheetNames.length; i++) {
    const key = `xl/worksheets/sheet${i + 1}.xml`;
    const sheetBytes = zip[key];
    if (!sheetBytes) continue;
    const xml = decoder.decode(sheetBytes);
    const rowBlocks = xmlText(xml, "row");
    const grid: string[][] = [];
    for (const rowXml of rowBlocks) {
      const cellRegex = /<c\s+r="([A-Z]+)\d+"(?:\s+t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?/gi;
      const cells: { col: number; value: string }[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRegex.exec(rowXml)) !== null) {
        const colLetters = cm[1];
        const colIndex = colLetters.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
        const type = cm[2] ?? "";
        const raw = cm[3] ?? "";
        const value = type === "s" ? (sharedStrings[parseInt(raw)] ?? raw) : raw;
        cells.push({ col: colIndex, value });
      }
      if (!cells.length) continue;
      const maxCol = Math.max(...cells.map((c) => c.col));
      const row: string[] = Array.from({ length: maxCol + 1 }, () => "");
      for (const cell of cells) row[cell.col] = cell.value;
      grid.push(row);
    }
    if (grid.length < 2) continue;
    const headers = grid[0].map((h) => h.trim());
    const dataRows = grid.slice(1).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { if (h) obj[h] = r[idx] ?? ""; });
      return obj;
    });
    sheets.push({ name: sheetNames[i], headers, rows: dataRows });
  }
  return sheets;
}

/* ── column-alias normalisation ──────────────────────────────────── */

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const BANK_ALIASES: Record<string, string[]> = {
  date: ["date", "valuedate", "transactiondate", "statementdate", "bookingdate"],
  bankAccount: ["bankaccount", "account", "accountnumber", "accountno"],
  bankReference: ["bankreference", "reference", "ref", "transactionref", "statementref"],
  invoiceNumber: ["invoicenumber", "invoice", "invoiceno", "inv"],
  customerName: ["customername", "customer", "name", "payer", "payername", "beneficiary"],
  customerNumber: ["customernumber", "customeraccount", "customeraccountnumber", "accountnumber", "custno"],
  amount: ["amount", "creditamount", "debitamount", "transactionamount", "value"],
  description: ["description", "narration", "narrative", "details", "particulars", "remarks"],
};

const INVOICE_ALIASES: Record<string, string[]> = {
  invoiceNumber: ["invoicenumber", "invoice", "invoiceno", "inv", "documentnumber"],
  customerName: ["customername", "customer", "name", "billto"],
  customerNumber: ["customernumber", "customeraccount", "customeraccountnumber", "custno"],
  invoiceDate: ["invoicedate", "documentdate", "date"],
  dueDate: ["duedate", "paymentdue", "maturitydate"],
  amount: ["amount", "invoiceamount", "totalamount", "total", "grossamount"],
  paidAmount: ["paidamount", "amountpaid", "received", "paid"],
  outstandingAmount: ["outstandingamount", "outstanding", "balance", "openamount", "remainingamount"],
  bankReference: ["bankreference", "reference", "paymentreference"],
  currency: ["currency", "curr", "ccy"],
  entity: ["entity", "company", "legalentity"],
  businessUnit: ["businessunit", "bu", "department", "division"],
  glAccount: ["glaccount", "gl", "ledgeraccount"],
  status: ["status", "invoicestatus", "state"],
};

function mapColumns(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedHeaders = headers.map(normalize);
  for (const [field, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx >= 0) { mapping[field] = headers[idx]; break; }
    }
  }
  return mapping;
}

/* ── public conversion functions ─────────────────────────────────── */

export type SheetType = "bankStatement" | "invoice" | "unknown";

export interface ParsedUpload {
  fileName: string;
  sheets: {
    name: string;
    type: SheetType;
    headers: string[];
    rowCount: number;
    bankStatements: BankStatementLine[];
    invoices: Partial<FinanceRow>[];
    errors: string[];
  }[];
}

export function detectSheetType(headers: string[]): SheetType {
  const norm = headers.map(normalize);
  const bankScore = BANK_ALIASES.bankReference[0] && norm.some((h) => BANK_ALIASES.date.includes(h)) && norm.some((h) => BANK_ALIASES.amount.includes(h)) ? 2 : 0;
  const invScore = norm.some((h) => INVOICE_ALIASES.invoiceNumber.includes(h)) && norm.some((h) => INVOICE_ALIASES.amount.includes(h)) ? 2 : 0;
  /* bank statement heuristic: has "narration/narrative/description" and "date" but not "invoicedate" */
  const hasBankNarration = norm.some((h) => ["narration", "narrative", "description", "particulars"].includes(h));
  const hasInvoiceDate = norm.some((h) => ["invoicedate", "documentdate"].includes(h));
  if (bankScore > 0 && hasBankNarration && !hasInvoiceDate) return "bankStatement";
  if (invScore > 0 && hasInvoiceDate) return "invoice";
  if (bankScore >= invScore && bankScore > 0) return "bankStatement";
  if (invScore > bankScore) return "invoice";
  return "unknown";
}

let uploadIdCounter = 0;

export function convertUpload(fileName: string, buffer: ArrayBuffer): ParsedUpload {
  const rawSheets = parseXlsx(buffer);
  return {
    fileName,
    sheets: rawSheets.map((sheet) => {
      const type = detectSheetType(sheet.headers);
      const errors: string[] = [];
      let bankStatements: BankStatementLine[] = [];
      let invoices: Partial<FinanceRow>[] = [];

      if (type === "bankStatement") {
        const mapping = mapColumns(sheet.headers, BANK_ALIASES);
        bankStatements = sheet.rows.map((row, idx) => {
          const amount = parseFloat(row[mapping.amount] ?? "0") || 0;
          if (!amount) errors.push(`Row ${idx + 2}: missing or zero amount`);
          return {
            id: `UPL-BS-${++uploadIdCounter}`,
            date: row[mapping.date] ?? "",
            bankAccount: row[mapping.bankAccount] ?? "UPLOADED",
            bankReference: row[mapping.bankReference] ?? `UPL-REF-${uploadIdCounter}`,
            invoiceNumber: row[mapping.invoiceNumber] ?? undefined,
            customerName: row[mapping.customerName] ?? "Unknown",
            customerNumber: row[mapping.customerNumber] ?? "UNKNOWN",
            amount,
            currency: "AED" as const,
            description: row[mapping.description] ?? "",
          };
        }).filter((line) => line.amount !== 0);
      }

      if (type === "invoice") {
        const mapping = mapColumns(sheet.headers, INVOICE_ALIASES);
        invoices = sheet.rows.map((row, idx) => {
          const amount = parseFloat(row[mapping.amount] ?? "0") || 0;
          if (!amount) errors.push(`Row ${idx + 2}: missing or zero amount`);
          return {
            id: `UPL-INV-${++uploadIdCounter}`,
            invoiceNumber: row[mapping.invoiceNumber] ?? `UPL-INV-${uploadIdCounter}`,
            customerName: row[mapping.customerName] ?? "Unknown",
            customerNumber: row[mapping.customerNumber] ?? "UNKNOWN",
            invoiceDate: row[mapping.invoiceDate] ?? "",
            dueDate: row[mapping.dueDate] ?? "",
            amount,
            paidAmount: parseFloat(row[mapping.paidAmount] ?? "0") || 0,
            outstandingAmount: parseFloat(row[mapping.outstandingAmount] ?? String(amount)) || amount,
            bankReference: row[mapping.bankReference] ?? "",
            currency: "AED" as const,
            entity: row[mapping.entity] ?? "Uploaded",
            businessUnit: row[mapping.businessUnit] ?? "Uploaded",
            glAccount: row[mapping.glAccount] ?? "",
            status: (row[mapping.status] as FinanceRow["status"]) ?? "Open",
          };
        }).filter((inv) => inv.amount !== 0);
      }

      return {
        name: sheet.name,
        type,
        headers: sheet.headers,
        rowCount: sheet.rows.length,
        bankStatements,
        invoices,
        errors,
      };
    }),
  };
}
