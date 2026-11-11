import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { businessAccessStatus, buildTicketReport, reportRange, reportingRouter, customerOperationsAIStatus, type ReportTicket } from '../customerOperationsReporting.js';
import type { CustomerOperationsBusinessMembership } from '../src/types/customerOperations.js';
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const member = (role='business_manager', active=true) => ({businessId:a,role,active} as CustomerOperationsBusinessMembership);
const range = reportRange('2026-01-01','2026-01-31',new Date('2026-02-01'));
const ticket = (changes:Partial<ReportTicket> = {}):ReportTicket => ({businessId:a,createdAt:'2026-01-02T00:00:00.000Z',status:'open',priority:'normal',assignedAgent:'',source:'in_app',category:'',firstResponseAt:null,resolvedAt:null,...changes});

test('business boundary rejects platform roles, other tenants, inactive memberships and malformed IDs',()=>{
  for(const platformRole of ['platform_super_admin','platform_support_agent']) assert.equal(businessAccessStatus({platformRole,businesses:[member()]},a),403);
  assert.equal(businessAccessStatus({platformRole:null,businesses:[member()]},b),404);
  assert.equal(businessAccessStatus({platformRole:null,businesses:[member('business_owner',false)]},a),404);
  for(const id of ['../'+a,'a'.repeat(36),'',a+'/customers']) assert.equal(businessAccessStatus({platformRole:null,businesses:[member()]},id),404);
  assert.equal(businessAccessStatus({platformRole:null,businesses:[member()]},a),200);
});
test('date validation rejects normalization, duplicate filters, future and expensive ranges',()=>{
  for (const args of [['2026-02-30','2026-03-01'],['2026-01-02','2026-01-01'],['2025-01-01','2026-01-01'],[['2026-01-01'],'2026-01-02'],['2027-01-01','2027-01-02']]) assert.throws(()=>reportRange(...args as [unknown,unknown],new Date('2026-02-01')));
  assert.equal(range.endExclusive,'2026-02-01T00:00:00.000Z');
});
test('reports measure persisted cohort state, missing timestamps and category keys safely',()=>{
  const report=buildTicketReport(a,range,[ticket(),ticket({status:'resolved',resolvedAt:'2026-01-02T01:00:00.000Z',firstResponseAt:'2026-01-02T00:10:00.000Z',category:'__proto__'}),ticket({status:'waiting_on_customer',priority:'urgent'})]);
  assert.equal(report.total,3);assert.equal(report.open,2);assert.equal(report.resolved,1);assert.equal(report.unassigned,2);assert.equal(report.waiting,1);assert.equal(report.urgent,1);
  assert.deepEqual(report.resolution,{minutes:60,samples:1});assert.deepEqual(report.firstResponse,{minutes:10,samples:1});assert.ok(report.byCategory.some(x=>x.label==='__proto__'&&x.count===1));
  const empty=buildTicketReport(a,range,[]);assert.equal(empty.total,0);assert.equal(empty.resolution.minutes,null);
});
test('reports fail closed on cross-tenant store results, out-of-range rows and oversized cohorts',()=>{
  assert.throws(()=>buildTicketReport(a,range,[ticket({businessId:b})]));
  assert.throws(()=>buildTicketReport(a,range,[ticket({createdAt:range.endExclusive})]));
  assert.throws(()=>buildTicketReport(a,range,Array.from({length:5001},()=>ticket())));
});
test('AI remains disconnected without transmitting data',()=>{
  assert.equal(customerOperationsAIStatus.connected,false);assert.equal(customerOperationsAIStatus.provider,null);assert.equal(customerOperationsAIStatus.humanApprovalRequired,true);
});

test('HTTP report routes enforce scope, role, validation, limits, failures and no-store',async()=>{
  const app=express();let reads=0;let mode='normal';
  // Verified identity/membership fixture at the dependency boundary. No production auth bypass is installed.
  const identities:Record<string,{platformRole:string|null;businesses:CustomerOperationsBusinessMembership[]}>={owner:{platformRole:null,businesses:[member('business_owner')]},manager:{platformRole:null,businesses:[member()]},agent:{platformRole:null,businesses:[member('business_support_agent')]},platform:{platformRole:'platform_super_admin',businesses:[]}};
  app.use('/businesses/:businessId',reportingRouter({authorize:(req,res,next)=>{
    const identity=identities[req.get('authorization') || ''];
    if(!identity){res.sendStatus(401);return;}
    const code=businessAccessStatus(identity,req.params.businessId);if(code!==200){res.sendStatus(code);return;}
    res.locals.customerOperationsBusinessRole=identity.businesses[0].role;next();
  },loadTickets:async(businessId,query)=>{reads++;assert.equal(businessId,a);assert.equal(query.start,range.start);if(mode==='fail')throw new Error('simulated database unavailable');return mode==='oversize'?Array.from({length:5001},()=>ticket()):[ticket()];}}));
  app.get('/businesses/:businessId/customers', (_req,res) => res.json({route:'existing customers'}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number};
  const request=(tenant:string,who:string,query='start=2026-01-01&end=2026-01-31',path='reports')=>fetch(`http://127.0.0.1:${address.port}/businesses/${tenant}/${path}?${query}`,{headers:{authorization:who}});
  try {
    const existing=await request(a,'agent','','customers');assert.equal(existing.status,200);assert.equal((await existing.json()).route,'existing customers');
    assert.equal((await request(a,'')).status,401);
    assert.equal((await request(b,'manager')).status,404);
    assert.equal((await request(a,'platform')).status,403);
    assert.equal((await request(a,'agent')).status,403);assert.equal(reads,0);
    assert.equal((await request(a,'manager','businessId='+b)).status,400);
    assert.equal((await request(a,'manager','start=2026-01-01&start=2026-01-02')).status,400);assert.equal(reads,0);
    for(const role of ['owner','manager']) {const r=await request(a,role);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal((await r.json()).businessId,a);}
    const ai=await request(a,'manager','','ai');assert.equal(ai.status,200);assert.equal((await ai.json()).connected,false);
    mode='oversize';assert.equal((await request(a,'manager')).status,422);
    mode='fail';const failure=await request(a,'manager');assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('simulated'));
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('Phase 5 measurements exclude legacy tickets and include actual SLA, reopen and survey records',()=>{
 const report=buildTicketReport(a,range,[ticket(),ticket({status:'resolved',resolvedAt:'2026-01-02T01:00:00.000Z',slaTargetAt:'2026-01-02T02:00:00.000Z',reopenCount:1}),ticket({slaTargetAt:'2026-01-01T00:00:00.000Z',reopenCount:0})],[{score:5,resolved:true,submittedAt:'2026-01-03'},{score:3,resolved:false,submittedAt:'2026-01-03'},{submittedAt:null}]);
 assert.deepEqual(report.sla,{met:1,breached:1,pending:0,samples:2});assert.deepEqual(report.reopenRate,{percent:50,samples:2});assert.equal(report.satisfaction.score,4);assert.equal(report.satisfaction.samples,2);assert.equal(report.satisfaction.offered,3);
});
