import nodemailer from 'nodemailer';
const address=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function emailDeliverySettings(env:Record<string,string|undefined>=process.env){
 const from=env.AUTH_EMAIL_FROM??env.SMTP_FROM;
 if(!from||/[\r\n]/.test(from)||!address.test(from.match(/<([^<>]+)>$/)?.[1]??from))return null;
 if(env.RESEND_API_KEY)return {kind:'resend' as const,from,key:env.RESEND_API_KEY};
 const host=env.SMTP_HOST;const port=Number(env.SMTP_PORT);const mode=env.SMTP_MODE?.toLowerCase();
 if(!host||/[\s/:]/.test(host)||!env.SMTP_USERNAME||!env.SMTP_PASSWORD)return null;
 if(!(port===465&&['ssl','tls'].includes(mode??'')||port===587&&mode==='starttls'))return null;
 return {kind:'smtp' as const,from,host,port,secure:port===465,user:env.SMTP_USERNAME,password:env.SMTP_PASSWORD};
}
export async function sendEmailCode(to:string,code:string){
 const settings=emailDeliverySettings();
 if(!settings||!address.test(to)||!/^\d{6}$/.test(code))throw Error('Email delivery unavailable');
 const subject='Your O2C sign-in code';
 const text=`Your O2C sign-in code is ${code}.\n\nIt expires in 10 minutes. Enter it in the same browser where you requested it. Never share this code.\n\nIf you did not request it, you can ignore this email.`;
 if(settings.kind==='resend'){
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${settings.key}`,'Content-Type':'application/json'},body:JSON.stringify({from:settings.from,to:[to],subject,text}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Email delivery unavailable');
  const result:unknown=await response.json();if(!result||typeof result!=='object'||!('id' in result)||typeof result.id!=='string')throw Error('Email delivery unavailable');return;
 }
 const mailer=nodemailer.createTransport({host:settings.host,port:settings.port,secure:settings.secure,requireTLS:!settings.secure,auth:{user:settings.user,pass:settings.password},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:15000,socketTimeout:15000,logger:false,debug:false});
 try{const result=await mailer.sendMail({from:settings.from,to,subject,text});if(!result.accepted?.length)throw Error('Email delivery unavailable');}finally{mailer.close();}
}
