import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDatabase } from './pg-helper';
import { requestEmailCode } from '../src/lib/auth/email-code';
import { authService } from '../src/lib/auth/service';
import { newToken, tokenHash } from '../src/lib/auth/crypto';

test('email codes are bound, hashed, single-use, limited and preserve MFA', async () => {
 const db=await migratedDatabase();
 try {
  const id='00000000-0000-4000-8000-000000000011';
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'member@example.com',now())",[id]);
  await db.exec('create role email_runtime login nosuperuser nobypassrls; grant o2c_app to email_runtime');
  const pool={connect:async()=>{await db.exec('reset role;set role email_runtime');return {query:(sql:string,values?:unknown[])=>db.query(sql,values) as never,release:()=>{}};}};
  let session:string|undefined;const service=authService(pool,{read:()=>session,write:v=>{session=v;},clear:()=>{session=undefined;}},Buffer.alloc(32,17));
  const secret='test-only-secret-that-is-at-least-32-characters';let code='';let deliveries=0;
  const send=async(_to:string,value:string)=>{code=value;deliveries++;};
  const binding=newToken();await requestEmailCode(pool,'member@example.com',binding,secret,send);
  assert.match(code,/^\d{6}$/);
  await db.exec('reset role');const row=(await db.query<{code_hash:string;token_hash:string}>('select code_hash,token_hash from auth.email_login_codes')).rows[0];
  assert.equal(row.token_hash,tokenHash(binding));assert.notEqual(row.code_hash,code);assert.notEqual(row.code_hash,tokenHash(code));
  assert.ok((await service.signInWithEmailCode(newToken(),code,secret)).error);
  assert.equal((await service.signInWithEmailCode(binding,code,secret)).error,null);
  assert.equal((await service.getUser()).data.user?.id,id);
  assert.ok((await service.signInWithEmailCode(binding,code,secret)).error,'replay denied');
  const locked=newToken();await requestEmailCode(pool,'member@example.com',locked,secret,send);const correct=code;
  for(let i=0;i<5;i++)assert.ok((await service.signInWithEmailCode(locked,correct==='000000'?'000001':'000000',secret)).error);
  assert.ok((await service.signInWithEmailCode(locked,correct,secret)).error,'five failures lock challenge');
  const expired=newToken();await requestEmailCode(pool,'member@example.com',expired,secret,send);
  await db.exec("reset role;update auth.email_login_codes set expires_at=now()-interval '1 second'");
  assert.ok((await service.signInWithEmailCode(expired,code,secret)).error);
  const before=deliveries;await requestEmailCode(pool,'unknown@example.com',newToken(),secret,send);assert.equal(deliveries,before);
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from auth.users')).rows[0].n,1);
  const failed=newToken();await assert.rejects(requestEmailCode(pool,'member@example.com',failed,secret,async()=>{throw Error('provider failed');}));
  await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from auth.email_login_codes where token_hash=$1',[tokenHash(failed)])).rows[0].n,0);
  await db.query("insert into auth.mfa_factors(id,user_id,status,secret_ciphertext) values(gen_random_uuid(),$1,'verified','test-only-ciphertext')",[id]);
  const mfa=newToken();await requestEmailCode(pool,'member@example.com',mfa,secret,send);const previous=session;
  assert.equal((await service.signInWithEmailCode(mfa,code,secret)).error,null);assert.notEqual(session,previous);
  assert.deepEqual((await service.mfa.getAuthenticatorAssuranceLevel()).data,{currentLevel:'aal1',nextLevel:'aal2'});
  const disabled=newToken();await requestEmailCode(pool,'member@example.com',disabled,secret,send);
  await db.exec('reset role');await db.query('update auth.users set disabled=true where id=$1',[id]);
  assert.ok((await service.signInWithEmailCode(disabled,code,secret)).error);
  const disabledDeliveries=deliveries;await requestEmailCode(pool,'member@example.com',newToken(),secret,send);assert.equal(deliveries,disabledDeliveries);
  await db.exec('reset role');await db.query('update auth.users set disabled=false,email_confirmed_at=null where id=$1',[id]);
  await requestEmailCode(pool,'member@example.com',newToken(),secret,send);assert.equal(deliveries,disabledDeliveries,'unconfirmed accounts cannot request codes');
  await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select * from auth.email_login_codes'),/permission denied/);
 }finally{await db.close();}
});
