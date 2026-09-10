import type { AgingBucket, BankStatementLine, EclBucket, FinanceRow } from "../../shared/types";

const customers = [
  "Northstar Trading", "Helio Retail Partners", "Cobalt Facilities", "Vertex Distribution",
  "Summit Healthcare", "Atlas Property Group", "Nova Hospitality", "Pioneer Logistics",
  "Crescent Manufacturing", "Harbor Foods", "Meridian Services", "Apex Infrastructure"
];

const entities = ["O2C Global Holding", "O2C Retail Co", "O2C Property Co", "O2C Services Co", "O2C Healthcare Co"];
const businessUnits = ["Retail", "Real Estate", "Healthcare", "Logistics", "Shared Services"];
const glAccounts = ["1100-AR-Trade", "1120-AR-Related", "2110-Deferred", "4100-Revenue", "5100-Allowance-ECL"];

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function isoDateFromOffset(base: Date, offsetDays: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function getNormalAgingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  if (daysPastDue <= 180) return "91-180";
  if (daysPastDue <= 360) return "181-360";
  return "361+";
}

export function getEclBucket(daysPastDue: number): EclBucket {
  if (daysPastDue <= 0) return "Current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  if (daysPastDue <= 120) return "91-120";
  if (daysPastDue <= 180) return "121-180";
  return "180+";
}

export function getProvisionRate(daysPastDue: number) {
  if (daysPastDue <= 0) return 0.0025;
  if (daysPastDue <= 30) return 0.01;
  if (daysPastDue <= 60) return 0.025;
  if (daysPastDue <= 90) return 0.05;
  if (daysPastDue <= 120) return 0.15;
  if (daysPastDue <= 180) return 0.35;
  return 1.0;
}

export function getEclPolicy(daysPastDue: number) {
  const bucket = getEclBucket(daysPastDue);
  const rate = getProvisionRate(daysPastDue);
  return {
    bucket,
    rate,
    stage: daysPastDue > 90 ? "Stage 2" : "Stage 1",
    rule: bucket === "180+" ? "Above 180 days is 100% ECL" : "IFRS 9 provision matrix"
  };
}

export function generateFinanceRows(count = 1250, seed = 42): FinanceRow[] {
  const rand = seeded(seed);
  const today = new Date("2026-06-13T00:00:00.000Z");

  return Array.from({ length: count }, (_, index) => {
    const customerIndex = Math.floor(rand() * customers.length);
    const entity = entities[Math.floor(rand() * entities.length)];
    const businessUnit = businessUnits[Math.floor(rand() * businessUnits.length)];
    const daysPastDue = Math.floor(rand() * 430) - 20;
    const invoiceDate = isoDateFromOffset(today, -Math.floor(rand() * 540) - 15);
    const dueDate = isoDateFromOffset(today, -daysPastDue);
    const amount = Math.round((25000 + rand() * 950000) * 100) / 100;
    const paidRatio = rand() > 0.72 ? rand() * 0.85 : 0;
    const paidAmount = Math.round(amount * paidRatio * 100) / 100;
    const outstandingAmount = Math.round((amount - paidAmount) * 100) / 100;
    const eclPolicy = getEclPolicy(daysPastDue);
    const provisionRate = eclPolicy.rate;
    const provisionAmount = Math.round(outstandingAmount * provisionRate * 100) / 100;
    const customerNumber = `CUST-${String(customerIndex + 1).padStart(5, "0")}`;
    const invoiceNumber = `INV-${String(202600000 + index)}`;
    const maybeDisputed = rand() > 0.92;
    const status = outstandingAmount <= 1 ? "Closed" : maybeDisputed ? "Disputed" : paidAmount > 0 ? "Partially Applied" : "Open";

    return {
      id: `AR-${String(index + 1).padStart(6, "0")}`,
      transactionDescription: `${businessUnit} O2C receivable ${invoiceNumber}`,
      transactionNumber: `TRX-${String(700000 + index)}`,
      glDate: isoDateFromOffset(today, -Math.floor(rand() * 120)),
      glAccount: glAccounts[Math.floor(rand() * glAccounts.length)],
      appliedAmount: paidAmount,
      paymentDate: paidAmount > 0 ? isoDateFromOffset(today, -Math.floor(rand() * 18)) : undefined,
      paymentReference: paidAmount > 0 ? `PAY-${String(880000 + index)}` : undefined,
      customerName: customers[customerIndex],
      customerNumber,
      customerEmail: `ar.${customerNumber.toLowerCase()}@example.local`,
      bankReference: `BNK-${String(500000 + Math.floor(rand() * 400000))}`,
      invoiceNumber,
      invoiceDate,
      dueDate,
      amount,
      paidAmount,
      outstandingAmount,
      receivedAmount: paidAmount,
      entity,
      businessUnit,
      currency: "AED",
      daysPastDue,
      agingBucket: getNormalAgingBucket(daysPastDue),
      eclBucket: eclPolicy.bucket,
      provisionRate,
      provisionAmount,
      status,
      comments: [{ at: "2026-06-13T08:00:00.000Z", user: "system", text: "Mock AR line generated for offline workflow." }],
      chequeExpiryDate: isoDateFromOffset(today, Math.floor(rand() * 160) - 35),
      tradeLicenseExpiryDate: isoDateFromOffset(today, Math.floor(rand() * 220) - 50),
      slaEmailSource: rand() > 0.5 ? "SLA" : rand() > 0.25 ? "Contract" : "Master Data"
    };
  });
}

export function generateBankStatements(rows: FinanceRow[], seed = 81): BankStatementLine[] {
  const rand = seeded(seed);
  const paidRows = rows.filter((row) => row.paidAmount > 0).slice(0, 420);
  const matched = paidRows.map((row, index) => ({
    id: `BST-${String(index + 1).padStart(6, "0")}`,
    date: row.paymentDate ?? "2026-06-13",
    bankAccount: "O2C-Main-Operating-001",
    bankReference: row.bankReference,
    invoiceNumber: rand() > 0.12 ? row.invoiceNumber : undefined,
    customerName: row.customerName,
    customerNumber: row.customerNumber,
    amount: row.paidAmount,
    currency: "AED" as const,
    description: `Receipt ${row.customerName} ${row.invoiceNumber}`
  }));
  const exceptions = Array.from({ length: 90 }, (_, index) => ({
    id: `BST-X-${String(index + 1).padStart(4, "0")}`,
    date: "2026-06-13",
    bankAccount: "O2C-Main-Operating-001",
    bankReference: `BNK-X${String(60000 + index)}`,
    customerName: customers[Math.floor(rand() * customers.length)],
    customerNumber: "Unknown",
    amount: Math.round((10000 + rand() * 350000) * 100) / 100,
    currency: "AED" as const,
    description: "Unidentified remittance requires collector review"
  }));
  return [...matched, ...exceptions];
}
