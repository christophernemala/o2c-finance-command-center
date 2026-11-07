import * as oidc from "openid-client";
import { z } from "zod";
export const oidcCookieName=(provider:"google"|"microsoft",secure:boolean)=>`${secure?"__Host-":""}o2c-oidc-${provider}`;
export type Provider = "google" | "microsoft";
export function oidcSettings(provider:Provider,env:Record<string,string|undefined>=process.env){
 const prefix=provider==="google"?"GOOGLE":"MICROSOFT";
 const clientId=env[`${prefix}_CLIENT_ID`]?.trim(),clientSecret=env[`${prefix}_CLIENT_SECRET`]?.trim();
 if(!clientId || !clientSecret)return null;
 const tenant=env.MICROSOFT_TENANT_ID;
 if(provider==="microsoft" && !z.uuid().safeParse(tenant).success)return null;
 return {clientId,clientSecret,issuer:provider==="google"?"https://accounts.google.com":`https://login.microsoftonline.com/${tenant}/v2.0`};
}
export function validateProviderClaims(provider:Provider,claims:Record<string,unknown>,expectedIssuer?:string){
 const issuer=provider==="google"?"https://accounts.google.com":expectedIssuer;
 if(!issuer || claims.iss!==issuer || typeof claims.sub!=="string" || !claims.sub || claims.sub.length>255)throw new Error("Invalid provider identity");
 if(provider==="google" && claims.email_verified!==true)throw new Error("Email not verified");
 const email=z.email().max(254).parse(claims.email ?? claims.preferred_username).toLowerCase();
 // Email is only a contact/matching safeguard. Stable issuer+subject is the sign-in key.
 return {issuer,subject:claims.sub,email,provider};
}
export async function oidcConfiguration(provider:Provider){
 const settings=oidcSettings(provider);if(!settings)throw new Error("Provider unavailable");
 const config=await oidc.discovery(new URL(settings.issuer),settings.clientId,settings.clientSecret,undefined,{timeout:15});
 oidc.enableNonRepudiationChecks(config);
 return {config,settings};
}
export {oidc};
