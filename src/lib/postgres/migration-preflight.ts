/** Diagnostics for pending migrations, without changing immutable SQL history. */
export function migrationPreflightSql(name: string): string | null {
  if (name !== "202610160005_collections_hardening.sql") return null;
  return `-- Pre-flight: name the customers to clean up instead of failing inside the index build.
do $$
declare dupes text;
begin
  select string_agg(customer_id::text||' ('||n||')',', ') into dupes from (select customer_id,count(*) as n from public.collection_messages
    where status in ('pending','approved','sending') group by customer_id having count(*)>1) d;
  if dupes is not null then
    raise exception 'Cannot enforce one open collections message per customer. Reject or let all but one open message finish for: %', dupes;
  end if;
end $$;
`;
}
