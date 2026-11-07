import { createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { transaction, type SqlPool } from "../postgres/transaction";
export const registrationSchema = z.strictObject({
 id: z.uuid(), full_name: z.string().trim().min(2).max(120), email:z.email().max(254).transform(value=>value.toLowerCase()),
 company:z.string().trim().min(2).max(160), job_title:z.string().trim().min(2).max(80), phone:z.string().regex(/^\+[1-9]\d{7,14}$/),
 country:z.string().trim().min(2).max(80), company_size:z.enum(["1–10","11–50","51–200","201–1000","1001+"]),
 interest:z.enum(["collections","cash_application","ar_reporting","treasury_review"]), description:z.string().trim().min(10).max(1000), consent:z.literal("yes"),
});
export async function requestRegistration(pool:SqlPool, input:unknown) {
 const p=registrationSchema.parse(input);
 await transaction(pool,connection=>connection.query("select o2c_private.request_registration($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[p.id,p.full_name,p.email,p.company,p.job_title,p.phone,p.country,p.company_size,p.interest,p.description]));
}

export function registrationReceipt(secret:string,now=Date.now()){
 const timestamp=String(Math.floor(now/1000));return `${timestamp}.${createHmac("sha256",secret).update(`registration:${timestamp}`).digest("hex")}`;
}
export function validRegistrationReceipt(value:string|undefined,secret:string|undefined,now=Date.now()){
 if(!value || !secret || !/^\d{10}\.[a-f0-9]{64}$/.test(value))return false;
 const [timestamp]=value.split(".");const age=Math.floor(now/1000)-Number(timestamp);if(age<0 || age>600)return false;
 return timingSafeEqual(Buffer.from(value),Buffer.from(registrationReceipt(secret,Number(timestamp)*1000)));
}
