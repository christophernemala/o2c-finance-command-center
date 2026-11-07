import { test } from "node:test";
import assert from "node:assert/strict";
// Test files run outside the Next.js JSX transform, so the classic runtime needs React in scope.
import React, { createElement } from "react"; void React;
import { renderToStaticMarkup } from "react-dom/server";
import { AuthShell } from "../src/components/auth-shell";
import { RegistrationForm } from "../src/components/registration-form";
import { SocialSignin } from "../src/components/social-signin";
test("account entry has a bank visual, honest SaaS copy and accessible detailed registration",()=>{
 const html=renderToStaticMarkup(<AuthShell wide><RegistrationForm available/></AuthShell>);
 assert.match(html,/finance-robot/);assert.match(html,/Explore the interactive banking scene/);assert.doesNotMatch(html,/auth-bank-canvas/);assert.match(html,/receivables, cash matching/);
 for(const field of ["full_name","email","company","job_title","phone","country","company_size","interest","description","consent"])assert.ok(html.includes(`name="${field}"`),field);
 assert.match(html,/action="\/api\/auth\/register"/);assert.match(html,/Request my finance workspace/);
 assert.doesNotMatch(html,/name="password"|99.9%|ISO 27001|SOC 2|bank-grade/i);
});
test("provider controls are disabled until server configuration is available",()=>{
 const html=renderToStaticMarkup(createElement(SocialSignin,{available:false}));
 assert.match(html,/Continue with.*Google/);assert.match(html,/Continue with.*Microsoft/);
 assert.equal((html.match(/disabled=""/g)??[]).length,2);
});
test("provider linking is disabled away from the stable auth origin, where the session cookie isn't sent",()=>{
 const html=renderToStaticMarkup(createElement(SocialSignin,{link:true,offHost:true}));
 assert.equal((html.match(/disabled=""/g)??[]).length,2);
 assert.match(html,/only be connected from this preview’s stable address/);
 assert.doesNotMatch(renderToStaticMarkup(createElement(SocialSignin,{offHost:true,available:false})),/stable address/,"sign-in itself is not affected");
});
test("with providers configured, only linking off the stable host is disabled, and the page links to the stable address",()=>{
 const env={GOOGLE_CLIENT_ID:"test-google",GOOGLE_CLIENT_SECRET:"test-only-secret",MICROSOFT_CLIENT_ID:"test-ms",MICROSOFT_CLIENT_SECRET:"test-only-secret",MICROSOFT_TENANT_ID:"00000000-0000-4000-8000-000000000000",
  AUTH_SITE_URL:"https://finance.example",UPSTASH_REDIS_REST_URL:"https://test.upstash.io",UPSTASH_REDIS_REST_TOKEN:"test-only-token",AUTH_RATE_LIMIT_SECRET:"test-only-rate-limit-secret-0123456789"};
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 try{
  const count=(html:string)=>(html.match(/disabled=""/g)??[]).length;
  assert.equal(count(renderToStaticMarkup(createElement(SocialSignin,{link:true}))),0,"linking on the stable host is enabled");
  assert.equal(count(renderToStaticMarkup(createElement(SocialSignin,{offHost:true}))),0,"sign-in off the stable host is enabled");
  const offHost=renderToStaticMarkup(createElement(SocialSignin,{link:true,offHost:true}));
  assert.equal(count(offHost),2,"linking off the stable host is disabled by the offHost guard alone");
  assert.match(offHost,/href="https:\/\/finance.example\/auth\/security"/);
 }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("invited activation collects details and posts to the real password activation route",()=>{
 const html=renderToStaticMarkup(createElement(RegistrationForm,{available:true,invitedEmail:"invite@example.com"}));
 assert.match(html,/action="\/api\/auth\/signup"/);assert.match(html,/name="password"/);assert.match(html,/name="confirm"/);assert.match(html,/readOnly/);
});
