import express from 'express';
import {randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {messageOperationId} from './customerOperationsMessaging.js';
import {validRequestId} from './customerOperationsSecurity.js';
export class PlatformError extends Error{constructor(public status:number,message:string){super(message);}}
const root=(db:Firestore)=>db.collection('customerOperationsPlatform').doc('workspace');
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export type PlatformActor={email:string;role:'platform_super_admin'|'platform_support_agent'|'business_owner'|'business_manager'|'business_support_agent';businessId?:string};
const isStaff=(a:PlatformActor)=>a.role==='platform_super_admin'||a.role==='platform_support_agent';
const canRead=(a:PlatformActor,t:Record<string,unknown>)=>isStaff(a)?a.role==='platform_super_admin'||t.assignedAgent===a.email||!t.assignedAgent:t.businessId===a.businessId;
export class PlatformStore{
 constructor(private db:Firestore){}
 async list(actor:PlatformActor,cursor=''){
   let q=root(this.db).collection('tickets').orderBy('updatedAt','desc').orderBy('__name__','desc').limit(51);
   if(!isStaff(actor))q=q.where('businessId','==',actor.businessId);
   else if(actor.role==='platform_support_agent')q=q.where('assignedAgent','in',['',actor.email]);
   if(cursor){try{const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(typeof c.updatedAt!=='string'||typeof c.id!=='string'||!Number.isFinite(Date.parse(c.updatedAt))||!/^[0-9a-f-]{36}$/.test(c.id))throw new Error();q=q.startAfter(c.updatedAt,c.id);}catch{throw new PlatformError(400,'Invalid cursor.');}}
   const snapshot=await q.get(),docs=snapshot.docs.slice(0,50),last=docs.at(-1);
   return {items:docs.map(d=>d.data()),nextCursor:snapshot.size>50&&last?Buffer.from(JSON.stringify({updatedAt:last.get('updatedAt'),id:last.id})).toString('base64url'):null};
 }
 async create(actor:PlatformActor,input:unknown,key:string){
   const v=input as Record<string,unknown>,subject=text(v?.subject,180),body=text(v?.body,5000);if(!subject||!body||!validRequestId(key)||!['low','normal','high','urgent'].includes(String(v?.priority)))throw new PlatformError(400,'Subject, description, priority and Idempotency-Key are required.');
   const businessId=isStaff(actor)?text(v.businessId,80):actor.businessId;if(!businessId||!/^[0-9a-f-]{36}$/.test(businessId))throw new PlatformError(400,'Select a valid business account.');
   const ref=root(this.db).collection('tickets').doc(messageOperationId(actor.email,businessId,key)),counter=root(this.db).collection('counters').doc('tickets'),now=new Date().toISOString();
   return this.db.runTransaction(async tx=>{const [existing,business,count]=await Promise.all([tx.get(ref),tx.get(this.db.collection('customerOperationsBusinesses').doc(businessId)),tx.get(counter)]);if(existing.exists){if(!canRead(actor,existing.data()!)||existing.get('subject')!==subject||existing.get('description')!==body)throw new PlatformError(409,'Idempotency conflict.');return existing.data();}if(!business.exists||business.get('status')!=='active')throw new PlatformError(404,'Active business account not found.');
     const number=(count.exists?count.get('count'):1000)+1,ticket={id:ref.id,scope:'platform',businessId,businessName:business.get('name'),reference:`PLT-${number}`,subject,description:body,priority:v.priority,status:'new',assignedAgent:'',createdAt:now,updatedAt:now,createdBy:actor.email,resolvedAt:null,firstResponseAt:null};tx.set(counter,{count:number});tx.create(ref,ticket);tx.create(ref.collection('messages').doc(),{scope:'platform',body,visibility:'customer',authorEmail:actor.email,authorType:isStaff(actor)?'staff':'business',createdAt:now});return ticket;});
 }
 async detail(actor:PlatformActor,id:string){
   if(!/^[0-9a-f-]{36}$/.test(id))throw new PlatformError(404,'Platform ticket not found.');const ref=root(this.db).collection('tickets').doc(id),ticket=await ref.get();if(!ticket.exists||!canRead(actor,ticket.data()!))throw new PlatformError(404,'Platform ticket not found.');let q=ref.collection('messages').orderBy('createdAt','desc').limit(100);if(!isStaff(actor))q=q.where('visibility','==','customer');const messages=await q.get();return {ticket:ticket.data(),messages:messages.docs.reverse().map(d=>({id:d.id,...d.data(),...(!isStaff(actor)?{authorEmail:null}:{})}))};
 }
 async update(actor:PlatformActor,id:string,input:unknown){
   if(!isStaff(actor))throw new PlatformError(403,'Platform staff access required.');if(!/^[0-9a-f-]{36}$/.test(id))throw new PlatformError(404,'Ticket not found.');const v=input as Record<string,unknown>,ref=root(this.db).collection('tickets').doc(id);
   return this.db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists||!canRead(actor,s.data()!))throw new PlatformError(404,'Ticket not found.');const changes:Record<string,unknown>={updatedAt:new Date().toISOString()};if(v.status!==undefined){if(!['new','open','in_progress','waiting_on_customer','resolved','closed'].includes(String(v.status)))throw new PlatformError(400,'Invalid status.');changes.status=v.status;if(['resolved','closed'].includes(String(v.status))&&!s.get('resolvedAt'))changes.resolvedAt=changes.updatedAt;else if(!['resolved','closed'].includes(String(v.status)))changes.resolvedAt=null;}
     if(v.assignedAgent!==undefined){const agent=text(v.assignedAgent,254).toLowerCase();if(actor.role!=='platform_super_admin'&&agent!==actor.email)throw new PlatformError(403,'Support agents may only claim tickets for themselves.');if(agent&&agent!==actor.email){const members=await tx.get(this.db.collection('customerOperationsPlatformMemberships').where('email','==',agent));if(!members.docs.some(d=>d.get('active')&&d.get('uid')))throw new PlatformError(400,'Select an active platform agent.');}changes.assignedAgent=agent;}
     if(v.priority!==undefined){if(!['low','normal','high','urgent'].includes(String(v.priority)))throw new PlatformError(400,'Invalid priority.');changes.priority=v.priority;}
     tx.update(ref,changes);tx.create(ref.collection('events').doc(),{scope:'platform',actorEmail:actor.email,changes,createdAt:changes.updatedAt});return {...s.data(),...changes};});
 }
 async message(actor:PlatformActor,id:string,input:unknown,key:string){
   const v=input as Record<string,unknown>,body=text(v?.body,5000),visibility=v?.visibility;if(!body||!validRequestId(key)||!['customer','internal'].includes(String(visibility))||(!isStaff(actor)&&visibility!=='customer'))throw new PlatformError(400,'A valid reply, visibility and Idempotency-Key are required.');if(!/^[0-9a-f-]{36}$/.test(id))throw new PlatformError(404,'Ticket not found.');const ref=root(this.db).collection('tickets').doc(id),message=ref.collection('messages').doc(messageOperationId(actor.email,key));
   return this.db.runTransaction(async tx=>{const [ticket,existing]=await Promise.all([tx.get(ref),tx.get(message)]);if(!ticket.exists||!canRead(actor,ticket.data()!))throw new PlatformError(404,'Ticket not found.');if(existing.exists){if(existing.get('body')!==body||existing.get('visibility')!==visibility)throw new PlatformError(409,'Idempotency conflict.');return existing.data();}if(isStaff(actor)&&v.expectedUpdatedAt!==ticket.get('updatedAt'))throw new PlatformError(409,'Ticket changed. Review the latest replies first.');const now=new Date().toISOString(),data={id:message.id,scope:'platform',body,visibility,authorEmail:actor.email,authorType:isStaff(actor)?'staff':'business',createdAt:now};tx.create(message,data);tx.update(ref,{updatedAt:now,...(!isStaff(actor)&&['closed','resolved'].includes(ticket.get('status'))?{status:'open',resolvedAt:null}:{}),...(isStaff(actor)&&visibility==='customer'&&!ticket.get('firstResponseAt')?{firstResponseAt:now}:{})});return data;});
 }
 async knowledge(actor:PlatformActor,input?:unknown,id=''){
   if(input!==undefined){if(actor.role!=='platform_super_admin')throw new PlatformError(403,'Only the Platform Super Admin can publish platform knowledge.');const v=input as Record<string,unknown>,title=text(v.title,180),body=text(v.body,20000);if(!title||!body||!['draft','published'].includes(String(v.status))||!['internal','business'].includes(String(v.visibility)))throw new PlatformError(400,'Complete article title, body, status and visibility.');if(id&&!/^[0-9a-f-]{36}$/.test(id))throw new PlatformError(400,'Invalid article ID.');const ref=root(this.db).collection('articles').doc(id||randomUUID());await this.db.runTransaction(async tx=>{const existing=await tx.get(ref);if(id&&!existing.exists)throw new PlatformError(404,'Article not found.');tx.set(ref,{id:ref.id,scope:'platform',title,body,status:v.status,visibility:v.visibility,author:existing.exists?existing.get('author'):actor.email,updatedAt:new Date().toISOString()});tx.create(root(this.db).collection('audit').doc(),{action:'platform_article_saved',articleId:ref.id,actor:actor.email,createdAt:new Date().toISOString()});});}
   let q=root(this.db).collection('articles').orderBy('updatedAt','desc').limit(100);if(!isStaff(actor))q=q.where('status','==','published').where('visibility','==','business');const s=await q.get();return s.docs.map(d=>d.data());
 }
 async reports(actor:PlatformActor){if(actor.role!=='platform_super_admin')throw new PlatformError(403,'Only the Platform Super Admin can view platform-wide reports.');const s=await root(this.db).collection('tickets').select('status','priority','assignedAgent','createdAt','firstResponseAt','resolvedAt').limit(5001).get();if(s.size>5000)throw new PlatformError(422,'Platform reports require date aggregation above 5,000 tickets.');const rows=s.docs.map(d=>d.data()),count=(field:string)=>Object.fromEntries([...new Set(rows.map(r=>r[field]||'unassigned'))].map(key=>[key,rows.filter(r=>(r[field]||'unassigned')===key).length]));return {scope:'platform',total:rows.length,byStatus:count('status'),byAgent:count('assignedAgent'),byPriority:count('priority'),generatedAt:new Date().toISOString()};}
}
export function platformRouter(deps:{authorize:express.RequestHandler;store:()=>PlatformStore}){
 const r=express.Router({mergeParams:true}),actor=(res:express.Response)=>res.locals.platformActor as PlatformActor;
 r.use(deps.authorize);
 const handle=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>):express.RequestHandler=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e instanceof PlatformError?e.status:503).json({error:e instanceof PlatformError?e.message:'Platform support unavailable.'});}};
 r.get('/tickets',handle(async(req,res)=>res.json(await deps.store().list(actor(res),typeof req.query.cursor==='string'?req.query.cursor:''))));
 r.post('/tickets',handle(async(req,res)=>res.status(201).json(await deps.store().create(actor(res),req.body,req.get('Idempotency-Key')||''))));
 r.get('/tickets/:id',handle(async(req,res)=>res.json(await deps.store().detail(actor(res),String(req.params.id)))));
 r.patch('/tickets/:id',handle(async(req,res)=>res.json(await deps.store().update(actor(res),String(req.params.id),req.body))));
 r.post('/tickets/:id/messages',handle(async(req,res)=>res.status(201).json(await deps.store().message(actor(res),String(req.params.id),req.body,req.get('Idempotency-Key')||''))));
 r.get('/knowledge',handle(async(_req,res)=>res.json(await deps.store().knowledge(actor(res)))));
 r.post('/knowledge',handle(async(req,res)=>res.status(201).json(await deps.store().knowledge(actor(res),req.body))));
 r.put('/knowledge/:id',handle(async(req,res)=>res.json(await deps.store().knowledge(actor(res),req.body,String(req.params.id)))));
 r.get('/reports',handle(async(_req,res)=>res.json(await deps.store().reports(actor(res)))));
 return r;
}
