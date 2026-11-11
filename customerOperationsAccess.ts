import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import type {CustomerOperationsBusinessMembership,CustomerOperationsPlatformMembership,CustomerOperationsBusinessRole} from './src/types/customerOperations.js';
export const emailKey=(email:string)=>createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export class AccessError extends Error { constructor(public status:number,message:string){super(message);} }
export class CustomerOperationsAccessStore {
  constructor(private db:Firestore){}
  async bindOwner(email:string,uid:string){
    const ref=this.db.collection('customerOperationsPlatformSettings').doc('owner');
    await this.db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists&&(s.get('uid')!==uid||s.get('email')!==email))throw new AccessError(403,'Platform owner identity does not match the bound account. Recover access through server administration.');if(!s.exists)tx.create(ref,{uid,email,createdAt:new Date().toISOString()});});
  }
  async resolve(email:string,uid:string){
    const [platform,businesses]=await Promise.all([
      this.db.collection('customerOperationsPlatformMemberships').doc(emailKey(email)).get(),
      this.db.collection('customerOperationsBusinessMemberships').where('uid','==',uid).get(),
    ]);
    const platformMember=platform.exists&&platform.get('active')&&platform.get('uid')===uid&&platform.get('email')===email?platform.data() as CustomerOperationsPlatformMembership:null;
    if(platformMember)return {platformMember,businesses:[] as CustomerOperationsBusinessMembership[]};
    const memberships=businesses.docs.filter(d=>d.get('active')&&d.get('email')===email).map(d=>d.data() as CustomerOperationsBusinessMembership);
    const resolved=await Promise.all(memberships.map(async m=>{const b=await this.db.collection('customerOperationsBusinesses').doc(m.businessId).get();return b.exists&&b.get('status')==='active'?{...m,businessName:b.get('name') as string}:null;}));
    return {platformMember:null,businesses:resolved.filter((m):m is CustomerOperationsBusinessMembership=>m!==null)};
  }
  async invite(input:{scope:'platform'|'business';businessId?:string;email:string;role:string;actor:string}){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)||input.email.length>254)throw new AccessError(400,'A valid email is required.');
    if(input.scope==='business'&&(!input.businessId||!/^[0-9a-f-]{36}$/.test(input.businessId)||!['business_owner','business_manager','business_support_agent'].includes(input.role)))throw new AccessError(400,'Invalid business invitation.');
    if(input.scope==='platform'&&input.role!=='platform_support_agent')throw new AccessError(400,'Invalid platform invitation role.');
    const token=randomBytes(32).toString('base64url'),id=randomUUID(),now=new Date().toISOString();
    const record={id,scope:input.scope,businessId:input.businessId||null,email:input.email.trim().toLowerCase(),role:input.role,actor:input.actor,tokenHash:tokenHash(token),createdAt:now,expiresAt:new Date(Date.now()+7*86400000).toISOString(),claimedUid:null,revokedAt:null};
    const memberRef=input.scope==='platform'?this.db.collection('customerOperationsPlatformMemberships').doc(emailKey(record.email)):this.db.collection('customerOperationsBusinessMemberships').doc(`${input.businessId}_${emailKey(record.email)}`);
    await this.db.runTransaction(async tx=>{
      const [member,business]=await Promise.all([tx.get(memberRef),input.businessId?tx.get(this.db.collection('customerOperationsBusinesses').doc(input.businessId)):Promise.resolve(null)]);
      if(input.scope==='business'&&(!business?.exists||business.get('status')!=='active'))throw new AccessError(404,'Active business not found.');
      if(member.exists&&member.get('active')&&member.get('role')==='business_owner'&&input.role!=='business_owner')throw new AccessError(409,'The business owner cannot be downgraded.');
      tx.create(this.db.collection('customerOperationsInvitations').doc(id),record);
      tx.create(this.db.collection('customerOperationsAuditLogs').doc(randomUUID()),{action:'invitation_created',actorEmail:input.actor,targetId:id,businessId:input.businessId||null,createdAt:now});
    });
    return {id,token,expiresAt:record.expiresAt};
  }
  async claim(token:string,email:string,uid:string){
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new AccessError(404,'Invitation is invalid or expired.');
    const query=await this.db.collection('customerOperationsInvitations').where('tokenHash','==',tokenHash(token)).limit(1).get();
    if(query.empty)throw new AccessError(404,'Invitation is invalid or expired.');
    return this.db.runTransaction(async tx=>{
      const ref=query.docs[0].ref,s=await tx.get(ref),v=s.data()!;
      if(v.revokedAt||v.expiresAt<=new Date().toISOString()||v.email!==email)throw new AccessError(403,'This invitation requires the invited verified account and must be unexpired.');
      if(v.claimedUid) {if(v.claimedUid===uid)return {success:true};throw new AccessError(409,'Invitation has already been claimed.');}
      const memberRef=v.scope==='platform'?this.db.collection('customerOperationsPlatformMemberships').doc(emailKey(email)):this.db.collection('customerOperationsBusinessMemberships').doc(`${v.businessId}_${emailKey(email)}`);
      const [member,platform,businesses,business]=await Promise.all([
        tx.get(memberRef),tx.get(this.db.collection('customerOperationsPlatformMemberships').doc(emailKey(email))),tx.get(this.db.collection('customerOperationsBusinessMemberships').where('email','==',email)),v.scope==='business'?tx.get(this.db.collection('customerOperationsBusinesses').doc(v.businessId)):Promise.resolve(null),
      ]);
      if(v.scope==='business'&&(!business?.exists||business.get('status')!=='active'))throw new AccessError(404,'Business is inactive.');
      if((v.scope==='platform'&&businesses.docs.some(d=>d.get('active')))||(v.scope==='business'&&platform.exists&&platform.get('active')))throw new AccessError(409,'Platform and business memberships cannot be combined.');
      if(member.exists&&member.get('uid')&&member.get('uid')!==uid)throw new AccessError(409,'This membership is bound to another account. Revoke the old membership before inviting a replacement.');
      if(member.exists&&member.get('role')==='business_owner'&&v.role!=='business_owner')throw new AccessError(409,'Owner membership cannot be downgraded.');
      const now=new Date().toISOString();
      tx.set(memberRef,{email,uid,role:v.role,active:true,createdAt:member.exists?member.get('createdAt'):now,invitedBy:v.actor,...(v.scope==='business'?{businessId:v.businessId,businessName:business!.get('name')}:{})});
      tx.update(ref,{claimedUid:uid,claimedAt:now});tx.create(this.db.collection('customerOperationsAuditLogs').doc(randomUUID()),{action:'invitation_claimed',actorEmail:email,actorUid:uid,targetId:ref.id,businessId:v.businessId,createdAt:now});
      return {success:true};
    });
  }
  async revoke(id:string,actor:string,canManage:(v:{scope:string;businessId:string|null})=>boolean){
    if(!/^[0-9a-f-]{36}$/.test(id))throw new AccessError(404,'Invitation not found.');
    await this.db.runTransaction(async tx=>{const ref=this.db.collection('customerOperationsInvitations').doc(id),s=await tx.get(ref);if(!s.exists||!canManage(s.data() as {scope:string;businessId:string|null}))throw new AccessError(404,'Invitation not found.');tx.update(ref,{revokedAt:new Date().toISOString()});tx.create(this.db.collection('customerOperationsAuditLogs').doc(randomUUID()),{action:'invitation_revoked',actorEmail:actor,targetId:id,createdAt:new Date().toISOString()});});
  }
}
