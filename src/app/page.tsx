import { redirect } from "next/navigation";
import { access, entities, snapshot } from "@/lib/workspace";
import { supabaseConfig } from "@/lib/supabase/config";
import { workspaces, type Workspace } from "@/types/workspace";
import { FinanceWorkspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  if (!supabaseConfig()) redirect("/login");
  const auth = await access(); if (!auth) redirect("/login");
  const params = await searchParams; const tenant = auth.memberships.find(row => row.tenant_id === params.tenant) ?? auth.memberships[0];
  if (!tenant) return <main id="main" className="mx-auto max-w-xl p-12"><h1 className="text-2xl font-semibold">Workspace access pending</h1><p className="my-6 text-muted">Your account is authenticated, but no tenant membership has been assigned. Ask your administrator to grant access.</p><form action="/api/auth" method="post"><input type="hidden" name="intent" value="logout"/><button className="button secondary">Sign out</button></form></main>;
  const options = await entities(tenant.tenant_id); const entity = options.find(row => row.id === params.entity) ?? options[0];
  if (!entity) return <main id="main" className="mx-auto max-w-xl p-12"><h1 className="text-2xl font-semibold">Legal entity setup pending</h1><p className="my-6 text-muted">An administrator needs to provision a legal entity for {tenant.tenant_name} before operational records can be imported.</p><form action="/api/auth" method="post"><input type="hidden" name="intent" value="logout"/><button className="button secondary">Sign out</button></form></main>;
  const requested = Number(params.page ?? 0); const page = Number.isSafeInteger(requested) && requested>=0 && requested<=100000 ? requested : 0;
  const view = workspaces.includes(params.view as Workspace) ? params.view as Workspace : "overview";
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const data = await snapshot(tenant.tenant_id,entity.id,asOf,page);
  return <FinanceWorkspace key={`${tenant.tenant_id}/${entity.id}`} memberships={auth.memberships} entityOptions={options} data={data} view={view} userId={auth.user.id} email={auth.user.email ?? "Authenticated user"} message={typeof params.message === "string" ? params.message : undefined}/>;
}
