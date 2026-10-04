import RootPage from "../page";
export const dynamic = "force-dynamic";
export default function Dashboard({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  return RootPage({ searchParams: searchParams.then(params => ({ ...params, view: "overview" })) });
}
