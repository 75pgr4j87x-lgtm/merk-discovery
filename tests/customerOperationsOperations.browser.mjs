// Component acceptance with browser-only fixtures; no production auth bypass.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
let settings={slaMinutes:1440,reopenOnReply:true,surveyEnabled:false,surveyPrompt:'How satisfied are you?',rules:[]};
const articles=[],members=[],runs=[{id:'failed1',ruleName:'Assign billing',trigger:'created',result:'failed',error:'Assignment target inactive',createdAt:'2026-11-11'}];let submitted=false,retries=0,failSave=false;
await page.route('**/api/customer-operations/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=req.postDataJSON();
 let data={items:[],nextCursor:null};
 if(path.endsWith('/operations/preferences'))data={enabled:true};
 else if(path.endsWith('/operations/settings')){if(method==='PUT')settings=body;data=settings;}
 else if(path.endsWith('/operations/articles')){if(method==='POST'){if(failSave)return route.fulfill({status:503,json:{error:'Save unavailable. Retry.'}});articles.unshift({...body,id:'article1',createdAt:'2026-11-11',updatedAt:'2026-11-11'});data=articles[0];}else data={items:articles,nextCursor:null};}
 else if(path.endsWith('/operations/automationRuns'))data={items:runs,nextCursor:null};
 else if(path.endsWith('/failed1/retry')){retries++;runs[0].retryRunId='retry1';data={success:true};}
 else if(path.endsWith('/members')){if(method==='POST')members.push({...body,id:body.email});data=members;}
 else if(path.endsWith('/public/survey')){if(method==='POST'){assert.equal(body.score,5);assert.equal(body.resolved,true);submitted=true;}data={survey:{prompt:'How satisfied are you?',submitted}};}
 else if(path.endsWith('/public/knowledge'))data={articles:[{id:'public1',title:'Getting started',body:'Customer help text',category:'FAQ'}]};
 return route.fulfill({json:data});
});
await page.route('**/__operations_test*',route=>{
 const feedback=route.request().url().includes('feedback');
 return route.fulfill({contentType:'text/html',body:`<html><body><div id="root"></div><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 await import('/src/index.css');const {auth}=await import('/src/services/auth.ts');Object.defineProperty(auth,'currentUser',{get:()=>({getIdToken:async()=>'fixture-only'})});
 const {default:Component}=await import('/src/components/${feedback?'CustomerOperationsFeedback':'CustomerOperationsOperations'}.tsx');
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component,${feedback?"{token:'fixture-only'}":"{businessId:'11111111-1111-4111-8111-111111111111',role:'business_owner'}"}));
 </script></body></html>`});
});
try{
 await page.goto(base+'/__operations_test',{waitUntil:'domcontentloaded'});await page.getByText('No records yet.').waitFor();
 await page.getByRole('button',{name:'Rules & SLA',exact:true}).click();await page.getByLabel('Resolution SLA',{exact:false}).fill('30');
 await page.getByLabel('Offer one satisfaction survey',{exact:false}).check();await page.getByRole('button',{name:'Add rule',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Urgent ticket alert');await page.getByLabel('Priority',{exact:true}).selectOption('urgent');
 await page.getByRole('button',{name:'Save rules & SLA'}).click();await page.getByText('Operations settings saved.').waitFor();assert.equal(settings.slaMinutes,30);assert.equal(settings.rules[0].priority,'urgent');assert.equal(settings.surveyEnabled,true);
 await page.getByRole('button',{name:'Automation history',exact:true}).click();await page.getByRole('button',{name:'Retry assignment'}).click();await page.getByText('Assignment retry completed.').waitFor();assert.equal(retries,1);assert.equal(await page.getByRole('button',{name:'Retry assignment'}).count(),0);
 await page.getByRole('button',{name:'Knowledge base',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Getting started');await page.getByLabel('Category',{exact:true}).fill('FAQ');await page.getByLabel('Article text').fill('Customer help text');await page.getByLabel('Status',{exact:true}).selectOption('published');await page.getByLabel('Visibility',{exact:true}).selectOption('customer');
 failSave=true;await page.getByRole('button',{name:'Save article'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Article text').inputValue(),'Customer help text');
 failSave=false;await page.getByRole('button',{name:'Save article'}).click();await page.getByText('Article saved.',{exact:true}).waitFor();assert.equal(articles[0].visibility,'customer');
 await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByLabel('Member email').fill('agent@example.com');await page.getByRole('button',{name:'Add / update member'}).click();await page.getByRole('heading',{name:'agent@example.com'}).waitFor();assert.equal(members[0].role,'business_support_agent');
 await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(base+'/__operations_test?feedback=1',{waitUntil:'domcontentloaded'});await page.getByLabel('Satisfaction score').selectOption('5');await page.getByLabel('Was the issue resolved?').selectOption('yes');await page.getByLabel('Comment (optional)').fill('Thank you');await page.getByRole('button',{name:'Submit feedback'}).click();await page.getByText('Thank you. Your feedback has been recorded.').waitFor();await page.getByText('Getting started',{exact:true}).click();await page.getByText('Customer help text',{exact:true}).waitFor();assert.ok(submitted);
 assert.deepEqual(errors.filter(e=>!e.includes('/@vite/client:')),[]);console.log('Operations browser fixtures passed: settings/rules, assignment retry, article save/error draft retention, team controls, mobile layout, survey and customer knowledge.');console.log('Vite HMR transport warnings:',errors.filter(e=>e.includes('/@vite/client:')).length);
}finally{await browser.close();}
