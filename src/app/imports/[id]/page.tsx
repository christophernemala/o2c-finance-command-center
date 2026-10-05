import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { access } from "@/lib/workspace";
import { Panel, Money, Badge } from "@/components/ui";
import { MutationForm } from "@/components/mutation-form";
export const dynamic = "force-dynamic";
export default async function Review({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{tenant?:string;entity?:string}> }) {
  const auth = await access(); if (!auth) redirect("/login"); const {id} = await params; const scope = await searchParams;
  const membership = auth.memberships.find(row => row.tenant_id === scope.tenant); if (!membership || !scope.entity) notFound();
  const result = await auth.client.from("import_batches").select("id,kind,file_name,digest,payload,rows,status,maker").eq("id",id).eq("tenant_id",scope.tenant!).eq("entity_id",scope.entity).single();
  if (result.error || !result.data) notFound();
  const batch = result.data;
  // PostgREST represents numeric columns as Number. Derive presentation total from exact preserved strings instead.
  const { addAmounts } = await import("@/lib/money"); const records = batch.payload as Record<string,string>[];
  const total = addAmounts(records.map(row => row.amount));
  return <main id="main" className="mx-auto max-w-5xl space-y-6 px-6 py-10"><Link className="text-link" href={`/?${new URLSearchParams({tenant:scope.tenant!,entity:scope.entity,view:"imports"})}`}>← Return to import review</Link><h1 className="text-3xl font-semibold">Review preserved import</h1><Panel title={batch.file_name} subtitle={`${membership.tenant_name} · entity ${scope.entity} · AED`}><div className="space-y-4 p-6"><Badge value={batch.status}/><p>{records.length} records · control total <Money value={total}/></p><p className="break-all text-xs text-muted">Maker {batch.maker}<br/>{batch.digest}</p><p className="text-sm leading-6 text-muted">The following preserved rows are the exact data committed by this action. A reference or customer conflict rejects the entire transaction. Invoice imports represent unpaid source-system receivables and do not post revenue journals.</p><div className="max-h-96 overflow-auto"><table><caption className="sr-only">All preserved rows in this import batch</caption><thead><tr>{Object.keys(records[0] ?? {}).map(key => <th scope="col" key={key}>{key}</th>)}</tr></thead><tbody>{records.map((row,index) => <tr key={index}>{Object.entries(row).map(([key,value]) => <td key={key}>{value}</td>)}</tr>)}</tbody></table></div>
    {batch.status === "review" && ["approver","admin"].includes(membership.role) && batch.maker !== auth.user.id ? <MutationForm><input type="hidden" name="tenant" value={scope.tenant}/><input type="hidden" name="entity" value={scope.entity}/><input type="hidden" name="view" value="imports"/><input type="hidden" name="id" value={id}/><input type="hidden" name="intent" value="commit"/><label className="flex items-start gap-3 text-sm font-normal"><input type="checkbox" required name="acknowledge" value="yes"/><span>I reviewed every row, the source-system scope, AED control total, and the preserved payload digest.</span></label><button className="button">Commit reviewed batch</button></MutationForm> : <p className="text-sm text-muted">{batch.status === "committed" ? "This batch has been committed. Repeated requests do not import it again." : "A different authorized checker must review and commit this batch."}</p>}</div></Panel></main>;
}
