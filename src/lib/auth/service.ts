import { consumeEmailCode } from "./email-code";
import { randomUUID } from "node:crypto";
import { transaction, type SqlPool, type SqlConnection } from "../postgres/transaction";
import { decryptSecret, encryptSecret, generateFactor, hashPassword, newToken, tokenHash, validToken, verifiedCounter, verifyPassword } from "./crypto";
export interface Identity extends Record<string, unknown> {
  id: string; email: string; email_confirmed_at: string | null; invited_at: string | null;
  purpose: "login" | "invitation"; aal: "aal1" | "aal2"; has_mfa: boolean;
}
interface Factor extends Record<string, unknown> { id: string; user_id: string; status: "verified" | "unverified"; secret_ciphertext: string; last_counter: string }
export interface SessionCookies { read(): string | undefined; write(token: string, maxAge: number): void; clear(): void }
const unavailable = () => new Error("Authentication unavailable");
const identitySql = `select u.id,u.email,u.email_confirmed_at::text,u.invited_at::text,s.purpose,s.aal,
  exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified') as has_mfa
  from auth.sessions s join auth.users u on u.id=s.user_id
  where s.token_hash=$1 and s.expires_at>now() and not u.disabled
  and (s.purpose='invitation' or u.email_confirmed_at is not null)`;
async function identity(connection: SqlConnection, token: string | undefined): Promise<Identity | null> {
  if (!validToken(token)) return null;
  return (await connection.query<Identity>(identitySql, [tokenHash(token)])).rows[0] ?? null;
}
async function insertSession(connection: SqlConnection, userId: string, purpose: "login" | "invitation", aal: "aal1" | "aal2", seconds: number) {
  const token = newToken();
  await connection.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,$3,$4,now()+$5*interval '1 second')", [tokenHash(token), userId, purpose, aal, seconds]);
  return token;
}
export function authService(pool: SqlPool, cookies: SessionCookies, key: Buffer) {
  async function current() {
    if (!validToken(cookies.read())) return null;
    return transaction(pool, connection => identity(connection, cookies.read()));
  }
  return {
    async getUser() {
      try { return { data: { user: await current() }, error: null }; }
      catch { return { data: { user: null }, error: unavailable() }; }
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const account = await transaction(pool, async connection => (await connection.query<{ id: string; password_hash: string | null; disabled: boolean; confirmed: boolean }>(
          "select id,password_hash,disabled,email_confirmed_at is not null as confirmed from auth.users where email=$1", [email.trim().toLowerCase()])).rows[0]);
        const valid = await verifyPassword(password, account?.password_hash ?? null);
        if (!valid || !account || account.disabled || !account.confirmed) return { error: new Error("Invalid credentials") };
        const replacement = account.password_hash?.startsWith("$2") && password.length >= 12 ? await hashPassword(password) : null;
        const result = await transaction(pool, async connection => {
          const locked = (await connection.query<{ password_hash: string | null; disabled: boolean; confirmed: boolean }>(
            "select password_hash,disabled,email_confirmed_at is not null as confirmed from auth.users where id=$1 for update", [account.id])).rows[0];
          if (!locked || locked.disabled || !locked.confirmed || locked.password_hash !== account.password_hash) throw unavailable();
          if (replacement) await connection.query("update auth.users set password_hash=$2 where id=$1", [account.id, replacement]);
          const factors = await connection.query("select id from auth.mfa_factors where user_id=$1 and status='verified'", [account.id]);
          const seconds = factors.rows.length ? 600 : 43200;
          const previous = cookies.read(); if (validToken(previous)) await connection.query("delete from auth.sessions where token_hash=$1", [tokenHash(previous)]);
          return { token: await insertSession(connection, account.id, "login", "aal1", seconds), seconds };
        });
        cookies.write(result.token, result.seconds); return { error: null };
      } catch { return { error: unavailable() }; }
    },
    async signInWithEmailCode(binding:string,code:string,secret:string) {
      try {
        const result=await transaction(pool,async connection=>{
          if(!validToken(binding))return null;
          const challenge=(await connection.query<{user_id:string}>("select user_id from auth.email_login_codes where token_hash=$1",[tokenHash(binding)])).rows[0];
          if(!challenge)return null;
          // Match request's user-then-challenge lock order to avoid concurrent resend deadlocks.
          const user=(await connection.query<{disabled:boolean;confirmed:boolean}>("select disabled,email_confirmed_at is not null as confirmed from auth.users where id=$1 for update",[challenge.user_id])).rows[0];
          // Invalid guesses return normally so their attempt counters commit.
          const userId=await consumeEmailCode(connection,binding,code,secret);
          if(!userId)return null;
          if(!user||user.disabled||!user.confirmed)return null;
          const hasMfa=(await connection.query("select id from auth.mfa_factors where user_id=$1 and status='verified'",[userId])).rows.length>0;
          const previous=cookies.read();if(validToken(previous))await connection.query("delete from auth.sessions where token_hash=$1",[tokenHash(previous)]);
          const seconds=hasMfa?600:43200;
          return {token:await insertSession(connection,userId,"login","aal1",seconds),seconds};
        });
        if(!result)return {error:new Error("Invalid or expired code")};
        cookies.write(result.token,result.seconds);return {error:null};
      }catch{return {error:unavailable()};}
    },
    async signInWithExternal(external: {issuer:string;subject:string;email:string;provider:"google"|"microsoft"}, linkSessionHash:string|null) {
      try {
        const result=await transaction(pool,async connection=>{
          const linked=(await connection.query<{user_id:string}>("select user_id from auth.external_identities where issuer=$1 and subject=$2",[external.issuer,external.subject])).rows[0];
          const active=await identity(connection,cookies.read());
          let userId=linked?.user_id;
          if(linkSessionHash){
            if(!active || !validToken(cookies.read()) || tokenHash(cookies.read()!)!==linkSessionHash || (active.purpose==="login" && active.has_mfa && active.aal!=="aal2"))throw unavailable();
            if(userId && userId!==active.id)throw unavailable();
            if(active.email.toLowerCase()!==external.email.toLowerCase())throw unavailable();
            // Linking is authorized by an existing authenticated/invitation session, never an email claim alone.
            userId=active.id;
          }
          if(!userId)throw unavailable();
          const user=(await connection.query<{id:string;disabled:boolean;confirmed:boolean}>("select id,disabled,email_confirmed_at is not null as confirmed from auth.users where id=$1 for update",[userId])).rows[0];
          if(!user || user.disabled)throw unavailable();
          if(linkSessionHash){
            const live=await identity(connection,cookies.read());if(!live || live.id!==userId)throw unavailable();
            await connection.query("insert into auth.external_identities(issuer,subject,provider,user_id) values($1,$2,$3,$4) on conflict(issuer,subject) do nothing",[external.issuer,external.subject,external.provider,userId]);
            const owner=(await connection.query<{user_id:string}>("select user_id from auth.external_identities where issuer=$1 and subject=$2",[external.issuer,external.subject])).rows[0];
            if(owner?.user_id!==userId)throw unavailable();
            if(live.purpose==="invitation"){
              await connection.query("update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()) where id=$1",[userId]);
              await connection.query("delete from auth.invitations where user_id=$1",[userId]);
              await connection.query("delete from auth.sessions where user_id=$1",[userId]);
            }
          }else if(!user.confirmed)throw unavailable();
          const hasMfa=(await connection.query("select id from auth.mfa_factors where user_id=$1 and status='verified'",[userId])).rows.length>0;
          const previous=cookies.read();if(validToken(previous))await connection.query("delete from auth.sessions where token_hash=$1",[tokenHash(previous)]);
          const seconds=hasMfa?600:43200;
          return {token:await insertSession(connection,userId,"login","aal1",seconds),seconds};
        });
        cookies.write(result.token,result.seconds);return {error:null};
      }catch{return {error:unavailable()};}
    },
    async signOut(_options?: { scope?: "local" }) {
      try {
        const token = cookies.read();
        if (validToken(token)) await transaction(pool, async connection => { await connection.query("delete from auth.sessions where token_hash=$1", [tokenHash(token)]); });
        cookies.clear(); return { error: null };
      } catch { cookies.clear(); return { error: unavailable() }; }
    },
    async validateInvitation(token: string) {
      if (!validToken(token)) return { valid: false, error: null };
      try {
        const valid = await transaction(pool, async connection => {
          const invitation = await connection.query(`select i.user_id from auth.invitations i join auth.users u on u.id=i.user_id
            where i.token_hash=$1 and i.expires_at>now() and i.consumed_at is null and not u.disabled`, [tokenHash(token)]);
          return invitation.rows.length === 1;
        });
        return { valid, error: null };
      } catch { return { valid: false, error: unavailable() }; }
    },
    async acceptInvitation(token: string) {
      if (!validToken(token)) return { error: new Error("Invalid invitation") };
      try {
        const session = await transaction(pool, async connection => {
          const invite = (await connection.query<{ user_id: string }>(`select i.user_id from auth.invitations i join auth.users u on u.id=i.user_id
            where i.token_hash=$1 and i.expires_at>now() and i.consumed_at is null and not u.disabled for update of i`, [tokenHash(token)])).rows[0];
          if (!invite) throw unavailable();
          await connection.query("update auth.invitations set consumed_at=now() where token_hash=$1", [tokenHash(token)]);
          return insertSession(connection, invite.user_id, "invitation", "aal1", 600);
        });
        cookies.write(session, 600); return { error: null };
      } catch { return { error: unavailable() }; }
    },
    async updateUser({ password, registration }: { password: string; registration?: Record<string,unknown> }) {
      try {
        const hash = await hashPassword(password);
        await transaction(pool, async connection => {
          const user = await identity(connection, cookies.read());
          if (!user || user.purpose !== "invitation") throw unavailable();
          await connection.query("select id from auth.users where id=$1 for update", [user.id]);
          if (!(await identity(connection, cookies.read()))) throw unavailable();
          // Lock the invitation session so activation cannot be replayed concurrently.
          const locked = await connection.query("select token_hash from auth.sessions where token_hash=$1 and purpose='invitation' and expires_at>now() for update", [tokenHash(cookies.read()!)]);
          if (!locked.rows.length) throw unavailable();
          await connection.query("update auth.users set password_hash=$2,email_confirmed_at=coalesce(email_confirmed_at,now()) where id=$1", [user.id, hash]);
          if(registration)await connection.query("update auth.users set raw_user_meta_data=jsonb_set(raw_user_meta_data,'{registration}',$2::jsonb) where id=$1",[user.id,JSON.stringify(registration)]);
          await connection.query("delete from auth.sessions where user_id=$1", [user.id]);
          await connection.query("delete from auth.invitations where user_id=$1", [user.id]);
        });
        cookies.clear(); return { error: null };
      } catch { return { error: unavailable() }; }
    },
    mfa: {
      async pendingFactor() {
        try {
          const data = await transaction(pool, async connection => {
            const user = await identity(connection, cookies.read()); if (!user || user.purpose !== "login") throw unavailable();
            const factor = (await connection.query<Factor>("select * from auth.mfa_factors where user_id=$1 and status='unverified'", [user.id])).rows[0];
            return factor ? { id: factor.id, secret: decryptSecret(factor.secret_ciphertext, key, user.id) } : null;
          });
          return { data, error: null };
        } catch { return { data: null, error: unavailable() }; }
      },
      async getAuthenticatorAssuranceLevel() {
        try {
          const user = await current();
          return { data: user?.purpose === "login" ? { currentLevel: user.aal, nextLevel: user.has_mfa ? "aal2" as const : user.aal } : null, error: null };
        } catch { return { data: null, error: unavailable() }; }
      },
      async listFactors() {
        try {
          const factors = await transaction(pool, async connection => {
            const user = await identity(connection, cookies.read()); if (!user || user.purpose !== "login") throw unavailable();
            return (await connection.query<{ id: string; status: "verified" | "unverified" }>("select id,status from auth.mfa_factors where user_id=$1", [user.id])).rows;
          });
          return { data: { totp: factors }, error: null };
        } catch { return { data: { totp: [] }, error: unavailable() }; }
      },
      async enroll() {
        try {
          return await transaction(pool, async connection => {
            const user = await identity(connection, cookies.read()); if (!user || user.purpose !== "login" || user.has_mfa) throw unavailable();
            await connection.query("select id from auth.users where id=$1 for update", [user.id]);
            const existing = (await connection.query<Factor>("select * from auth.mfa_factors where user_id=$1", [user.id])).rows[0];
            if (existing?.status === "verified") throw unavailable();
            if (existing) {
              const secret = decryptSecret(existing.secret_ciphertext, key, user.id);
              return { data: { id: existing.id, secret }, error: null };
            }
            const factor = generateFactor(user.email); const id = randomUUID();
            await connection.query("insert into auth.mfa_factors(id,user_id,status,secret_ciphertext) values($1,$2,'unverified',$3)", [id, user.id, encryptSecret(factor.secret, key, user.id)]);
            return { data: { id, secret: factor.secret }, error: null };
          });
        } catch { return { data: null, error: unavailable() }; }
      },
      async challengeAndVerify({ factorId, code, enrollment = false }: { factorId: string; code: string; enrollment?: boolean }) {
        try {
          const token = await transaction(pool, async connection => {
            const user = await identity(connection, cookies.read()); if (!user || user.purpose !== "login") throw unavailable();
            // Serialize password resets, MFA verification and enrollment for this account.
            await connection.query("select id from auth.users where id=$1 for update", [user.id]);
            const active = await identity(connection, cookies.read()); if (!active) throw unavailable();
            const factor = (await connection.query<Factor>("select * from auth.mfa_factors where id=$1 and user_id=$2 for update", [factorId, user.id])).rows[0];
            if (!factor || (factor.status !== "verified" && !enrollment)) throw unavailable();
            const secret = decryptSecret(factor.secret_ciphertext, key, user.id);
            const counter = verifiedCounter(secret, code, BigInt(factor.last_counter)); if (counter === null) throw unavailable();
            await connection.query("update auth.mfa_factors set status='verified',last_counter=$2 where id=$1", [factor.id, counter.toString()]);
            // Enrolling invalidates all earlier sessions. A challenge rotates just this session.
            if (factor.status === "unverified") await connection.query("delete from auth.sessions where user_id=$1", [user.id]);
            else await connection.query("delete from auth.sessions where token_hash=$1", [tokenHash(cookies.read()!)]);
            return insertSession(connection, user.id, "login", "aal2", 43200);
          });
          cookies.write(token, 43200); return { error: null };
        } catch { return { error: unavailable() }; }
      },
    },
  };
}
export type AuthService = ReturnType<typeof authService>;
