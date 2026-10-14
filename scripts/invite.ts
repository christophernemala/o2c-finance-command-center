import { Client } from "pg";
import { z } from "zod";
import { postgresConfig } from "../src/lib/postgres/config";
import { authSiteOrigin } from "../src/lib/auth-flow";
import { newToken, tokenHash } from "../src/lib/auth/crypto";
const email = z.email().max(254).parse(process.argv[2]?.trim().toLowerCase());
const tenant = z.uuid().parse(process.argv[3]);
const role = z.enum(["viewer", "maker", "approver", "admin"]).parse(process.argv[4]);
const settings = postgresConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_MIGRATION_URL }); const origin = authSiteOrigin({ ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" });
if (!settings || !origin) throw new Error("Set DATABASE_MIGRATION_URL and AUTH_SITE_URL");
const client = new Client(settings); const token = newToken();
try {
  await client.connect(); await client.query("begin");
  const user = (await client.query(`insert into auth.users(email,invited_at) values($1,now())
    on conflict(email) do update set invited_at=now() returning id`, [email])).rows[0];
  await client.query(`insert into public.memberships(tenant_id,user_id,role) values($1,$2,$3)
    on conflict(tenant_id,user_id) do update set role=excluded.role`, [tenant, user.id, role]);
  await client.query("delete from auth.invitations where user_id=$1", [user.id]);
  await client.query("insert into auth.invitations(token_hash,user_id,expires_at) values($1,$2,now()+interval '24 hours')", [tokenHash(token), user.id]);
  await client.query("commit");
  const url = new URL("/auth/confirm", origin); url.searchParams.set("type", "invite"); url.searchParams.set("token", token);
  // Explicit operator output only; no email delivery or automatic account provisioning.
  process.stdout.write(`Private invitation (expires in 24 hours):\n${url.href}\n`);
} catch { await client.query("rollback"); throw new Error("Invitation failed; no changes committed"); }
finally { await client.end(); }
