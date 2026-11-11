// Browser-only fixtures: no production authentication is bypassed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.stack || e.message);console.log('PAGE ERROR',e.stack)});page.setDefaultTimeout(10000);
let mode='empty';
await page.route('**/api/customer-operations/**',async route=>{
 const path = new URL(route.request().url()).pathname;
 if (!path.endsWith('/reports') && !path.endsWith('/ai')) return route.continue();
 const ai=path.endsWith('/ai');
 if(mode==='error'&&!ai) return route.fulfill({status:503,json:{error:'Report unavailable. Retry.'}});
 const report={businessId:'11111111-1111-4111-8111-111111111111',sla:{met:0,breached:0,pending:0,samples:0},reopenRate:{percent:null,samples:0},satisfaction:{score:null,samples:0,offered:0},total:0,open:0,resolved:0,unassigned:0,urgent:0,waiting:0,firstResponse:{minutes:null,samples:0},resolution:{minutes:null,samples:0},byStatus:[],byChannel:[],byCategory:[],byAgent:[],unavailable:['Legacy tickets may lack measurements.'],generatedAt:new Date().toISOString()};
 if(mode==='populated'){report.total=2;report.open=2;report.byStatus=[{label:'open',count:2}];report.byCategory=[{label:'<script>alert(1)</script>',count:2}];}
 await new Promise(r=>setTimeout(r,150));return route.fulfill({json:ai?{reason:'No provider configured. No customer data is sent to AI.'}:report});
});
await page.route('**/__report_test',route=>route.fulfill({contentType:'text/html',body:`<html><body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
const {createRoot}=ReactDOM;
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
await import('/src/index.css');
const {default:Reports}=await import('/src/components/CustomerOperationsReports.tsx');
import {auth} from '/src/services/auth.ts';
Object.defineProperty(auth,'currentUser',{get:()=>({getIdToken:async()=> 'fixture-only'})});
createRoot(document.getElementById('root')).render(React.createElement(Reports,{businessId:'11111111-1111-4111-8111-111111111111'}));
</script></body></html>`}));
try{

 await page.goto(baseURL+'/__report_test',{waitUntil:'domcontentloaded'});
 await page.getByText('No tickets were created in this period.',{exact:false}).waitFor();assert.equal(await page.getByRole('table').count(),4);
 assert.equal(await page.getByLabel('From',{exact:true}).count(),1);assert.equal(await page.getByLabel('Through',{exact:true}).count(),1);
 await page.getByRole('button',{name:'Apply dates'}).focus();assert.equal(await page.getByRole('button',{name:'Apply dates'}).evaluate(el=>el===document.activeElement),true);
 mode='populated';await page.keyboard.press('Enter');await page.getByRole('rowheader',{name:'<script>alert(1)</script>'}).waitFor();
 await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 mode='error';await page.getByRole('button',{name:'Apply dates'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('table').count(),0);
 console.log('Browser fixture checks passed: empty/populated/error states, semantic tables, labeled dates, keyboard submit, mobile width, escaped category text.');
 assert.deepEqual(errors.filter(e=>!e.includes('/@vite/client:')),[]); console.log('Development HMR warnings:', errors.filter(e=>e.includes('/@vite/client:')).length);
 await page.unroute('**/__report_test');
 await page.goto(baseURL+'/studio/customer-operations',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Sign in with Google'}).waitFor();console.log('Actual application sign-in gate rendered.');assert.deepEqual(errors.filter(e=>!e.includes('/@vite/client:')),[]);
}finally{await browser.close();}
