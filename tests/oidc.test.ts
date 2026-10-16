import { test } from "node:test";
import assert from "node:assert/strict";
import { oidcSettings, validateProviderClaims } from "../src/lib/auth/oidc";
test("OIDC provider setup fixes issuers and rejects arbitrary Microsoft tenants",()=>{
 const env={GOOGLE_CLIENT_ID:"client",GOOGLE_CLIENT_SECRET:"secret",MICROSOFT_CLIENT_ID:"client",MICROSOFT_CLIENT_SECRET:"secret",MICROSOFT_TENANT_ID:"12345678-1234-4234-8234-123456789abc"};
 assert.equal(oidcSettings("google",env)?.issuer,"https://accounts.google.com");
 assert.ok(oidcSettings("microsoft",env));
 for(const tenant of ["common","organizations","https://evil.example",""])assert.equal(oidcSettings("microsoft",{...env,MICROSOFT_TENANT_ID:tenant}),null);
 assert.equal(oidcSettings("google",{}),null);
});
test("provider claims require stable subjects and Google-verified email; Microsoft subject is issuer scoped",()=>{
 assert.deepEqual(validateProviderClaims("google",{iss:"https://accounts.google.com",sub:"subject",email:"USER@example.com",email_verified:true}),{issuer:"https://accounts.google.com",subject:"subject",email:"user@example.com",provider:"google"});
 assert.throws(()=>validateProviderClaims("google",{iss:"https://accounts.google.com",sub:"subject",email:"user@example.com",email_verified:false}));
 assert.throws(()=>validateProviderClaims("google",{iss:"https://evil.example",sub:"subject",email:"user@example.com",email_verified:true}));
});
