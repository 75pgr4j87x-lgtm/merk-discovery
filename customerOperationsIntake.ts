import express from 'express';
import {createHash,randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {applyTicketOperations} from './customerOperationsOperations.js';
import {messageOperationId} from './customerOperationsMessaging.js';
import {consumeOperationsRateLimit} from './customerOperationsSecurity.js';
import type {CustomerOperationsTicket} from './src/types/customerOperations.js';

export class IntakeError extends Error {constructor(public status:number,message:string){super(message);}}
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function intakeInput(body:unknown){
 const b=body as Record<string,unknown>;
 if(!b||typeof b!=='object')throw new IntakeError(400,'Enter your name, subject and issue.');
 const result={} as Record<'name'|'subject'|'description',string>;
 for(const [key,max] of [['name',100],['subject',180],['description',3000]] as const){const v=b[key];if(typeof v!=='string'||v.trim().length<2||v.trim().length>max)throw new IntakeError(400,`Enter a ${key} between 2 and ${max} characters.`);result[key]=v.trim();}
 return result;
}
export async function submitGuestIssue(db:Firestore,businessId:string,token:string,body:unknown){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new IntakeError(400,'A private tracking key is required. Reload this page.');
 const input=intakeInput(body),key=hash(token),fingerprint=hash(JSON.stringify(input)),now=new Date().toISOString();
 const root=db.collection('customerOperationsBusinesses').doc(businessId),receipt=db.collection('customerOperationsGuestSubmissions').doc(key);
 return db.runTransaction(async tx=>{
  const [business,existing,counter]=await Promise.all([tx.get(root),tx.get(receipt),tx.get(root.collection('counters').doc('tickets'))]);
  if(!business.exists||business.get('status')!=='active'||business.get('guestIntakeEnabled')!==true)throw new IntakeError(404,'This reporting page is unavailable.');
  if(existing.exists){if(existing.get('businessId')!==businessId||existing.get('fingerprint')!==fingerprint)throw new IntakeError(409,'This submission was already used. Open a new report to submit another issue.');return {ticketNumber:existing.get('ticketNumber') as string};}
  const customerId=randomUUID(),ticketId=randomUUID(),conversationId=randomUUID(),messageId=randomUUID(),actor='guest:'+customerId;
  const count=(Number(counter.get('count'))||1000)+1;
  const ticket:CustomerOperationsTicket={id:ticketId,businessId,ticketNumber:`TKT-${count}`,ticketNumberSearch:`tkt-${count}`,customerId,customerName:input.name,customerEmail:'',subject:input.subject,subjectSearch:input.subject.toLowerCase(),description:input.description,category:'General',tags:['guest'],priority:'normal',status:'new',assignedAgent:'',assignedTeam:'',source:'in_app',createdAt:now,updatedAt:now,firstResponseAt:null,resolvedAt:null,createdBy:actor};
  Object.assign(ticket,await applyTicketOperations(db,tx,ticket,null,ticketId,actor,'created',now));
  tx.create(db.collection('customerOperationsCustomers').doc(customerId),{id:customerId,businessId,name:input.name,email:'',phone:'',whatsapp:'',company:'',status:'active',tags:['guest'],assignedOwner:'',nameSearch:input.name.toLowerCase(),emailSearch:'',companySearch:'',createdAt:now,updatedAt:now,lastInteractionAt:now,createdBy:actor});
  const t=db.collection('customerOperationsTickets').doc(ticketId);tx.create(t,ticket);tx.create(t.collection('events').doc(ticketId),{id:ticketId,action:'ticket_created',actorEmail:actor,changes:{},createdAt:now});
  tx.set(root.collection('counters').doc('tickets'),{count});
  const c=db.collection('customerOperationsConversations').doc(conversationId);
  tx.create(c,{id:conversationId,businessId,customerId,customerName:input.name,customerEmail:'',ticketId,ticketIds:[ticketId],assignedAgent:ticket.assignedAgent,revision:0,ticketNumber:ticket.ticketNumber,subject:input.subject,subjectSearch:input.subject.toLowerCase(),status:'open',lastMessagePreview:input.description.slice(0,180),createdAt:now,updatedAt:now,createdBy:actor,customerLinkTokenHash:key,customerLinkExpiresAt:new Date(Date.now()+7*86400000).toISOString()});
  tx.create(c.collection('messages').doc(messageId),{id:messageId,conversationId,authorType:'customer',authorEmail:'',visibility:'customer',channel:'in_app',deliveryStatus:'not_applicable',deliveryError:null,externalMessageId:null,body:input.description,createdAt:now});
  tx.create(db.collection('customerOperationsConversationTickets').doc(messageOperationId(businessId,conversationId,ticketId)),{businessId,conversationId,ticketId,customerId,createdAt:now,createdBy:actor});
  tx.create(db.collection('customerOperationsActivity').doc(ticketId),{id:ticketId,businessId,customerId,ticketId,action:'guest_issue_submitted',actorEmail:actor,createdAt:now});
  tx.create(receipt,{businessId,fingerprint,ticketNumber:ticket.ticketNumber,createdAt:now});
  return {ticketNumber:ticket.ticketNumber};
 });
}
export function intakeRouter(db:()=>Firestore){
 const router=express.Router();
 router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
 router.use('/:businessId',async(req,res,next)=>{
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(req.params.businessId))return res.status(404).json({error:'Reporting page unavailable.'});
  try{const allowed=await consumeOperationsRateLimit(db(),`intake-ip:${req.socket.remoteAddress}`,req.method==='GET'?120:15)&&await consumeOperationsRateLimit(db(),`intake-business:${req.params.businessId}`,req.method==='GET'?300:60);if(!allowed)return res.status(429).set('Retry-After','60').json({error:'Too many requests. Please try again in a minute.'});next();}catch{return res.status(503).json({error:'Support is temporarily unavailable.'});}
 });
 router.get('/:businessId',async(req,res)=>{try{const b=await db().collection('customerOperationsBusinesses').doc(req.params.businessId).get();if(!b.exists||b.get('status')!=='active'||b.get('guestIntakeEnabled')!==true)return res.status(404).json({error:'This reporting page is unavailable.'});return res.json({name:b.get('name')});}catch{return res.status(503).json({error:'Support is temporarily unavailable.'});}});
 router.post('/:businessId',async(req,res)=>{try{return res.status(201).json(await submitGuestIssue(db(),req.params.businessId,req.get('x-customer-conversation-token')||'',req.body));}catch(e){return res.status(e instanceof IntakeError?e.status:503).json({error:e instanceof IntakeError?e.message:'Your report could not be saved. Please retry.'});}});
 return router;
}
