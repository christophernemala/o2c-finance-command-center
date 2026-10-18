/** Generates docs/SCHEMA.md from the migrations (embedded PostgreSQL). Run: npm run docs:schema */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export async function schemaMarkdown(): Promise<string> {
  const db = new PGlite();
  try {
    const dir = new URL("../postgres/migrations/", import.meta.url);
    const files = (await readdir(dir)).filter(name => name.endsWith(".sql")).sort();
    for (const file of files) await db.exec(await readFile(new URL(file, dir), "utf8"));
    const tables = (await db.query<{ name: string; rls: boolean; comment: string | null }>(`
      select c.relname as name, c.relrowsecurity as rls, obj_description(c.oid) as comment from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`)).rows;
    const columns = (await db.query<{ table: string; column: string; type: string; nullable: string }>(`
      select table_name as table, column_name as column, case when data_type='numeric' then 'numeric('||numeric_precision||','||numeric_scale||')' when data_type='USER-DEFINED' then udt_name else data_type end as type, is_nullable as nullable
      from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)).rows;
    const fks = (await db.query<{ table: string; target: string }>(`
      select distinct cl.relname as table, ref.relname as target from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_class ref on ref.oid=co.confrelid
      join pg_namespace n on n.oid=cl.relnamespace where co.contype='f' and n.nspname='public' order by 1,2`)).rows;
    const policies = (await db.query<{ table: string; name: string; cmd: string }>(`select tablename as table, policyname as name, cmd from pg_policies where schemaname='public' order by 1,2`)).rows;
    const routines = (await db.query<{ name: string; definer: boolean }>(`
      select distinct p.proname as name, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)).rows;
    const out: string[] = [
      "# Database schema", "",
      "Generated from `postgres/migrations` by `npm run docs:schema`. Do not edit by hand; `tests/schema-doc.test.ts` fails when this file is stale.", "",
      `Migrations: ${files.length} · public tables: ${tables.length} · tables with RLS: ${tables.filter(t => t.rls).length}`, "",
      "Writes go through the SECURITY DEFINER routines listed at the end. The `authenticated` role can only SELECT, except for inserting archived source CSVs into `source_files` under its RLS insert policy.", "",
    ];
    for (const table of tables) {
      out.push(`## ${table.name}`, "", `RLS: ${table.rls ? "enabled" : "**disabled**"} · policies: ${policies.filter(p => p.table === table.name).map(p => `${p.name} (${p.cmd})`).join(", ") || "none"}`);
      const refs = fks.filter(fk => fk.table === table.name).map(fk => fk.target);
      if (refs.length) out.push(`References: ${refs.join(", ")}`);
      out.push("", "| Column | Type | Null |", "|---|---|---|");
      for (const column of columns.filter(c => c.table === table.name)) out.push(`| ${column.column} | ${column.type} | ${column.nullable === "YES" ? "yes" : "no"} |`);
      out.push("");
    }
    out.push("## Routines callable by `authenticated`", "", "| Routine | Security |", "|---|---|", ...routines.map(r => `| ${r.name} | ${r.definer ? "definer" : "invoker"} |`), "");
    return out.join("\n");
  } finally { await db.close(); }
}
if (process.argv[1]?.endsWith("schema-doc.ts")) {
  await writeFile(new URL("../docs/SCHEMA.md", import.meta.url), await schemaMarkdown());
  console.log("Wrote docs/SCHEMA.md");
}
