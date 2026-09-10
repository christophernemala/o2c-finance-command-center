import { generateBankStatements, generateFinanceRows } from "../modules/DataIngestion/mockData";
import { summarizeNormalAging } from "../modules/AgingAnalytics/aging";
import { summarizeEclProvision } from "../modules/ECLProvision/ecl";
import { buildIfrsDisclosure } from "../modules/IFRSReporting/ifrs";
import { reconcileBankStatements } from "../modules/BankReconciliation/reconciliation";
import { buildExpiryReminders } from "../modules/Reminders/reminders";
import { buildInvoiceDocuments, buildPaymentProofAudit } from "../modules/InvoiceDocuments/invoiceDocuments";
import { buildSlaProfiles } from "../modules/SlaDirectory/slaDirectory";

export function buildLocalFinanceModel() {
  const rows = generateFinanceRows(1250);
  const bankStatements = generateBankStatements(rows);
  const aging = summarizeNormalAging(rows);
  const ecl = summarizeEclProvision(rows);
  const ifrs = buildIfrsDisclosure(rows);
  const reconciliation = reconcileBankStatements(rows, bankStatements);
  const reminders = buildExpiryReminders(rows);
  const slaProfiles = buildSlaProfiles(rows);
  const invoiceDocuments = buildInvoiceDocuments(rows);
  const paymentProofAudit = buildPaymentProofAudit(reconciliation);
  return { rows, bankStatements, aging, ecl, ifrs, reconciliation, reminders, slaProfiles, invoiceDocuments, paymentProofAudit };
}
