import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import type {Firestore,Transaction} from 'firebase-admin/firestore';
import {applyTicketOperations,OperationsStore,defaultOperationsSettings,validateSettings,matchingRules,operationKey,operationsRouter,conversationSurvey,customerKnowledge} from '../customerOperationsOperations.js';
import type {CustomerOperationsTicket} from '../src/types/customerOperations.js';

// Transactional in-memory fixture for exercising the actual operations store.
// It models rollback/atomic create; live Firestore/index checks remain separate.
class MemoryDB {
  rows=new Map<string,Record<string,any>>();retryOnce=false;
  collection(path:string){return new Query(this,path);}
  async getAll(...refs:Ref[]){return Promise.all(refs.map(r=>r.get()));}
  async runTransaction<T>(fn:(tx:any)=>Promise<T>):Promise<T>{
    for(let attempt=0;attempt<2;attempt++){
      const writes:Array<()=>void>=[];
      const tx={get:async(ref:Ref|Query)=>ref.get(),set:(r:Ref,v:any)=>writes.push(()=>this.rows.set(r.path,structuredClone(v))),create:(r:Ref,v:any)=>writes.push(()=>{if(this.rows.has(r.path))throw new Error('Already exists');this.rows.set(r.path,structuredClone(v));}),update:(r:Ref,v:any)=>writes.push(()=>{if(!this.rows.has(r.path))throw new Error('Missing document');this.rows.set(r.path,{...this.rows.get(r.path),...structuredClone(v)});})};
      const result=await fn(tx);if(this.retryOnce&&attempt===0){this.retryOnce=false;continue;}
      const backup=new Map(this.rows);try{writes.forEach(w=>w());return result;}catch(e){this.rows=backup;throw e;}
    }throw new Error('Retries exhausted');
  }
  firestore(){return this as unknown as Firestore;}
}
class Ref {
  constructor(public db:MemoryDB,public path:string){}get id(){return this.path.split('/').at(-1)!;}
  collection(name:string){return new Query(this.db,this.path+'/'+name);}
  async get(){const value=this.db.rows.get(this.path);return {id:this.id,exists:Boolean(value),ref:this,data:()=>value?structuredClone(value):undefined,get:(key:string)=>value?.[key]};}
}
class Query {
  filters:Array<[string,string,any]>=[];orders:Array<[string,string]>=[];maximum=Infinity;after:any[]=[];
  constructor(public db:MemoryDB,public path:string){}
  doc(id:string){return new Ref(this.db,this.path+'/'+id);}
  clone(){const q=new Query(this.db,this.path);q.filters=[...this.filters];q.orders=[...this.orders];q.maximum=this.maximum;q.after=this.after;return q;}
  where(key:string,op:string,value:any){const q=this.clone();q.filters.push([key,op,value]);return q;}
  orderBy(key:string,dir='asc'){const q=this.clone();q.orders.push([key,dir]);return q;}
  limit(n:number){const q=this.clone();q.maximum=n;return q;}
  startAfter(...v:any[]){const q=this.clone();q.after=v;return q;}
  async get(){
    let rows=[...this.db.rows.entries()].filter(([p])=>p.startsWith(this.path+'/')&&p.split('/').length===this.path.split('/').length+1);
    rows=rows.filter(([,r])=>this.filters.every(([k,op,v])=>op==='=='?r[k]===v:op==='in'?v.includes(r[k]):op==='>='?typeof r[k]===typeof v&&r[k]>=v:op==='<='?typeof r[k]===typeof v&&r[k]<=v:false));
    const field=([p,r]:typeof rows[number],k:string)=>k==='__name__'?p.split('/').at(-1):r[k];
    const compare=(x:any,y:any)=>x<y?-1:x>y?1:0;
    rows.sort((a,b)=>{for(const [k,d] of this.orders){const c=compare(field(a,k),field(b,k))*(d==='desc'?-1:1);if(c)return c;}return 0;});
    if(this.after.length)rows=rows.filter(row=>{for(let i=0;i<this.orders.length;i++){const [k,d]=this.orders[i];const c=compare(field(row,k),this.after[i])*(d==='desc'?-1:1);if(c)return c>0;}return false;});
    const docs=await Promise.all(rows.slice(0,this.maximum).map(([p])=>new Ref(this.db,p).get()));return {docs,size:docs.length,empty:docs.length===0};
  }
}
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
