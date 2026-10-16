import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationSchema } from "../src/lib/auth/registration";
import { migratedDatabase } from "./pg-helper";
test("registration validates contact and company details without accepting access roles", () => {
 const data={ id:"00000000-0000-4000-8000-000000000001", full_name:"Test Applicant", email:"applicant@example.com", company:"Test Company", job_title:"Credit controller", phone:"+971501234567", country:"United Arab Emirates", company_size:"11–50", interest:"collections", description:"Manage overdue accounts and reminders", consent:"yes" };
 assert.equal(registrationSchema.safeParse(data).success,true);
 for(const change of [{email:"bad"},{phone:"0501"},{consent:"no"},{role:"admin"},{company:""}]) assert.equal(registrationSchema.safeParse({...data,...change}).success,false);
});
test("registration requests are private, replay-safe and never provision identities or finance memberships",async()=>{
 const db=await migratedDatabase();
 try {
  await db.exec("set role o2c_app");
  const values=["00000000-0000-4000-8000-000000000001","Applicant","applicant@example.com","Company","Finance manager","+971501234567","United Arab Emirates","11–50","collections","Review outstanding invoices"];
  await db.query("select o2c_private.request_registration($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",values);
  await db.query("select o2c_private.request_registration($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",values);
  await db.exec("reset role");
  assert.equal((await db.query<{n:number}>("select count(*)::int n from auth.registration_requests")).rows[0].n,1);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from auth.users")).rows[0].n,0);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from public.memberships")).rows[0].n,0);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from auth.registration_requests"),/permission denied/);
  await assert.rejects(db.query("select o2c_private.request_registration($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",values),/permission denied/);
 } finally {await db.close();}
});

test("registration receipts cannot be forged or replayed after expiry",async()=>{
 const {registrationReceipt,validRegistrationReceipt}=await import("../src/lib/auth/registration");
 const secret="test-only-secret";const now=1700000000000;const receipt=registrationReceipt(secret,now);
 assert.equal(validRegistrationReceipt(receipt,secret,now+1000),true);
 assert.equal(validRegistrationReceipt(receipt,"other-key",now+1000),false);
 assert.equal(validRegistrationReceipt(receipt,secret,now+601000),false);
 assert.equal(validRegistrationReceipt(receipt,secret,now-1000),false);
});

test("external identities require an authorized link session, not an email match",async()=>{
 const {authService}=await import("../src/lib/auth/service");const {newToken,tokenHash}=await import("../src/lib/auth/crypto");
 const db=await migratedDatabase();
 try{
  const user="00000000-0000-4000-8000-000000000002";const invitation=newToken();
  await db.query("insert into auth.users(id,email,invited_at) values($1,'applicant@example.com',now())",[user]);
  await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'invitation','aal1',now()+interval '10 minutes')",[tokenHash(invitation),user]);
  await db.exec("create role oidc_runtime login nosuperuser nobypassrls; grant o2c_app to oidc_runtime");
  const pool={connect:async()=>{await db.exec("reset role;set role oidc_runtime");return {query:(sql:string,values?:unknown[])=>db.query(sql,values) as never,release:()=>{}};}};
  let token:string|undefined;const jar={read:()=>token,write:(value:string)=>{token=value;},clear:()=>{token=undefined;}};
  const service=authService(pool,jar,Buffer.alloc(32,17));
  const external={issuer:"https://accounts.google.com",subject:"test-subject",email:"applicant@example.com",provider:"google" as const};
  assert.ok((await service.signInWithExternal(external,null)).error,"matching email alone cannot sign in");
  token=invitation;
  assert.ok((await service.signInWithExternal({...external,email:"another@example.com"},tokenHash(invitation))).error);
  assert.equal((await service.signInWithExternal(external,tokenHash(invitation))).error,null);
  assert.notEqual(token,invitation);
  assert.equal((await service.getUser()).data.user?.purpose,"login");
  assert.ok((await service.signInWithExternal(external,tokenHash(invitation))).error,"consumed invitation cannot link again");
  token=undefined;assert.equal((await service.signInWithExternal(external,null)).error,null,"subsequent login uses the stored issuer and subject");
  assert.ok((await service.signInWithExternal({...external,subject:"different-subject"},null)).error);
  await db.exec("reset role");
  assert.equal((await db.query<{n:number}>("select count(*)::int n from public.memberships")).rows[0].n,0);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from auth.external_identities")).rows[0].n,1);
  await db.query("insert into auth.mfa_factors(id,user_id,status,secret_ciphertext) values(gen_random_uuid(),$1,'verified','test-only-ciphertext')",[user]);
  token=undefined;assert.equal((await service.signInWithExternal(external,null)).error,null);
  assert.deepEqual((await service.mfa.getAuthenticatorAssuranceLevel()).data,{currentLevel:"aal1",nextLevel:"aal2"},"provider login cannot bypass an enrolled authenticator");
  await db.exec("reset role");
  await db.query("update auth.users set disabled=true where id=$1",[user]);
  assert.ok((await service.signInWithExternal(external,null)).error,"disabled accounts cannot use a linked provider");

 }finally{await db.close();}
});
