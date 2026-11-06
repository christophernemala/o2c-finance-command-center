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
test("invited activation collects details and posts to the real password activation route",()=>{
 const html=renderToStaticMarkup(createElement(RegistrationForm,{available:true,invitedEmail:"invite@example.com"}));
 assert.match(html,/action="\/api\/auth\/signup"/);assert.match(html,/name="password"/);assert.match(html,/name="confirm"/);assert.match(html,/readOnly/);
});
