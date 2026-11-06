import Link from "next/link";
export const metadata = { title: "Page not found" };
export default function NotFound() {
  return <main id="main" className="mx-auto max-w-lg px-8 py-24">
    <p className="text-xs font-medium uppercase tracking-[.16em] text-muted">Error 404</p>
    <h1 className="mt-2 text-3xl font-semibold">This page does not exist</h1>
    <p className="my-6 leading-6 text-muted">The link may be outdated, or the record may belong to a workspace you cannot access.</p>
    <Link className="button" href="/">Return to your workspace</Link>
  </main>;
}
