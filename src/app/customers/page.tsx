import RootPage from "../page";
export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };
export default function Customers({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  return RootPage({ searchParams: searchParams.then(params => ({ ...params, view: "customers" })) });
}
