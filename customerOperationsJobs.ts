import type {Firestore} from 'firebase-admin/firestore';
import {OperationsStore} from './customerOperationsOperations.js';
import {randomUUID} from 'node:crypto';
export async function runOperationsJobs(db:Firestore){
 const state=db.collection('customerOperationsJobs').doc('scheduler'),worker=randomUUID(),now=Date.now();
 const leased=await db.runTransaction(async tx=>{const s=await tx.get(state);if(s.exists&&s.get('leasedUntil')>now)return null;tx.set(state,{worker,leasedUntil:now+240000,cursor:s.exists?s.get('cursor')||'':''});return s.exists?s.get('cursor')||'':'';});
 if(leased===null)return {busy:true};
 let query=db.collection('customerOperationsBusinesses').where('status','==','active').orderBy('id').limit(20);if(leased)query=query.startAfter(leased);
 const businesses=await query.get(),store=new OperationsStore(db);let checked=0;const errors:Array<{businessId:string;error:string}>=[];
 for(const business of businesses.docs){try{let cursor=null as {dueAt:string;id:string}|null;for(let batch=0;batch<10;batch++){const result=await store.checkDeadlines(business.id,'scheduler',cursor);checked+=result.processed;cursor=result.nextCursor;if(!cursor)break;}}catch{errors.push({businessId:business.id,error:'Deadline processing failed; will retry on a later run.'});}}
 const cursor=businesses.size===20?businesses.docs.at(-1)!.id:'';
 await db.runTransaction(async tx=>{const s=await tx.get(state);if(s.get('worker')===worker)tx.set(state,{worker:null,leasedUntil:0,cursor,lastRunAt:new Date().toISOString(),checked,errors});});
 return {businesses:businesses.size,checked,more:Boolean(cursor),errors};
}
