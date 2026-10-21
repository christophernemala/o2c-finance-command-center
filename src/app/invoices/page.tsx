import RootPage from "../page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Receivables" };
export default function Invoices({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  return RootPage({ searchParams: searchParams.then(params => ({ ...params, view: "receivables" })) });
}
