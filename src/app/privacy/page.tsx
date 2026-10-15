import Link from "next/link";
export const metadata = { title: "Privacy" };
// DRAFT: structure and facts about how the software processes data. Legal wording must be
// supplied or approved by the operator's counsel before this page is relied on.
const sections: { heading: string; body: string[] }[] = [
  { heading: "Who operates this service", body: ["The organisation that invited you operates this workspace and decides how its data is used. Contact your administrator for privacy requests."] },
  { heading: "Data the application stores", body: [
    "Account data: work email, password hash, authenticator enrolment and session records.",
    "Finance records your organisation imports: customers, invoices, bank statement lines, receipts, allocations, approvals and audit events.",
    "Customer contact details entered by your team for collections, once that feature is enabled.",
    "Copilot conversations and files you attach to them, visible only to you.",
    "AI agent run records: steps, tool calls, findings and model cost.",
  ] },
  { heading: "Service providers that process data", body: [
    "PostgreSQL database host chosen by the operator, which stores all records.",
    "Vercel, which hosts the application.",
    "Upstash Redis, for sign-in and request rate limiting (stores hashed identifiers, not finance records).",
    "Anthropic (Claude API), when AI agents or the copilot are used: the questions and the scoped records needed to answer them are sent for processing.",
  ] },
  { heading: "What the application does not do", body: [
    "It does not sell data, show advertising or use tracking cookies. The only cookie is the HttpOnly session cookie needed to keep you signed in.",
    "It does not store finance records in your browser.",
  ] },
  { heading: "Retention and your rights", body: ["Retention periods, data location and how to exercise access, correction or deletion rights are set by the operator. Ask your administrator."] },
];
export default function Privacy() {
  return <main id="main" className="mx-auto max-w-2xl px-6 py-16">
    <p role="note" className="mb-8 rounded-lg bg-warning-soft p-4 text-sm text-warning">Draft pending legal review. This page describes how the software handles data; it is not yet the operator&apos;s approved privacy policy.</p>
    <h1 className="text-3xl font-semibold">Privacy</h1>
    <div className="mt-8 space-y-8">{sections.map(section => <section key={section.heading}>
      <h2 className="text-lg font-semibold">{section.heading}</h2>
      <ul className="mt-3 list-disc space-y-2 ps-5 leading-6 text-muted">{section.body.map(line => <li key={line}>{line}</li>)}</ul>
    </section>)}</div>
    <p className="mt-12"><Link className="font-semibold text-link underline underline-offset-4" href="/login">Back to sign in</Link></p>
  </main>;
}
