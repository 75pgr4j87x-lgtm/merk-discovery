import {randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {AccessError,CustomerOperationsAccessStore} from './customerOperationsAccess.js';
import {messageOperationId} from './customerOperationsMessaging.js';
import type {CustomerOperationsBusinessMembership} from './src/types/customerOperations.js';

export async function isStudioSuperAdmin(db:Firestore,email:string,uid:string,configuredOwner:string|null){
  if(!configuredOwner||email.trim().toLowerCase()!==configuredOwner.trim().toLowerCase())return false;
  await new CustomerOperationsAccessStore(db).bindOwner(email.trim().toLowerCase(),uid);
  return true;
}
export class CustomerOperationsAdminAccess {
  constructor(private db:Firestore){}
  private sessions(uid:string){return this.db.collection('customerOperationsAdminSessions').doc(messageOperationId('super_admin',uid)).collection('businesses');}
  private ref(uid:string,businessId:string){return this.sessions(uid).doc(businessId);}
  async open(input:{uid:string;email:string;businessId:string;purpose:string}){
    const purpose=input.purpose.trim();
    if(!/^[0-9a-f-]{36}$/i.test(input.businessId)||purpose.length<10||purpose.length>500)throw new AccessError(400,'Choose a business and record an administrative purpose of 10–500 characters.');
    const now=new Date().toISOString(),expiresAt=new Date(Date.now()+30*60000).toISOString();
    await this.db.runTransaction(async tx=>{
      const business=await tx.get(this.db.collection('customerOperationsBusinesses').doc(input.businessId));
      if(!business.exists||business.get('status')!=='active')throw new AccessError(404,'Active business not found.');
      tx.set(this.ref(input.uid,input.businessId),{uid:input.uid,email:input.email,businessId:input.businessId,purpose,createdAt:now,expiresAt});
      tx.create(this.db.collection('customerOperationsAuditLogs').doc(randomUUID()),{action:'super_admin_business_session_opened',actorUid:input.uid,actorEmail:input.email,businessId:input.businessId,purpose,createdAt:now,expiresAt});
    });
    return {businessId:input.businessId,purpose,expiresAt};
  }
  async active(uid:string,businessId:string){
    if(!/^[0-9a-f-]{36}$/i.test(businessId))return null;
    const [session,business]=await Promise.all([this.ref(uid,businessId).get(),this.db.collection('customerOperationsBusinesses').doc(businessId).get()]);
    if(!session.exists||session.get('uid')!==uid||session.get('businessId')!==businessId||session.get('expiresAt')<=new Date().toISOString()||!business.exists||business.get('status')!=='active')return null;
    return {businessId,businessName:business.get('name') as string,purpose:session.get('purpose') as string,expiresAt:session.get('expiresAt') as string,createdAt:session.get('createdAt') as string};
  }
  async memberships(uid:string,email:string):Promise<CustomerOperationsBusinessMembership[]>{
    const sessions=await this.sessions(uid).where('expiresAt','>',new Date().toISOString()).orderBy('expiresAt','desc').limit(100).get();
    const memberships=await Promise.all(sessions.docs.map(async record=>{
      const session=await this.active(uid,record.get('businessId'));if(!session)return null;
      return {businessId:session.businessId,businessName:session.businessName,email,uid,role:'business_owner' as const,active:true,createdAt:session.createdAt,invitedBy:'audited_super_admin_access',administrativeAccess:{purpose:session.purpose,expiresAt:session.expiresAt}};
    }));
    return memberships.filter((m):m is NonNullable<typeof m>=>m!==null);
  }
  async record(uid:string,email:string,businessId:string,method:string,path:string){
    if(!/^[0-9a-f-]{36}$/i.test(businessId))throw new AccessError(404,'Business workspace not found.');
    return this.db.runTransaction(async tx=>{
      const [session,business]=await Promise.all([tx.get(this.ref(uid,businessId)),tx.get(this.db.collection('customerOperationsBusinesses').doc(businessId))]);
      if(!session.exists||session.get('uid')!==uid||session.get('businessId')!==businessId||session.get('expiresAt')<=new Date().toISOString()||!business.exists||business.get('status')!=='active')throw new AccessError(403,'Start or renew an audited administrative session for this business.');
      tx.create(this.db.collection('customerOperationsAuditLogs').doc(randomUUID()),{action:'super_admin_business_request',actorUid:uid,actorEmail:email,businessId,purpose:session.get('purpose'),method,path:path.split('?')[0],createdAt:new Date().toISOString()});
      return {businessId,purpose:session.get('purpose'),expiresAt:session.get('expiresAt')};
    });
  }
  async close(uid:string,email:string,businessId:string){
    await this.db.runTransaction(async tx=>{const ref=this.ref(uid,businessId),session=await tx.get(ref);if(!session.exists||session.get('uid')!==uid)throw new AccessError(404,'Administrative session not found.');tx.update(ref,{expiresAt:new Date().toISOString()});tx.create(this.db.collection('customerOperationsAuditLogs').doc(randomUUID()),{action:'super_admin_business_session_closed',actorUid:uid,actorEmail:email,businessId,createdAt:new Date().toISOString()});});
  }
}
