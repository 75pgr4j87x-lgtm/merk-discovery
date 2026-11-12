import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import type {Firestore,Transaction} from 'firebase-admin/firestore';
import {applyTicketOperations,OperationsStore,defaultOperationsSettings,validateSettings,matchingRules,operationKey,operationsRouter,conversationSurvey,customerKnowledge} from '../customerOperationsOperations.js';
import type {CustomerOperationsTicket} from '../src/types/customerOperations.js';

import {MemoryDB} from './helpers/memoryFirestore.js';
const business='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const root=`customerOperationsBusinesses/${business}`;
const ticket=(extra:Partial<CustomerOperationsTicket>={}):CustomerOperationsTicket=>({id:'ticket1',businessId:business,ticketNumber:'TKT-1001',ticketNumberSearch:'tkt-1001',customerId:'customer1',customerName:'Customer',customerEmail:'client@example.com',subject:'Billing issue',subjectSearch:'billing issue',description:'Example',category:'Billing',tags:[],priority:'urgent',status:'new',assignedAgent:'',assignedTeam:'',source:'manual',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',firstResponseAt:null,resolvedAt:null,createdBy:'owner@example.com',...extra});
const config=()=>({...defaultOperationsSettings,surveyEnabled:true,rules:[{id:'urgent',name:'Urgent alert',enabled:true,trigger:'created' as const,priority:'urgent',category:'',action:'notify' as const,target:''},{id:'assign',name:'Billing assignment',enabled:true,trigger:'created' as const,priority:'',category:'billing',action:'assign' as const,target:'agent@example.com'}]});

test('rule validation restricts actions, IDs, bounds and conditions',()=>{
  assert.equal(validateSettings(config()).rules.length,2);
  for(const bad of [{...config(),slaMinutes:0},{...config(),rules:[{...config().rules[0],action:'eval'}]},{...config(),rules:[config().rules[0],config().rules[0]]},{...config(),rules:Array(21).fill(config().rules[0])}])assert.throws(()=>validateSettings(bad));
  assert.equal(matchingRules(config(),'created',ticket()).length,2);assert.equal(matchingRules(config(),'resolved',ticket()).length,0);assert.equal(matchingRules(config(),'created',ticket({priority:'low',category:'Other'})).length,0);
});
test('ticket actions, assignments, SLA and history commit once after a transaction retry',async()=>{
  const db=new MemoryDB();db.rows.set(root+'/operations/settings',config());db.rows.set('customerOperationsBusinessMemberships/member',{businessId:business,email:'agent@example.com',active:true});db.retryOnce=true;
  const next=await db.runTransaction(tx=>applyTicketOperations(db.firestore(),tx as Transaction,ticket(),null,'event1','owner','created','2026-01-01T00:00:00.000Z'));
  assert.equal(next.assignedAgent,'agent@example.com');assert.equal(next.slaDueAt,'2026-01-02T00:00:00.000Z');assert.equal(next.slaTargetAt,next.slaDueAt);
  assert.equal([...db.rows.keys()].filter(k=>k.includes('/automationRuns/')).length,2);
  assert.equal([...db.rows.keys()].filter(k=>k.includes('/notifications/')).length,2);
  const before=db.rows.size;await assert.rejects(()=>db.runTransaction(tx=>applyTicketOperations(db.firestore(),tx as Transaction,ticket(),null,'event1','owner','created','2026-01-01T00:00:00.000Z')));assert.equal(db.rows.size,before);
});
test('failed assignment is visible, retry is idempotent and another business member cannot be assigned',async()=>{
  const db=new MemoryDB();db.rows.set(root+'/operations/settings',config());db.rows.set('customerOperationsBusinessMemberships/wrong',{businessId:other,email:'agent@example.com',active:true});
  const next=await db.runTransaction(tx=>applyTicketOperations(db.firestore(),tx as Transaction,ticket(),null,'event2','owner','created','2026-01-01T00:00:00.000Z'));
  const id=operationKey('event2','assign');assert.equal(db.rows.get(root+'/automationRuns/'+id)?.result,'failed');assert.equal(next.assignedAgent,'');
  db.rows.set('customerOperationsTickets/ticket1',next);const store=new OperationsStore(db.firestore());
  await assert.rejects(()=>store.retryRun(business,id,'owner'));
  db.rows.set('customerOperationsBusinessMemberships/right',{businessId:business,email:'agent@example.com',active:true});await store.retryRun(business,id,'owner');const size=db.rows.size;await store.retryRun(business,id,'owner');assert.equal(db.rows.size,size);assert.equal(db.rows.get('customerOperationsTickets/ticket1')?.assignedAgent,'agent@example.com');
});
test('resolution issues one survey per event; reopening clears active survey and preserves history',async()=>{
  const db=new MemoryDB();db.rows.set(root+'/operations/settings',config());const resolved=ticket({status:'resolved',resolvedAt:'2026-01-03T00:00:00.000Z'});
  const result=await db.runTransaction(tx=>applyTicketOperations(db.firestore(),tx as Transaction,resolved,ticket(),'resolution1','owner','resolved','2026-01-03T00:00:00.000Z'));
  assert.ok(result.surveyId);assert.equal(result.slaDueAt,null);
  const reopened=await db.runTransaction(tx=>applyTicketOperations(db.firestore(),tx as Transaction,result,result,'reply1','customer','customer_reply','2026-01-04T00:00:00.000Z'));
  assert.equal(reopened.status,'open');assert.equal(reopened.reopenCount,1);assert.equal(reopened.resolvedAt,null);assert.equal(reopened.surveyId,null);assert.ok(db.rows.has(root+'/surveys/'+result.surveyId));
  db.rows.set(root+'/operations/settings',{...config(),reopenOnReply:false});const unchanged=await db.runTransaction(tx=>applyTicketOperations(db.firestore(),tx as Transaction,result,result,'reply2','customer','customer_reply','2026-01-04T00:00:00.000Z'));assert.equal(unchanged.status,'resolved');
});
test('SLA checks only touch own business, alert once and page beyond processed deadlines',async()=>{
  const db=new MemoryDB(),store=new OperationsStore(db.firestore());db.rows.set('customerOperationsTickets/ticket1',ticket({slaDueAt:'2020-01-01T00:00:00.000Z'}));db.rows.set('customerOperationsTickets/other',ticket({id:'other',businessId:other,slaDueAt:'2020-01-01T00:00:00.000Z'}));
  db.retryOnce=true;const first=await store.checkDeadlines(business,'manager');assert.equal(first.processed,1);const size=db.rows.size;await store.checkDeadlines(business,'manager');assert.equal(db.rows.size,size);assert.equal(db.rows.get('customerOperationsTickets/ticket1')?.slaDueAt,null);assert.equal(db.rows.get('customerOperationsTickets/other')?.slaDueAt,'2020-01-01T00:00:00.000Z');
  for(let i=0;i<51;i++)db.rows.set('customerOperationsTickets/batch'+String(i).padStart(2,'0'),ticket({id:'batch'+String(i).padStart(2,'0'),slaDueAt:'2020-01-01T00:00:00.000Z'}));
  const page=await store.checkDeadlines(business,'manager');assert.ok(page.nextCursor);const next=await store.checkDeadlines(business,'manager',page.nextCursor);assert.equal(next.processed,1);assert.equal(next.nextCursor,null);
  const soon=new Date(Date.now()+5*60000).toISOString();db.rows.set('customerOperationsTickets/soon',ticket({id:'soon',slaDueAt:soon}));
  await store.checkDeadlines(business,'manager');const count=db.rows.size;await store.checkDeadlines(business,'manager');assert.equal(db.rows.size,count);assert.equal(db.rows.get('customerOperationsTickets/soon')?.slaDueAt,soon);

});
test('knowledge visibility, scoped article edits, notification read access and feedback replay',async()=>{
  const db=new MemoryDB(),store=new OperationsStore(db.firestore());
  await store.saveArticle(business,'',{title:'Public',body:'Help text',category:'FAQ',status:'published',visibility:'customer'},'owner');
  await store.saveArticle(business,'',{title:'Internal',body:'Private text',category:'FAQ',status:'published',visibility:'internal'},'owner');
  await store.saveArticle(business,'',{title:'Draft',body:'Draft text',category:'FAQ',status:'draft',visibility:'customer'},'owner');
  assert.equal((await customerKnowledge(db.firestore(),business)).length,1);await assert.rejects(()=>store.saveArticle(other,[...db.rows.keys()].find(p=>p.includes('/articles/'))!.split('/').at(-1)!,{title:'Other',body:'Bad',category:'FAQ',status:'draft',visibility:'customer'},'other'));
  db.rows.set(root+'/notifications/n1',{id:'n1',audience:'agent@example.com',createdAt:'2026-01-01'});await assert.rejects(()=>store.acknowledge(business,'n1','other@example.com',true));await store.acknowledge(business,'n1','agent@example.com',false);
  assert.equal((await store.list(business,'notifications','','agent@example.com',false)).items[0].read,true);
  await store.preferences(business,'agent@example.com',false);assert.equal((await store.list(business,'notifications','','agent@example.com',false)).items.length,0);await store.preferences(business,'agent@example.com',true);

  const hash='hashed-token',expires='2999-01-01T00:00:00.000Z';db.rows.set(root,{status:'active'});db.rows.set('customerOperationsCustomers/customer1',{businessId:business,status:'active'});db.rows.set('customerOperationsConversations/c1',{businessId:business,ticketId:'ticket1',customerId:'customer1',customerLinkTokenHash:hash,customerLinkExpiresAt:expires});db.rows.set('customerOperationsTickets/ticket1',ticket({status:'resolved',surveyId:'s1'}));db.rows.set(root+'/surveys/s1',{ticketId:'ticket1',customerId:'customer1',prompt:'Satisfied?',submittedAt:null});
  const context={businessId:business,id:'c1',ticketId:'ticket1'};
  await assert.rejects(()=>conversationSurvey(db.firestore(),context,'wrong'));
  await assert.rejects(()=>conversationSurvey(db.firestore(),context,hash,{score:6,resolved:true,comment:''}));
  const answer={score:5,resolved:true,comment:'Thanks'};await conversationSurvey(db.firestore(),context,hash,answer);await conversationSurvey(db.firestore(),context,hash,answer);assert.equal(db.rows.get(root+'/surveys/s1')?.score,5);await assert.rejects(()=>conversationSurvey(db.firestore(),context,hash,{...answer,score:1}));
});
test('HTTP operations routes restrict manager settings, allow staff articles and preserve store scoping',async()=>{
  const app=express();app.use(express.json());const db=new MemoryDB();let called=0;
  app.use('/businesses/:businessId/operations',operationsRouter({authorize:(req,res,next)=>{if(req.params.businessId!==business){res.sendStatus(404);return;}res.locals.customerOperationsEmail='agent@example.com';res.locals.customerOperationsBusinessRole=req.get('x-role')||'business_support_agent';next();},store:()=>{called++;return new OperationsStore(db.firestore());}}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/businesses/`;
  try{assert.equal((await fetch(url+business+'/operations/settings')).status,403);assert.equal(called,0);assert.equal((await fetch(url+other+'/operations/articles')).status,404);assert.equal((await fetch(url+business+'/operations/articles')).status,200);assert.equal((await fetch(url+business+'/operations/settings',{headers:{'x-role':'business_manager'}})).status,200);assert.equal((await fetch(url+business+'/operations/settings',{method:'PUT',headers:{'Content-Type':'application/json','x-role':'business_manager'},body:JSON.stringify({...config(),slaMinutes:-1})})).status,400);}
  finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
