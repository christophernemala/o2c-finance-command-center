import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  Lock,
  Mail,
  Menu,
  AlertTriangle,
  PlugZap,
  RefreshCw,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  TableProperties,
  Upload,
  UserRound
} from "lucide-react";
import { buildLocalFinanceModel } from "./data/financeModel";
import { downloadWorkbook } from "./modules/DashboardRenderer/browserExcel";
import { draftSoaEmail } from "./modules/EmailDrafting/emailDrafts";
import { findSlaProfile } from "./modules/SlaDirectory/slaDirectory";
import { convertUpload, type ParsedUpload } from "./modules/ExcelUpload/excelParser";
import { reconcileUpload, type ReconciliationSummary } from "./modules/ExcelUpload/reconciliationEngine";
import { WalkingRobot } from "./WalkingRobot";
import { PRODUCT } from "./config/brand";
import "./styles.css";

type Route = "powerbi" | "matrix" | "aging" | "risk" | "unapplied" | "ecl" | "email" | "export" | "sla" | "integrations" | "invoices" | "audit" | "recon" | "reminders" | "review" | "upload";

const navItems: { id: Route; label: string; icon: React.ReactNode }[] = [
  { id: "powerbi", label: "Command Center", icon: <Gauge size={18} /> },
  { id: "upload", label: "Upload & Reconcile", icon: <Upload size={18} /> },
  { id: "matrix", label: "Total Data Matrix", icon: <FileSpreadsheet size={18} /> },
  { id: "aging", label: "Aging Analysis", icon: <TableProperties size={18} /> },
  { id: "risk", label: "Risk Accounts", icon: <AlertTriangle size={18} /> },
  { id: "unapplied", label: "Unapplied Amounts", icon: <ReceiptText size={18} /> },
  { id: "ecl", label: "IFRS 9 ECL", icon: <ShieldCheck size={18} /> },
  { id: "email", label: "Email Center", icon: <Mail size={18} /> },
  { id: "export", label: "Export Center", icon: <FileSpreadsheet size={18} /> },
  { id: "sla", label: "SLA Lookup", icon: <Building2 size={18} /> },
  { id: "integrations", label: "Oracle / SAP Center", icon: <PlugZap size={18} /> },
  { id: "invoices", label: "Invoice & Proof Audit", icon: <ReceiptText size={18} /> },
  { id: "audit", label: "Payment Audit", icon: <ShieldCheck size={18} /> },
  { id: "recon", label: "Bank Reconciliation", icon: <RefreshCw size={18} /> },
  { id: "reminders", label: "Reminders", icon: <Bot size={18} /> },
  { id: "review", label: "Management Review", icon: <BarChart3 size={18} /> }
];

export default function App() {
  const [entered, setEntered] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [active, setActive] = useState<Route>("powerbi");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const model = useMemo(() => buildLocalFinanceModel(), []);
  const agingRows = useMemo(() => model.rows.map(toAgingReportRow), [model.rows]);
  const eclRows = useMemo(() => model.rows.map(toEclReportRow), [model.rows]);
  const matrixRows = useMemo(() => model.rows.map(toTotalMatrixRow), [model.rows]);
  const riskRows = useMemo(() => buildRiskAccountRows(model), [model]);
  const unappliedRows = useMemo(() => buildUnappliedRows(model), [model]);
  const filteredAging = useMemo(() => filterRows(agingRows, search), [agingRows, search]);
  const filteredEcl = useMemo(() => filterRows(eclRows, search), [eclRows, search]);
  const filteredMatrix = useMemo(() => filterRows(matrixRows, search), [matrixRows, search]);
  const filteredRisk = useMemo(() => filterRows(riskRows, search), [riskRows, search]);
  const filteredUnapplied = useMemo(() => filterRows(unappliedRows, search), [unappliedRows, search]);

  useEffect(() => {
    const handleExport = (event: Event) => {
      const detail = (event as CustomEvent<{ fileName: string; rowCount: number; sheetCount: number }>).detail;
      setNotice(`${detail.fileName} exported: ${detail.rowCount.toLocaleString()} rows across ${detail.sheetCount} sheets`);
      window.setTimeout(() => setNotice(""), 2600);
    };
    window.addEventListener("o2c-export-complete", handleExport);
    return () => window.removeEventListener("o2c-export-complete", handleExport);
  }, []);

  if (!entered) return <LoginScreen onEnter={() => setEntered(true)} />;

  return (
    <main className="saas-shell">
      <div className={`sidebar-backdrop${navOpen ? " visible" : ""}`} onClick={() => setNavOpen(false)} />
      <Sidebar open={navOpen} active={active} setActive={(route) => {
        setActive(route);
        setNavOpen(false);
        const label = navItems.find((item) => item.id === route)?.label ?? "Section";
        setNotice(`${label} opened`);
        window.setTimeout(() => setNotice(""), 1800);
      }} />
      <section className="app-main">
        {notice && <div className="option-popup">{notice}</div>}
        <Topbar active={active} search={search} setSearch={setSearch} rowCount={model.rows.length} onMenu={() => setNavOpen(true)} onExport={() => exportDailyPack(model)} onLogout={() => setEntered(false)} />
        {active === "powerbi" && <PowerBiDashboard model={model} />}
        {active === "upload" && <ExcelUploadCenter model={model} />}
        {active === "matrix" && <DataMatrix rows={filteredMatrix} allRows={matrixRows} />}
        {active === "aging" && <AgingAnalysis rows={filteredAging} allRows={agingRows} />}
        {active === "risk" && <RiskAccounts rows={filteredRisk} allRows={riskRows} />}
        {active === "unapplied" && <UnappliedAmounts rows={filteredUnapplied} allRows={unappliedRows} />}
        {active === "ecl" && <EclDashboard model={model} rows={filteredEcl} allRows={eclRows} />}
        {active === "email" && <EmailCenter model={model} />}
        {active === "export" && <ExportCenter model={model} agingRows={agingRows} eclRows={eclRows} />}
        {active === "sla" && <SlaLookup model={model} />}
        {active === "integrations" && <IntegrationCenter />}
        {active === "invoices" && <InvoiceProofAudit model={model} />}
        {active === "audit" && <PaymentAudit model={model} search={search} />}
        {active === "recon" && <BankReconciliationPage model={model} search={search} />}
        {active === "reminders" && <ReminderCenter model={model} search={search} />}
        {active === "review" && <ManagementReview model={model} />}
      </section>
    </main>
  );
}

function LoginScreen({ onEnter }: { onEnter: () => void }) {
  const [email, setEmail] = useState("finance.controller@o2c.local");
  const [password, setPassword] = useState("demo123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const canEnter = email.trim().includes("@") && password.trim().length >= 6;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEnter) {
      setError("Enter a valid work email and a password with at least 6 characters.");
      return;
    }
    setError("");
    onEnter();
  }

  return (
    <main className="login-screen">
      <section className="login-art">
        <WalkingRobot />
        <div className="login-art-copy">
          <p className="eyebrow">{PRODUCT.tagline}</p>
          <h1>See every receivable. Act before it ages.</h1>
          <div className="login-stats">
            <span><strong>7</strong>ECL buckets</span>
            <span><strong>100%</strong>180+ provision</span>
            <span><strong>XLSX</strong>Styled exports</span>
          </div>
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div className="brand-row"><span className="brand-dot"><Lock size={18} /></span> {PRODUCT.name}</div>
        <p className="eyebrow">{PRODUCT.workspace}</p>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to the {PRODUCT.tagline} hub.</p>
        <label className="login-field">Work email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="login-field">Password<span className="password-wrap"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action wide" type="submit"><KeyRound size={18} /> Enter intelligence hub</button>
        <div className="sso-row">
          <button type="button" className="sso-button" disabled>Google</button>
          <button type="button" className="sso-button" disabled>Microsoft</button>
        </div>
      </form>
    </main>
  );
}

function Sidebar({ open, active, setActive }: { open: boolean; active: Route; setActive: (route: Route) => void }) {
  const [cardTop, setCardTop] = useState(0);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (window.matchMedia("(max-width: 1100px)").matches) return;
    const sidebar = event.currentTarget.closest(".sidebar") as HTMLElement | null;
    const currentTop = cardTop || Math.max(120, (sidebar?.clientHeight ?? 720) - 132);
    dragRef.current = { startY: event.clientY, startTop: currentTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const sidebar = event.currentTarget.closest(".sidebar") as HTMLElement | null;
    const maxTop = Math.max(120, (sidebar?.clientHeight ?? 720) - 128);
    const nextTop = Math.min(maxTop, Math.max(88, dragRef.current.startTop + event.clientY - dragRef.current.startY));
    setCardTop(nextTop);
  }

  function endDrag() {
    dragRef.current = null;
  }

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="sidebar-brand"><span>AS</span><strong>{PRODUCT.name}</strong></div>
      <nav>
        {navItems.map((item) => (
          <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="help-card" style={cardTop ? { top: cardTop, bottom: "auto" } : undefined} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag this Copilot workspace note">
        <span className="copilot-mark"><Bot size={15} /></span>
        <div>
          <strong>Operations workspace</strong>
          <span>Aging, ECL, SOA, proof audit, ERP.</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ active, search, setSearch, rowCount, onMenu, onExport, onLogout }: { active: Route; search: string; setSearch: (value: string) => void; rowCount: number; onMenu: () => void; onExport: () => void; onLogout: () => void }) {
  return (
    <header className="topbar">
      <div>
        <button type="button" className="nav-toggle" aria-label="Open navigation" onClick={onMenu}><Menu size={18} /></button>
        <p className="breadcrumb">{PRODUCT.tagline} / {navItems.find((item) => item.id === active)?.label}</p>
        <h1>{navItems.find((item) => item.id === active)?.label}</h1>
      </div>
      <div className="topbar-actions">
        <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, invoice, account..." /></label>
        {search && <button className="ghost-button" onClick={() => setSearch("")}>Clear</button>}
        <button className="smart-button" onClick={onExport}><Download size={17} /> Export pack</button>
        <div className="status-pill">Offline local data</div>
        <div className="status-pill">{rowCount.toLocaleString()} rows</div>
        <div className="user-pill"><UserRound size={16} /> Analyst</div>
        <button className="ghost-button" onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}

function PowerBiDashboard({ model }: { model: ReturnType<typeof buildLocalFinanceModel> }) {
  const totalAr = model.rows.reduce((total, row) => total + row.amount, 0);
  const outstanding = model.rows.reduce((total, row) => total + row.outstandingAmount, 0);
  const provision = model.rows.reduce((total, row) => total + row.provisionAmount, 0);
  const matched = model.reconciliation.filter((row) => row.matchStatus === "Matched").length;
  const avgDso = model.ifrs.length > 0 ? Math.round(model.ifrs.reduce((s, r) => s + r.buDso, 0) / model.ifrs.length) : 0;
  const collectionRate = totalAr > 0 ? Math.round(((totalAr - outstanding) / totalAr) * 100) : 0;
  const riskRows = model.ifrs.map(({ businessUnit, outstandingAr, over90, buDso, ceoControlIndex }) => ({ businessUnit, outstandingAed: outstandingAr, over90Aed: over90, buDso, ceoControlIndex }));

  /* build heatmap data: top 10 customers × aging buckets */
  const heatmapData = buildCustomerHeatmap(model);

  /* collection trend sparkline data (simulated 7-day trend) */
  const collectionSparkline = [68, 72, 70, 75, 73, 78, collectionRate];
  const matchSparkline = [62, 65, 70, 68, 72, 74, Math.round((matched / model.reconciliation.length) * 100)];

  return (
    <>
      <HeroPanel title="Receivables performance command center" copy="Monitor AED exposure, collection risk, IFRS 9 provision movement, bank matching, and customer account actions from one operating dashboard." />
      <section className="kpi-grid">
        <SparklineKpi label="Gross AR" value={money(totalAr)} tone="blue" trend="flat" sparkline={[totalAr * 0.9, totalAr * 0.92, totalAr * 0.95, totalAr * 0.97, totalAr * 0.98, totalAr * 0.99, totalAr]} />
        <SparklineKpi label="Outstanding" value={money(outstanding)} tone="cyan" trend="down" sparkline={[outstanding * 1.1, outstanding * 1.08, outstanding * 1.05, outstanding * 1.03, outstanding * 1.01, outstanding * 1.0, outstanding]} />
        <SparklineKpi label="ECL Provision" value={money(provision)} tone="violet" trend="down" sparkline={[provision * 1.15, provision * 1.1, provision * 1.07, provision * 1.04, provision * 1.02, provision * 1.0, provision]} />
        <SparklineKpi label="Bank Match" value={`${Math.round((matched / model.reconciliation.length) * 100)}%`} tone="green" trend="up" sparkline={matchSparkline} />
      </section>
      <section className="dashboard-grid">
        <ChartPanel title="Aging exposure by bucket" rows={model.aging.map((row) => ({ label: row.bucket, value: row.outstanding }))} />
        <ChartPanel title="IFRS 9 provision by bucket" rows={model.ecl.map((row) => ({ label: row.bucket, value: row.provisioned }))} />
        <DonutPanel title="Bank match control" rows={[
          { label: "Matched", value: model.reconciliation.filter((row) => row.matchStatus === "Matched").length },
          { label: "Suggested", value: model.reconciliation.filter((row) => row.matchStatus === "Suggested").length },
          { label: "Exception", value: model.reconciliation.filter((row) => row.matchStatus === "Exception").length }
        ]} />
        <GaugePanel title="Collection efficiency" value={collectionRate} max={100} unit="%" label="Target: 85%" />
      </section>
      <section className="dashboard-grid">
        <LineChartPanel title="Collection trend (7-day)" data={collectionSparkline.map((v, i) => ({ label: `Day ${i + 1}`, value: v }))} unit="%" />
        <StackedBarPanel title="Aging by business unit" model={model} />
      </section>
      <section className="dashboard-grid">
        <HeatmapPanel title="Customer risk heatmap (Top 10)" data={heatmapData} />
        <GenericTable title="Customer risk matrix" rows={riskRows} />
      </section>
    </>
  );
}

function DataMatrix({ rows, allRows }: { rows: Record<string, unknown>[]; allRows: Record<string, unknown>[] }) {
  return (
    <>
      <MiniMotionHeader title="Total data matrix" copy="A complete transaction matrix across customer account, invoice, GL, bank reference, aging, ECL, payment, provision, and audit fields." action={() => downloadWorkbook("O2C-Total-Data-Matrix.xlsx", { "Total Data Matrix": allRows })} />
      <GenericTable title="Total data matrix table" rows={rows.slice(0, 500)} />
    </>
  );
}

function AgingAnalysis({ rows, allRows }: { rows: Record<string, unknown>[]; allRows: Record<string, unknown>[] }) {
  return (
    <>
      <MiniMotionHeader title="Customer account aging analysis" copy="A transaction-level aging register with customer account, invoice, GL, bank reference, AED values, status, and collection comments." action={() => exportAgingReport(allRows)} />
      <GenericTable title="Standard aging report" rows={rows.slice(0, 350)} />
    </>
  );
}

function RiskAccounts({ rows, allRows }: { rows: Record<string, unknown>[]; allRows: Record<string, unknown>[] }) {
  return (
    <>
      <MiniMotionHeader title="Risk accounts flagging report" copy="Customer-level exposure flags based on overdue invoices, 180+ ECL exposure, provision amount, disputed status, and open balances." action={() => downloadWorkbook("O2C-Risk-Accounts-Flagging.xlsx", { "Risk Accounts": allRows })} />
      <GenericTable title="Risk account flags" rows={rows.slice(0, 350)} />
    </>
  );
}

function UnappliedAmounts({ rows, allRows }: { rows: Record<string, unknown>[]; allRows: Record<string, unknown>[] }) {
  return (
    <>
      <MiniMotionHeader title="Unapplied amount report" copy="Review invoice balances not applied, partial applications, and bank receipts that still need allocation or proof review." action={() => downloadWorkbook("O2C-Unapplied-Amounts.xlsx", { "Unapplied Amounts": allRows })} />
      <GenericTable title="Unapplied amount register" rows={rows.slice(0, 350)} />
    </>
  );
}

function EclDashboard({ model, rows, allRows }: { model: ReturnType<typeof buildLocalFinanceModel>; rows: Record<string, unknown>[]; allRows: Record<string, unknown>[] }) {
  return (
    <>
      <MiniMotionHeader title="IFRS 9 expected credit loss provision" copy="Provision logic is isolated from normal aging. The 91-120 bucket is retained for ECL assessment and every 180+ day exposure is fully provisioned." action={() => exportEclReport(allRows)} />
      <section className="dashboard-grid">
        <ChartPanel title="ECL bucket provision AED" rows={model.ecl.map((row) => ({ label: row.bucket, value: row.provisioned }))} />
        <GenericTable title="ECL provision summary" rows={model.ecl} />
      </section>
      <GenericTable title="IFRS 9 ECL policy matrix" rows={eclPolicyRows()} />
      <GenericTable title="IFRS 9 ECL detail report" rows={rows.slice(0, 350)} />
    </>
  );
}

function IntegrationCenter() {
  return (
    <section className="dashboard-grid">
      <HeroPanel title="ERP integration control center" copy="Track the operating handoff between this O2C workspace, Oracle Fusion Receivables, SAP S/4HANA Finance, bank statement imports, and outbound SOA/email packs." />
      <GenericTable title="Oracle Fusion AR handoff" rows={[
        { area: "Invoice Workbench", direction: "Import/Export", object: "AR invoice, customer account, GL date, receipt status", status: "Prototype mapping ready" },
        { area: "Receipts", direction: "Inbound", object: "Bank reference, payment amount AED, receipt advice", status: "Matched through reconciliation module" },
        { area: "Collections", direction: "Outbound", object: "SOA Excel, email draft, dispute comment", status: "Available in Email Center" }
      ]} />
      <GenericTable title="SAP S/4HANA Finance handoff" rows={[
        { area: "FI-AR Open Items", direction: "Import", object: "Customer account, document number, due date, amount AED", status: "Mapped to aging register" },
        { area: "Bank Accounting", direction: "Import", object: "Statement line, reference, amount, value date", status: "Mapped to bank reconciliation" },
        { area: "Provision Posting", direction: "Export", object: "IFRS 9 ECL bucket, provision AED, GL allowance account", status: "Mapped to ECL report" }
      ]} />
      <GenericTable title="Integration audit controls" rows={[
        { control: "No mixed aging/ECL logic", evidence: "Normal aging and IFRS 9 ECL reports are separate", owner: "Finance control" },
        { control: "Payment proof review", evidence: "Proof type, file name, reviewer, and audit note captured", owner: "Bank reconciliation" },
        { control: "SOA communication trace", evidence: "Customer email, subject, body, and attachment name captured", owner: "Collections" }
      ]} />
    </section>
  );
}

function EmailCenter({ model }: { model: ReturnType<typeof buildLocalFinanceModel> }) {
  const [customerNumber, setCustomerNumber] = useState(model.rows[0]?.customerNumber ?? "");
  const customerRows = model.rows.filter((row) => row.customerNumber === customerNumber);
  const initialDraft = customerRows.length ? draftSoaEmail(customerRows) : undefined;
  const [to, setTo] = useState(initialDraft?.to ?? "");
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [attachment, setAttachment] = useState(initialDraft?.attachmentName ?? "SOA.xlsx");

  function loadDraft() {
    const rows = model.rows.filter((row) => row.customerNumber === customerNumber);
    if (!rows.length) return;
    const draft = draftSoaEmail(rows);
    setTo(draft.to);
    setSubject(draft.subject);
    setBody(draft.body);
    setAttachment(draft.attachmentName);
  }

  return (
    <section className="form-grid">
      <div className="panel form-panel">
        <div className="panel-title"><h2>Customer SOA email</h2><span>{attachment}</span></div>
        <label>Customer account number<input value={customerNumber} onChange={(event) => setCustomerNumber(event.target.value)} onBlur={loadDraft} /></label>
        <label>Customer email<input value={to} onChange={(event) => setTo(event.target.value)} placeholder="customer@example.com" /></label>
        <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label>Attachment name<input value={attachment} onChange={(event) => setAttachment(event.target.value)} /></label>
        <label>Body<textarea value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <div className="button-row">
          <button className="smart-button" onClick={loadDraft}>Refresh draft</button>
          <button className="primary-action" onClick={() => openCustomerEmailDraft(to, subject, `${body}\n\nAttachment: ${attachment}`)}><Mail size={17} /> Open email</button>
        </div>
      </div>
      <GenericTable title="Customer invoices for email context" rows={customerRows.slice(0, 20).map(toAgingReportRow)} />
    </section>
  );
}

function ExportCenter({ model, agingRows, eclRows }: { model: ReturnType<typeof buildLocalFinanceModel>; agingRows: Record<string, unknown>[]; eclRows: Record<string, unknown>[] }) {
  const matrixRows = model.rows.map(toTotalMatrixRow);
  const riskRows = buildRiskAccountRows(model);
  const unappliedRows = buildUnappliedRows(model);
  const emailRows = buildEmailDraftRows(model);
  return (
    <section className="export-grid">
      <ExportCard title="Total Data Matrix" copy="All local O2C transaction fields in one structured workbook sheet." onClick={() => downloadWorkbook("O2C-Total-Data-Matrix.xlsx", { "Total Data Matrix": matrixRows })} />
      <ExportCard title="Risk Accounts Flagging" copy="Customer risk flags for overdue, disputed, provisioned, and high-exposure accounts." onClick={() => downloadWorkbook("O2C-Risk-Accounts-Flagging.xlsx", { "Risk Accounts": riskRows })} />
      <ExportCard title="Unapplied Amounts" copy="Invoice and receipt amounts that still need allocation or proof review." onClick={() => downloadWorkbook("O2C-Unapplied-Amounts.xlsx", { "Unapplied Amounts": unappliedRows })} />
      <ExportCard title="Standard Aging Report" copy="Structured AED columns with customer account, invoice, GL, payment, and aging details." onClick={() => exportAgingReport(agingRows)} />
      <ExportCard title="IFRS 9 ECL Report" copy="Seven ECL bands, 120-day bucket, and 180+ full provision logic." onClick={() => exportEclReport(eclRows)} />
      <ExportCard title="Customer Email Drafts" copy="SOA email recipients, subjects, bodies, and attachment names by customer account." onClick={() => downloadWorkbook("O2C-Customer-Email-Drafts.xlsx", { "Email Drafts": emailRows })} />
      <ExportCard title="Daily Finance Pack" copy="Aging, ECL, SLA, invoice queue, proof audit, and reconciliation." onClick={() => exportDailyPack(model)} />
      <GenericTable title="Workbook sheets" rows={[
        { sheet: "Total Data Matrix", purpose: "All O2C transaction fields", format: "Styled Excel" },
        { sheet: "Aging Analysis", purpose: "Customer account aging details", format: "Styled Excel" },
        { sheet: "Risk Accounts", purpose: "Customer risk flagging", format: "Styled Excel" },
        { sheet: "Unapplied Amounts", purpose: "Unapplied invoice and receipt balances", format: "Styled Excel" },
        { sheet: "IFRS 9 ECL", purpose: "ECL provision only", format: "Styled Excel" },
        { sheet: "Email Drafts", purpose: "SOA email details", format: "Styled Excel" },
        { sheet: "Payment Proof Audit", purpose: "Evidence tracking", format: "Styled Excel" }
      ]} />
    </section>
  );
}

function SlaLookup({ model }: { model: ReturnType<typeof buildLocalFinanceModel> }) {
  const [customerNumber, setCustomerNumber] = useState(model.slaProfiles[0]?.customerNumber ?? "");
  const profile = findSlaProfile(model.slaProfiles, customerNumber);
  const customerRows = model.rows.filter((row) => row.customerNumber === profile?.customerNumber).slice(0, 40);

  return (
    <section className="form-grid">
      <div className="panel form-panel">
        <div className="panel-title"><h2>SLA lookup</h2><span>{model.slaProfiles.length} accounts</span></div>
        <label>Customer account number<input value={customerNumber} onChange={(event) => setCustomerNumber(event.target.value)} placeholder="CUST-00004" /></label>
        <p className="muted">Examples: {model.slaProfiles.slice(0, 5).map((item) => item.customerNumber).join(", ")}</p>
      </div>
      {profile ? <GenericTable title="SLA and contract profile" rows={[profile]} /> : <div className="panel empty-state">No SLA found for this customer account.</div>}
      {profile && <GenericTable title="Customer account invoices" rows={customerRows.map(toAgingReportRow)} />}
    </section>
  );
}

function InvoiceProofAudit({ model }: { model: ReturnType<typeof buildLocalFinanceModel> }) {
  return (
    <section className="dashboard-grid">
      <GenericTable title="Dummy invoice PDF export/import queue" rows={model.invoiceDocuments.slice(0, 80)} />
      <GenericTable title="Payment proof audit logic" rows={model.paymentProofAudit.slice(0, 120)} />
    </section>
  );
}

function PaymentAudit({ model, search }: { model: ReturnType<typeof buildLocalFinanceModel>; search: string }) {
  const rows = filterRows(model.paymentProofAudit.map((row) => ({
    "Bank Reference": row.bankReference,
    "Invoice Number": row.invoiceNumber,
    "Customer Account Number": row.customerNumber,
    "Customer Name": row.customerName,
    "Payment Amount AED": row.paymentAmount,
    "Proof Type": row.proofType,
    "Proof File": row.proofFileName,
    "Audit Status": row.auditStatus,
    "Reviewed By": row.reviewedBy,
    "Reviewed At": row.reviewedAt,
    "Audit Note": row.auditNote
  })), search);
  return (
    <>
      <MiniMotionHeader title="Payment proof audit" copy="Review proof files, bank references, invoice numbers, reviewer actions, and audit status for matched and exception receipts." action={() => downloadWorkbook("O2C-Payment-Proof-Audit.xlsx", { "Payment Proof Audit": rows })} />
      <GenericTable title="Payment proof audit register" rows={rows.slice(0, 350)} />
    </>
  );
}

function BankReconciliationPage({ model, search }: { model: ReturnType<typeof buildLocalFinanceModel>; search: string }) {
  const rows = filterRows(model.reconciliation.map((row) => ({
    "Bank Reference": row.bankReference,
    "Invoice Number": row.invoiceNumber,
    "Customer Account Number": row.customerNumber,
    "Customer Name": row.customerName,
    "Amount AED": row.amount,
    "Match Status": row.matchStatus,
    "Match Confidence": row.matchConfidence,
    "Exception Reason": row.exceptionReason ?? ""
  })), search);
  const matched = rows.filter((row) => row["Match Status"] === "Matched").length;
  return (
    <>
      <section className="kpi-grid page-kpis">
        <Kpi label="Reconciliation Lines" value={String(rows.length)} tone="blue" />
        <Kpi label="Matched Lines" value={String(matched)} tone="green" />
        <Kpi label="Exceptions" value={String(rows.filter((row) => row["Match Status"] === "Exception").length)} tone="violet" />
        <Kpi label="Suggested Matches" value={String(rows.filter((row) => row["Match Status"] === "Suggested").length)} tone="cyan" />
      </section>
      <GenericTable title="Daily bank reconciliation" rows={rows.slice(0, 350)} />
    </>
  );
}

function ReminderCenter({ model, search }: { model: ReturnType<typeof buildLocalFinanceModel>; search: string }) {
  const rows = filterRows(model.reminders.map((row) => ({
    "Customer Account Number": row.customerNumber,
    "Customer Name": row.customerName,
    "Reminder Type": row.type,
    "Due Date": row.dueDate,
    "Days Remaining": row.daysRemaining,
    Action: row.action
  })), search);
  return (
    <>
      <MiniMotionHeader title="Document and cheque reminders" copy="Track security cheque renewals, trade license expiries, and document resubmission actions for customer accounts." action={() => downloadWorkbook("O2C-Reminder-Report.xlsx", { Reminders: rows })} />
      <GenericTable title="Reminder action register" rows={rows.slice(0, 350)} />
    </>
  );
}

function ManagementReview({ model }: { model: ReturnType<typeof buildLocalFinanceModel> }) {
  return (
    <section className="dashboard-grid">
      <GenericTable title="Management review by business unit" rows={model.ifrs.map(({ businessUnit, outstandingAr, over90, buDso, ceoControlIndex, disclosureCue }) => ({
        "Business Unit": businessUnit,
        "Outstanding AED": outstandingAr,
        "Over 90 AED": over90,
        "DSO": buDso,
        "Control Index": ceoControlIndex,
        "Review Note": disclosureCue
      }))} />
      <GenericTable title="Open operational exceptions" rows={[
        { area: "Bank reconciliation", count: model.reconciliation.filter((row) => row.matchStatus === "Exception").length, action: "Review unmatched bank references and request remittance proof." },
        { area: "Payment proof audit", count: model.paymentProofAudit.filter((row) => row.auditStatus !== "Matched").length, action: "Validate proof file and reviewer note." },
        { area: "Document reminders", count: model.reminders.length, action: "Follow up security cheque and trade license renewals." },
        { area: "IFRS 9 ECL", count: model.rows.filter((row) => row.eclBucket === "180+").length, action: "Confirm full provision and management commentary." }
      ]} />
    </section>
  );
}

function HeroPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="hero-panel">
      <div>
        <p className="eyebrow">Morning brief</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <WalkingRobot compact />
    </section>
  );
}

function MiniMotionHeader({ title, copy, action }: { title: string; copy: string; action: () => void }) {
  return (
    <section className="mini-motion-header">
      <div><p className="eyebrow">{PRODUCT.tagline}</p><h2>{title}</h2><p>{copy}</p></div>
      <WalkingRobot compact />
      <button className="primary-action" onClick={action}><Download size={17} /> Export Excel</button>
    </section>
  );
}

function MotionScene({ compact }: { compact: boolean }) {
  return (
    <div className={compact ? "motion-scene compact" : "motion-scene"} aria-hidden="true">
      <div className="motion-grid"></div>
      <div className="motion-ring ring-a"></div>
      <div className="motion-ring ring-b"></div>
      <div className="scene-core"><div className="cube"><span></span><span></span><span></span><span></span><span></span><span></span></div><div className="core-glow"></div></div>
      <div className="floating-chip chip-a">AED</div>
      <div className="floating-chip chip-b">ECL</div>
      <div className="floating-chip chip-c">SOA</div>
    </div>
  );
}

function ChartPanel({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section className="panel chart-panel">
      <div className="panel-title"><h2>{title}</h2><span>AED</span></div>
      <div className="bars">{rows.map((row) => <div className="bar-row" key={row.label}><span>{row.label}</span><i style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} /><strong>{shortMoney(row.value)}</strong></div>)}</div>
    </section>
  );
}

function DonutPanel({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const matched = rows[0]?.value ?? 0;
  return (
    <section className="panel donut-panel">
      <div className="panel-title"><h2>{title}</h2><span>{Math.round((matched / total) * 100)}% matched</span></div>
      <div className="donut-layout">
        <div className="donut" style={{ "--matched": `${Math.round((matched / total) * 360)}deg` } as React.CSSProperties}>
          <strong>{Math.round((matched / total) * 100)}%</strong>
          <span>matched</span>
        </div>
        <div className="donut-legend">
          {rows.map((row) => <div className="status-line" key={row.label}><CheckCircle2 size={17} /><span>{row.label}</span><strong>{row.value}</strong></div>)}
        </div>
      </div>
    </section>
  );
}

function GenericTable({ title, rows }: { title: string; rows: object[] }) {
  const columns = Object.keys(rows[0] ?? {});
  return (
    <section className="panel table-panel">
      <div className="panel-title"><h2>{title}</h2><span>{rows.length} rows</span></div>
      {!rows.length && <div className="empty-table">No rows match the current search or filter. Clear search to return to the full local dataset.</div>}
      <div className="table-wrap">
        {!!rows.length && <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => {
            const cells = row as Record<string, unknown>;
            return <tr key={index}>{columns.map((column) => <td key={column}>{format(cells[column])}</td>)}</tr>;
          })}</tbody>
        </table>}
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <article className={`kpi-card ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function ExportCard({ title, copy, onClick }: { title: string; copy: string; onClick: () => void }) {
  return <article className="export-card"><FileSpreadsheet size={26} /><strong>{title}</strong><p>{copy}</p><button className="smart-button" onClick={onClick}><Download size={16} /> Download Excel</button></article>;
}

function exportAgingReport(rows: Record<string, unknown>[]) {
  downloadWorkbook("O2C-Standard-Aging-Report.xlsx", { "Aging Analysis": rows });
}

function exportEclReport(rows: Record<string, unknown>[]) {
  downloadWorkbook("O2C-IFRS9-ECL-Report.xlsx", { "IFRS 9 ECL": rows, "ECL Policy Matrix": eclPolicyRows() });
}

function exportDailyPack(model: ReturnType<typeof buildLocalFinanceModel>) {
  const agingRows = model.rows.map(toAgingReportRow);
  const eclRows = model.rows.map(toEclReportRow);
  const matrixRows = model.rows.map(toTotalMatrixRow);
  const riskRows = buildRiskAccountRows(model);
  const unappliedRows = buildUnappliedRows(model);
  const emailRows = buildEmailDraftRows(model);
  downloadWorkbook("O2C-Daily-Finance-Pack.xlsx", {
    "Total Data Matrix": matrixRows,
    "Aging Analysis": agingRows,
    "Risk Accounts": riskRows,
    "Unapplied Amounts": unappliedRows,
    "IFRS 9 ECL": eclRows,
    "ECL Policy Matrix": eclPolicyRows(),
    "Email Drafts": emailRows,
    "ECL Summary": model.ecl,
    "SLA Directory": model.slaProfiles.map(toRecord),
    "Invoice PDF Queue": model.invoiceDocuments.map(toRecord),
    "Payment Proof Audit": model.paymentProofAudit.map(toRecord),
    "Bank Reconciliation": model.reconciliation.map(toRecord),
    Reminders: model.reminders.map(toRecord),
    "Management Review": model.ifrs.map(toRecord)
  });
}

function openCustomerEmailDraft(to: string, subject: string, body: string) {
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function toAgingReportRow(row: ReturnType<typeof buildLocalFinanceModel>["rows"][number]) {
  return {
    "Customer Account Number": row.customerNumber,
    "Customer Name": row.customerName,
    "Transaction Description": row.transactionDescription,
    "Transaction Number": row.transactionNumber,
    "Invoice Number": row.invoiceNumber,
    "GL Date": row.glDate,
    "GL Account": row.glAccount,
    "Invoice Date": row.invoiceDate,
    "Due Date": row.dueDate,
    "Amount AED": row.amount,
    "Applied Amount AED": row.appliedAmount,
    "Paid Amount AED": row.paidAmount,
    "Outstanding AED": row.outstandingAmount,
    "Days Past Due": row.daysPastDue,
    "Aging Bucket": row.agingBucket,
    Comments: row.comments.at(-1)?.text ?? "",
    "Payment Date": row.paymentDate ?? "",
    "Payment Reference": row.paymentReference ?? "",
    "Bank Reference": row.bankReference,
    Status: row.status
  };
}

function toEclReportRow(row: ReturnType<typeof buildLocalFinanceModel>["rows"][number]) {
  return {
    "Customer Account Number": row.customerNumber,
    "Customer Name": row.customerName,
    "Customer Email": row.customerEmail,
    "Invoice Number": row.invoiceNumber,
    "Transaction Number": row.transactionNumber,
    "Transaction Description": row.transactionDescription,
    "Due Date": row.dueDate,
    "Outstanding AED": row.outstandingAmount,
    "Days Past Due": row.daysPastDue,
    "ECL Bucket": row.eclBucket,
    "Provision Rate": `${Math.round(row.provisionRate * 10000) / 100}%`,
    "Provision AED": row.provisionAmount,
    "IFRS Stage": row.daysPastDue > 90 ? "Stage 2" : "Stage 1",
    "IFRS 9 Note": row.daysPastDue > 180 ? "Above 180 days: 100% ECL provision" : "IFRS 9 provision matrix bucket"
  };
}

function eclPolicyRows() {
  return [
    { "ECL Bucket": "Current", "Days Past Due": "0 or not due", "Provision Rate": "0.25%", "IFRS Stage": "Stage 1", "Logic": "Low-risk current receivable" },
    { "ECL Bucket": "1-30", "Days Past Due": "1 to 30", "Provision Rate": "1.00%", "IFRS Stage": "Stage 1", "Logic": "Early overdue provision" },
    { "ECL Bucket": "31-60", "Days Past Due": "31 to 60", "Provision Rate": "2.50%", "IFRS Stage": "Stage 1", "Logic": "Increasing collection risk" },
    { "ECL Bucket": "61-90", "Days Past Due": "61 to 90", "Provision Rate": "5.00%", "IFRS Stage": "Stage 1", "Logic": "Late stage performing receivable" },
    { "ECL Bucket": "91-120", "Days Past Due": "91 to 120", "Provision Rate": "15.00%", "IFRS Stage": "Stage 2", "Logic": "Significant increase in credit risk" },
    { "ECL Bucket": "121-180", "Days Past Due": "121 to 180", "Provision Rate": "35.00%", "IFRS Stage": "Stage 2", "Logic": "High risk overdue exposure" },
    { "ECL Bucket": "180+", "Days Past Due": "Above 180", "Provision Rate": "100.00%", "IFRS Stage": "Stage 2", "Logic": "Full ECL provision required" }
  ];
}

function toTotalMatrixRow(row: ReturnType<typeof buildLocalFinanceModel>["rows"][number]) {
  return {
    "Customer Account Number": row.customerNumber,
    "Customer Name": row.customerName,
    "Customer Email": row.customerEmail,
    "Business Unit": row.businessUnit,
    Entity: row.entity,
    "Transaction Description": row.transactionDescription,
    "Transaction Number": row.transactionNumber,
    "Invoice Number": row.invoiceNumber,
    "Invoice Date": row.invoiceDate,
    "Due Date": row.dueDate,
    "GL Date": row.glDate,
    "GL Account": row.glAccount,
    "Bank Reference": row.bankReference,
    "Payment Date": row.paymentDate ?? "",
    "Payment Reference": row.paymentReference ?? "",
    Currency: row.currency,
    "Amount AED": row.amount,
    "Applied Amount AED": row.appliedAmount,
    "Paid Amount AED": row.paidAmount,
    "Outstanding AED": row.outstandingAmount,
    "Unapplied Amount AED": Math.max(0, row.amount - row.appliedAmount),
    "Received Amount AED": row.receivedAmount,
    "Days Past Due": row.daysPastDue,
    "Aging Bucket": row.agingBucket,
    "ECL Bucket": row.eclBucket,
    "Provision Rate": row.provisionRate,
    "Provision AED": row.provisionAmount,
    Status: row.status,
    "Cheque Expiry Date": row.chequeExpiryDate,
    "Trade License Expiry Date": row.tradeLicenseExpiryDate,
    "SLA Email Source": row.slaEmailSource,
    Comments: row.comments.at(-1)?.text ?? ""
  };
}

function buildRiskAccountRows(model: ReturnType<typeof buildLocalFinanceModel>) {
  const byCustomer = new Map<string, ReturnType<typeof buildLocalFinanceModel>["rows"]>();
  model.rows.forEach((row) => {
    const group = byCustomer.get(row.customerNumber) ?? [];
    group.push(row);
    byCustomer.set(row.customerNumber, group);
  });
  return [...byCustomer.entries()].map(([customerNumber, rows]) => {
    const outstanding = sumRows(rows, "outstandingAmount");
    const over90 = rows.filter((row) => row.daysPastDue > 90).reduce((total, row) => total + row.outstandingAmount, 0);
    const over180 = rows.filter((row) => row.daysPastDue > 180).reduce((total, row) => total + row.outstandingAmount, 0);
    const provision = sumRows(rows, "provisionAmount");
    const disputed = rows.filter((row) => row.status === "Disputed").length;
    const riskScore = (over180 > 0 ? 45 : 0) + (over90 > 1_000_000 ? 25 : 0) + (provision > 500_000 ? 20 : 0) + (disputed > 0 ? 10 : 0);
    return {
      "Customer Account Number": customerNumber,
      "Customer Name": rows[0]?.customerName ?? "",
      "Open Invoices": rows.filter((row) => row.outstandingAmount > 0).length,
      "Outstanding AED": Math.round(outstanding * 100) / 100,
      "Over 90 AED": Math.round(over90 * 100) / 100,
      "Over 180 AED": Math.round(over180 * 100) / 100,
      "Provision AED": Math.round(provision * 100) / 100,
      "Disputed Invoice Count": disputed,
      "Risk Score": riskScore,
      "Risk Flag": riskScore >= 70 ? "Critical" : riskScore >= 45 ? "High" : riskScore >= 20 ? "Watch" : "Normal",
      "Recommended Action": riskScore >= 70 ? "Escalate to credit committee and confirm ECL support." : riskScore >= 45 ? "Prioritize collector follow-up and proof review." : riskScore >= 20 ? "Monitor account and request updated payment status." : "Continue standard collection cycle."
    };
  }).sort((a, b) => Number(b["Risk Score"]) - Number(a["Risk Score"]));
}

function buildUnappliedRows(model: ReturnType<typeof buildLocalFinanceModel>) {
  const invoiceRows = model.rows
    .filter((row) => row.amount - row.appliedAmount > 0)
    .map((row) => ({
      Source: "Invoice",
      "Customer Account Number": row.customerNumber,
      "Customer Name": row.customerName,
      "Invoice Number": row.invoiceNumber,
      "Bank Reference": row.bankReference,
      "Transaction Number": row.transactionNumber,
      "Amount AED": row.amount,
      "Applied Amount AED": row.appliedAmount,
      "Unapplied Amount AED": Math.round(Math.max(0, row.amount - row.appliedAmount) * 100) / 100,
      "Days Past Due": row.daysPastDue,
      Status: row.status,
      "Required Action": row.appliedAmount > 0 ? "Review partial application and close residual balance." : "Apply receipt, collect payment, or confirm dispute."
    }));
  const receiptRows = model.reconciliation
    .filter((row) => row.matchStatus !== "Matched")
    .map((row) => ({
      Source: "Bank Receipt",
      "Customer Account Number": row.customerNumber,
      "Customer Name": row.customerName,
      "Invoice Number": row.invoiceNumber,
      "Bank Reference": row.bankReference,
      "Transaction Number": "",
      "Amount AED": row.amount,
      "Applied Amount AED": 0,
      "Unapplied Amount AED": row.amount,
      "Days Past Due": "",
      Status: row.matchStatus,
      "Required Action": row.exceptionReason ?? "Confirm invoice reference and apply receipt."
    }));
  return [...receiptRows, ...invoiceRows].sort((a, b) => Number(b["Unapplied Amount AED"]) - Number(a["Unapplied Amount AED"]));
}

function buildEmailDraftRows(model: ReturnType<typeof buildLocalFinanceModel>) {
  const byCustomer = new Map<string, ReturnType<typeof buildLocalFinanceModel>["rows"]>();
  model.rows.forEach((row) => {
    const rows = byCustomer.get(row.customerNumber) ?? [];
    rows.push(row);
    byCustomer.set(row.customerNumber, rows);
  });
  return [...byCustomer.values()].map((rows) => {
    const draft = draftSoaEmail(rows);
    return {
      "Customer Account Number": draft.customerNumber,
      "Customer Name": draft.customerName,
      "Customer Email": draft.to,
      Subject: draft.subject,
      "Attachment Name": draft.attachmentName,
      "Outstanding AED": Math.round(rows.reduce((total, row) => total + row.outstandingAmount, 0) * 100) / 100,
      "Open Invoice Count": rows.filter((row) => row.outstandingAmount > 0).length,
      "Email Body": draft.body
    };
  });
}

function sumRows(rows: ReturnType<typeof buildLocalFinanceModel>["rows"], field: "outstandingAmount" | "provisionAmount") {
  return rows.reduce((total, row) => total + row[field], 0);
}

function filterRows<T extends object>(rows: T[], search: string) {
  if (!search.trim()) return rows;
  const needle = search.toLowerCase();
  return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)));
}

function toRecord<T extends object>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row));
}

function money(value: number) {
  return `AED ${Math.round(value / 1_000_000).toLocaleString()}M`;
}

function shortMoney(value: number) {
  return `${Math.round(value / 1_000_000).toLocaleString()}M`;
}

function format(value: unknown) {
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(value ?? "");
}

/* ── Excel Upload Center ─────────────────────────────────────────── */

function ExcelUploadCenter({ model }: { model: ReturnType<typeof buildLocalFinanceModel> }) {
  const [uploads, setUploads] = useState<ParsedUpload[]>([]);
  const [reconResult, setReconResult] = useState<ReconciliationSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setProcessing(true);
    const newUploads: ParsedUpload[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) continue;
      const buffer = await file.arrayBuffer();
      try {
        newUploads.push(convertUpload(file.name, buffer));
      } catch { /* skip corrupt files */ }
    }
    setUploads((prev) => [...prev, ...newUploads]);
    setProcessing(false);
  }, []);

  const allBankStatements = uploads.flatMap((u) => u.sheets.flatMap((s) => s.bankStatements));
  const allInvoices = uploads.flatMap((u) => u.sheets.flatMap((s) => s.invoices));
  const totalErrors = uploads.reduce((s, u) => s + u.sheets.reduce((ss, sh) => ss + sh.errors.length, 0), 0);

  function runReconciliation() {
    /* merge uploaded invoices with existing model invoices for matching */
    const existingInvoices = model.rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      customerName: r.customerName,
      customerNumber: r.customerNumber,
      amount: r.amount,
      outstandingAmount: r.outstandingAmount,
      bankReference: r.bankReference,
      invoiceDate: r.invoiceDate,
      dueDate: r.dueDate,
      currency: r.currency,
    }));
    const mergedInvoices = [...allInvoices, ...existingInvoices];
    const result = reconcileUpload(allBankStatements, mergedInvoices);
    setReconResult(result);
  }

  return (
    <>
      <MiniMotionHeader title="Upload bank statements & invoices" copy="Drag and drop .xlsx files containing bank statements or invoices. The engine auto-detects the file type and reconciles with multi-criteria matching." action={() => {
        if (reconResult) downloadWorkbook("O2C-Upload-Reconciliation.xlsx", { "Reconciliation Results": reconResult.results.map(toRecord) });
      }} />

      <section className="kpi-grid page-kpis">
        <Kpi label="Files Uploaded" value={String(uploads.length)} tone="blue" />
        <Kpi label="Bank Lines" value={String(allBankStatements.length)} tone="cyan" />
        <Kpi label="Invoices Parsed" value={String(allInvoices.length)} tone="violet" />
        <Kpi label="Parse Errors" value={String(totalErrors)} tone={totalErrors > 0 ? "violet" : "green"} />
      </section>

      <section className="upload-grid">
        <div className="panel">
          <div className="panel-title"><h2>Upload files</h2><span>.xlsx</span></div>
          <div className={`upload-zone${dragOver ? " drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <div className="upload-icon"><Upload size={24} /></div>
            <strong>{processing ? "Processing…" : "Drop .xlsx files here"}</strong>
            <p>Bank statements and invoice workbooks will be auto-detected</p>
            <span className="upload-hint">Supports multi-sheet workbooks</span>
            <input type="file" accept=".xlsx,.xls" multiple onChange={(e) => handleFiles(e.target.files)} />
          </div>

          {uploads.length > 0 && (
            <div className="file-list">
              {uploads.map((u, i) => (
                <div className="file-item" key={i}>
                  <FileSpreadsheet size={18} />
                  <strong>{u.fileName}</strong>
                  <span className="file-meta">
                    {u.sheets.map((s) => (
                      <span key={s.name} className={`type-badge ${s.type === "bankStatement" ? "bank" : s.type === "invoice" ? "invoice" : "unknown"}`}>
                        {s.name} ({s.rowCount} rows)
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {allBankStatements.length > 0 && (
            <div className="button-row" style={{ padding: "0 16px 16px" }}>
              <button className="primary-action" onClick={runReconciliation}>
                <RefreshCw size={17} /> Run reconciliation ({allBankStatements.length} bank lines vs {allInvoices.length + model.rows.length} invoices)
              </button>
            </div>
          )}
        </div>

        {/* Preview of parsed data */}
        {allBankStatements.length > 0 && (
          <GenericTable title={`Parsed bank statements (${allBankStatements.length} lines)`} rows={allBankStatements.slice(0, 100).map((r) => ({
            "Bank Ref": r.bankReference,
            "Customer": r.customerName,
            "Amount AED": r.amount,
            "Invoice": r.invoiceNumber ?? "",
            "Date": r.date,
            "Description": r.description,
          }))} />
        )}

        {allInvoices.length > 0 && (
          <GenericTable title={`Parsed invoices (${allInvoices.length} lines)`} rows={allInvoices.slice(0, 100).map((r) => ({
            "Invoice": r.invoiceNumber ?? "",
            "Customer": r.customerName ?? "",
            "Amount AED": r.amount ?? 0,
            "Outstanding AED": r.outstandingAmount ?? 0,
            "Due Date": r.dueDate ?? "",
            "Status": r.status ?? "",
          }))} />
        )}
      </section>

      {/* Reconciliation results */}
      {reconResult && (
        <>
          <section className="kpi-grid page-kpis">
            <Kpi label="Match Rate" value={`${reconResult.matchRate}%`} tone="green" />
            <Kpi label="Matched" value={String(reconResult.matched)} tone="green" />
            <Kpi label="Suggested" value={String(reconResult.suggested)} tone="cyan" />
            <Kpi label="Exceptions" value={String(reconResult.exception + reconResult.unmatched)} tone="violet" />
          </section>
          <section className="dashboard-grid">
            <DonutPanel title="Reconciliation breakdown" rows={[
              { label: "Matched", value: reconResult.matched },
              { label: "Suggested", value: reconResult.suggested },
              { label: "Exception", value: reconResult.exception },
              { label: "Unmatched", value: reconResult.unmatched },
            ]} />
            <section className="panel">
              <div className="panel-title"><h2>Reconciliation summary</h2></div>
              <div className="recon-summary">
                <div className="recon-stat"><span>Total bank lines</span><strong>{reconResult.totalBankLines}</strong></div>
                <div className="recon-stat"><span>Matched AED</span><strong>{Math.round(reconResult.totalMatchedAed).toLocaleString()}</strong></div>
                <div className="recon-stat"><span>Exception AED</span><strong>{Math.round(reconResult.totalExceptionAed).toLocaleString()}</strong></div>
                <div className="recon-stat"><span>Invoices pool</span><strong>{reconResult.totalInvoices}</strong></div>
              </div>
            </section>
          </section>
          <GenericTable title="Reconciliation detail" rows={reconResult.results.slice(0, 500).map((r) => ({
            "Bank Reference": r.bankReference,
            "Invoice Number": r.invoiceNumber,
            "Customer": r.customerName,
            "Amount AED": r.amount,
            "Match Status": r.matchStatus,
            "Confidence %": r.matchConfidence,
            "Exception Reason": r.exceptionReason ?? "",
          }))} />
        </>
      )}
    </>
  );
}

/* ── Enhanced chart components ───────────────────────────────────── */

function SparklineKpi({ label, value, tone, trend, sparkline }: { label: string; value: string; tone: string; trend: "up" | "down" | "flat"; sparkline: number[] }) {
  const max = Math.max(...sparkline, 1);
  return (
    <article className={`kpi-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <div className={`kpi-trend ${trend}`}>
        {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
        {trend === "up" ? "Improving" : trend === "down" ? "Decreasing" : "Stable"}
      </div>
      <div className="sparkline-row">
        {sparkline.map((v, i) => (
          <div key={i} className="spark-bar" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
        ))}
      </div>
    </article>
  );
}

function LineChartPanel({ title, data, unit }: { title: string; data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const w = 400;
  const h = 160;
  const padding = 20;
  const points = data.map((d, i) => ({
    x: padding + (i / Math.max(data.length - 1, 1)) * (w - 2 * padding),
    y: h - padding - ((d.value - min) / range) * (h - 2 * padding),
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? w} ${h - padding} L ${points[0]?.x ?? 0} ${h - padding} Z`;

  return (
    <section className="panel">
      <div className="panel-title"><h2>{title}</h2><span>{unit ?? ""}</span></div>
      <div className="line-chart">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0f8bff" />
              <stop offset="100%" stopColor="#20e3ff" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f8bff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0f8bff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="area-fill" d={areaPath} />
          <path className="line-path" d={linePath} />
          {points.map((p, i) => <circle key={i} className="dot" cx={p.x} cy={p.y} r={3.5} />)}
        </svg>
      </div>
      <div className="chart-legend">
        {data.map((d, i) => <span key={i} className="legend-item">{d.label}: {d.value}{unit ?? ""}</span>)}
      </div>
    </section>
  );
}

function StackedBarPanel({ title, model }: { title: string; model: ReturnType<typeof buildLocalFinanceModel> }) {
  const buckets = ["Current", "1-30", "31-60", "61-90", "91-180", "181-360", "361+"] as const;
  const buMap = new Map<string, Record<string, number>>();
  model.rows.forEach((row) => {
    const entry = buMap.get(row.businessUnit) ?? Object.fromEntries(buckets.map((b) => [b, 0]));
    entry[row.agingBucket] = (entry[row.agingBucket] ?? 0) + row.outstandingAmount;
    buMap.set(row.businessUnit, entry);
  });
  const buRows = [...buMap.entries()].slice(0, 8);
  const maxTotal = Math.max(...buRows.map(([, v]) => Object.values(v).reduce((s, n) => s + n, 0)), 1);

  const colors = ["#0f8bff", "#20e3ff", "#a78bfa", "#f59e0b", "#ef4444", "#10b981", "#fb7185"];

  return (
    <section className="panel">
      <div className="panel-title"><h2>{title}</h2><span>AED</span></div>
      <div className="stacked-bars">
        {buRows.map(([bu, vals]) => {
          const total = Object.values(vals).reduce((s, n) => s + n, 0);
          return (
            <div className="stacked-bar-row" key={bu}>
              <span className="bar-label">{bu}</span>
              <div className="stacked-bar-track">
                {buckets.map((b, i) => (
                  <div key={b} className="segment" style={{ width: `${(vals[b] / maxTotal) * 100}%`, background: colors[i] }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="chart-legend">
        {buckets.map((b, i) => (
          <span key={b} className="legend-item"><span className="legend-dot" style={{ background: colors[i] }} />{b}</span>
        ))}
      </div>
    </section>
  );
}

function GaugePanel({ title, value, max, unit, label }: { title: string; value: number; max: number; unit: string; label: string }) {
  const pct = Math.min(value / max, 1);
  const r = 70;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - pct);
  const color = pct >= 0.85 ? "#10b981" : pct >= 0.6 ? "#f59e0b" : "#ef4444";

  return (
    <section className="panel">
      <div className="panel-title"><h2>{title}</h2><span>{label}</span></div>
      <div className="gauge-chart">
        <svg className="gauge-svg" viewBox="0 0 180 100">
          <path className="gauge-track" d={`M 20 90 A ${r} ${r} 0 0 1 160 90`} />
          <path className="gauge-fill" d={`M 20 90 A ${r} ${r} 0 0 1 160 90`}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="gauge-label">
          <strong>{value}{unit}</strong>
          <span>{label}</span>
        </div>
      </div>
    </section>
  );
}

function HeatmapPanel({ title, data }: { title: string; data: { customer: string; buckets: Record<string, number> }[] }) {
  const allBuckets = data.length > 0 ? Object.keys(data[0].buckets) : [];
  const allValues = data.flatMap((d) => Object.values(d.buckets));
  const maxVal = Math.max(...allValues, 1);

  function heatClass(value: number): string {
    const ratio = value / maxVal;
    if (ratio <= 0) return "";
    if (ratio < 0.1) return "heat-0";
    if (ratio < 0.25) return "heat-1";
    if (ratio < 0.45) return "heat-2";
    if (ratio < 0.65) return "heat-3";
    if (ratio < 0.85) return "heat-4";
    return "heat-5";
  }

  return (
    <section className="panel table-panel heatmap-table">
      <div className="panel-title"><h2>{title}</h2><span>{data.length} accounts</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer</th>{allBuckets.map((b) => <th key={b}>{b}</th>)}</tr></thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.customer}>
                <td>{row.customer}</td>
                {allBuckets.map((b) => (
                  <td key={b} className={`heat-cell ${heatClass(row.buckets[b] ?? 0)}`}>
                    {row.buckets[b] ? shortMoney(row.buckets[b]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildCustomerHeatmap(model: ReturnType<typeof buildLocalFinanceModel>) {
  const buckets = ["Current", "1-30", "31-60", "61-90", "91-180", "181-360", "361+"];
  const byCustomer = new Map<string, Record<string, number>>();
  model.rows.forEach((row) => {
    const entry = byCustomer.get(row.customerName) ?? Object.fromEntries(buckets.map((b) => [b, 0]));
    entry[row.agingBucket] = (entry[row.agingBucket] ?? 0) + row.outstandingAmount;
    byCustomer.set(row.customerName, entry);
  });
  return [...byCustomer.entries()]
    .map(([customer, b]) => ({ customer, buckets: b, total: Object.values(b).reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}
