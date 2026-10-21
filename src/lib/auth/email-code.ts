import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { transaction, type SqlPool, type SqlConnection } from '../postgres/transaction';
import { tokenHash, validToken } from './crypto';
export const emailCodeCookie=(secure:boolean)=>secure?'__Host-o2c-email-code':'o2c-email-code';
const digest=(secret:string,binding:string,code:string)=>createHmac('sha256',secret).update(`email-login:${tokenHash(binding)}:${code}`).digest();
export async function requestEmailCode(pool:SqlPool,email:string,binding:string,secret:string,send:(to:string,code:string)=>Promise<void>){
 if(!validToken(binding)||secret.length<32)throw Error('Authentication unavailable');
 const code=randomInt(1_000_000).toString().padStart(6,'0');
 const recipient=await transaction(pool,async connection=>{
  const user=(await connection.query<{id:string;email:string}>("select id,email from auth.users where email=$1 and not disabled and email_confirmed_at is not null for update",[email.trim().toLowerCase()])).rows[0];
  if(!user)return null;
  await connection.query('delete from auth.email_login_codes where user_id=$1 or expires_at<=now()',[user.id]);
  await connection.query("insert into auth.email_login_codes(token_hash,user_id,code_hash,expires_at) values($1,$2,$3,now()+interval '10 minutes')",[tokenHash(binding),user.id,digest(secret,binding,code).toString('hex')]);
  return user.email;
 });
 if(!recipient)return;
 try{await send(recipient,code);}catch{
  await transaction(pool,async connection=>{await connection.query('delete from auth.email_login_codes where token_hash=$1',[tokenHash(binding)]);});
  throw Error('Email delivery unavailable');
 }
}
export async function consumeEmailCode(connection:SqlConnection,binding:string,code:string,secret:string):Promise<string|null>{
 if(!validToken(binding)||!/^\d{6}$/.test(code)||secret.length<32)return null;
 const row=(await connection.query<{user_id:string;code_hash:string;attempts:number}>('select user_id,code_hash,attempts from auth.email_login_codes where token_hash=$1 and expires_at>now() for update',[tokenHash(binding)])).rows[0];
 if(!row||row.attempts>=5)return null;
 await connection.query('update auth.email_login_codes set attempts=attempts+1 where token_hash=$1',[tokenHash(binding)]);
 if(!timingSafeEqual(Buffer.from(row.code_hash,'hex'),digest(secret,binding,code)))return null;
 await connection.query('delete from auth.email_login_codes where token_hash=$1',[tokenHash(binding)]);
 return row.user_id;
}
