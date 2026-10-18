import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {emailDeliverySettings,sendEmailCode} from '../src/lib/auth/email-delivery';
const smtp={SMTP_FROM:'O2C <signin@example.com>',SMTP_HOST:'smtp.example.com',SMTP_PORT:'587',SMTP_MODE:'starttls',SMTP_USERNAME:'test-only-user',SMTP_PASSWORD:'test-only-password'};
test('email configuration requires a sender and verified TLS transport',()=>{
 assert.equal(emailDeliverySettings({}),null);
 assert.equal(emailDeliverySettings(smtp)?.kind,'smtp');
 assert.equal(emailDeliverySettings({...smtp,SMTP_PORT:'465',SMTP_MODE:'ssl'})?.kind,'smtp');
 for(const change of [{SMTP_FROM:'wrong'},{SMTP_FROM:'O2C <signin@example.com>\r\nBcc:other@example.com'},{SMTP_PORT:'25'},{SMTP_MODE:'none'},{SMTP_PASSWORD:''},{SMTP_HOST:'smtp.example.com/path'}])assert.equal(emailDeliverySettings({...smtp,...change}),null);
 assert.equal(emailDeliverySettings({AUTH_EMAIL_FROM:'signin@example.com',RESEND_API_KEY:'test-only-key'})?.kind,'resend');
});
test('SMTP delivery requires provider acceptance and closes transport without logging codes',async t=>{
 const keys=[...Object.keys(smtp),'AUTH_EMAIL_FROM','RESEND_API_KEY'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)delete process.env[k];Object.assign(process.env,smtp);
 let accepted=true;let closed=0;let calls=0;
 t.mock.method(nodemailer,'createTransport',(options:Record<string,unknown>)=>{
  assert.equal(options.requireTLS,true);assert.equal(options.logger,false);assert.equal(options.debug,false);
  assert.deepEqual(options.tls,{rejectUnauthorized:true,minVersion:'TLSv1.2'});
  return {sendMail:async(message:Record<string,string>)=>{calls++;assert.equal(message.to,'member@example.com');assert.match(message.text,/123456/);return {accepted:accepted?['member@example.com']:[]};},close:()=>{closed++;}};
 });
 try{
  await sendEmailCode('member@example.com','123456');assert.equal(closed,1);
  accepted=false;await assert.rejects(sendEmailCode('member@example.com','123456'),/unavailable/);assert.equal(closed,2);
  await assert.rejects(sendEmailCode('member@example.com\nBcc:other@example.com','123456'));assert.equal(calls,2);
 }finally{for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
});
