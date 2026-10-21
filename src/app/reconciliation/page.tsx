import RootPage from "../page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Cash application" };
export default function Reconciliation({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  return RootPage({ searchParams: searchParams.then(params => ({ ...params, view: "reconciliation" })) });
}
