import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLocalFinanceModel } from "../src/data/financeModel";

const outDir = resolve("local-data");
mkdirSync(outDir, { recursive: true });
const model = buildLocalFinanceModel();
writeFileSync(resolve(outDir, "finance-rows.json"), JSON.stringify(model.rows, null, 2));
writeFileSync(resolve(outDir, "bank-statements.json"), JSON.stringify(model.bankStatements, null, 2));
writeFileSync(resolve(outDir, "daily-management-review.json"), JSON.stringify(model.ifrs, null, 2));
writeFileSync(resolve(outDir, "sla-profiles.json"), JSON.stringify(model.slaProfiles, null, 2));
writeFileSync(resolve(outDir, "invoice-documents.json"), JSON.stringify(model.invoiceDocuments, null, 2));
writeFileSync(resolve(outDir, "payment-proof-audit.json"), JSON.stringify(model.paymentProofAudit, null, 2));
console.log(`Generated ${model.rows.length} generic O2C AR rows and ${model.bankStatements.length} bank statement lines in ${outDir}`);
