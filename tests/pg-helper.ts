import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
/** Embedded PostgreSQL with every migration applied in filename order, as `npm run db:migrate` does. */
export async function migratedDatabase() {
  const db = new PGlite();
  const dir = new URL("../postgres/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(name => name.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, dir), "utf8"));
  return db;
}
