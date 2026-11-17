import {createHash,timingSafeEqual} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
export async function consumeOperationsRateLimit(db:Firestore,key:string,limit:number,windowMs=60000){
  const id=createHash('sha256').update(key).digest('hex'),ref=db.collection('customerOperationsRateLimits').doc(id);
  return db.runTransaction(async tx=>{const s=await tx.get(ref),now=Date.now();if(s.exists&&s.get('windowStartedAt')+windowMs>now){if(s.get('count')>=limit)return false;tx.update(ref,{count:s.get('count')+1});}else tx.set(ref,{windowStartedAt:now,count:1,expiresAt:new Date(now+windowMs)});return true;});
}
export function secretMatches(value:string,expected:string|undefined){if(!expected||expected.length<32)return false;const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export function validRequestId(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z0-9._:-]{8,128}$/.test(value);}
