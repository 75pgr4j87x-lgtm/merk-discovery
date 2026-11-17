import {createHash} from 'node:crypto';
import type {Firestore,Transaction} from 'firebase-admin/firestore';
export class MessagingError extends Error {constructor(public status:number,message:string){super(message);}}
export const messageOperationId=(...parts:string[])=>{const h=createHash('sha256').update(JSON.stringify(parts)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
export const linkedTicketIds=(v:{ticketId?:string|null;ticketIds?:string[]})=>[...new Set([...(v.ticketIds||[]),...(v.ticketId?[v.ticketId]:[])])];
export function bufferedTransaction(tx:Transaction){
  const writes:Array<()=>void>=[];
  const proxy=new Proxy(tx,{get(target,key){if(['create','set','update','delete'].includes(String(key)))return (...args:unknown[])=>{writes.push(()=>Reflect.get(target,key).apply(target,args));return proxy;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  return {transaction:proxy,flush:()=>writes.forEach(write=>write())};
}
export async function linkConversationTicket(db:Firestore,input:{businessId:string;conversationId:string;ticketId:string;actor:string;remove?:boolean}){
  const c=db.collection('customerOperationsConversations').doc(input.conversationId),t=db.collection('customerOperationsTickets').doc(input.ticketId);
  return db.runTransaction(async tx=>{
    const [conversation,ticket]=await Promise.all([tx.get(c),tx.get(t)]);
    if(!conversation.exists||!ticket.exists||conversation.get('businessId')!==input.businessId||ticket.get('businessId')!==input.businessId||conversation.get('customerId')!==ticket.get('customerId'))throw new MessagingError(404,'Conversation and ticket must belong to the same customer in this workspace.');
    const ids=linkedTicketIds(conversation.data()!);const next=input.remove?ids.filter(id=>id!==input.ticketId):[...new Set([...ids,input.ticketId])];
    if(next.length>20)throw new MessagingError(422,'A conversation can link at most 20 tickets.');
    const relation=db.collection('customerOperationsConversationTickets').doc(messageOperationId(input.businessId,c.id,t.id));
    if(input.remove)tx.delete(relation);else tx.set(relation,{businessId:input.businessId,conversationId:c.id,ticketId:t.id,customerId:ticket.get('customerId'),createdAt:new Date().toISOString(),createdBy:input.actor});
    tx.update(c,{ticketIds:next,revision:(conversation.get('revision')||0)+1,...(input.remove&&conversation.get('ticketId')===input.ticketId?{ticketId:null,ticketNumber:null}:{}),updatedAt:new Date().toISOString()});
    tx.create(t.collection('events').doc(),{id:messageOperationId(randomKey()),action:input.remove?'conversation_unlinked':'conversation_linked',actorEmail:input.actor,changes:{conversationId:{from:input.remove?c.id:'',to:input.remove?'':c.id}},createdAt:new Date().toISOString()});
    return {ticketIds:next};
  });
}
function randomKey(){return `${Date.now()}:${Math.random()}`;}
export async function assignConversation(db:Firestore,input:{businessId:string;conversationId:string;agent:string;actor:string;manager:boolean}){
  return db.runTransaction(async tx=>{const ref=db.collection('customerOperationsConversations').doc(input.conversationId),s=await tx.get(ref);if(!s.exists||s.get('businessId')!==input.businessId)throw new MessagingError(404,'Conversation not found.');if(!input.manager&&((input.agent&&input.agent!==input.actor)||(!input.agent&&s.get('assignedAgent')!==input.actor)))throw new MessagingError(403,'Agents may only assign to themselves or release their own conversation.');if(input.agent){const members=await tx.get(db.collection('customerOperationsBusinessMemberships').where('businessId','==',input.businessId).where('email','==',input.agent));if(!members.docs.some(d=>d.get('active')&&d.get('uid')))throw new MessagingError(409,'Assignee is not an active claimed business member.');}tx.update(ref,{assignedAgent:input.agent,revision:(s.get('revision')||0)+1,updatedAt:new Date().toISOString()});tx.create(db.collection('customerOperationsAuditLogs').doc(),{action:'conversation_assigned',businessId:input.businessId,conversationId:input.conversationId,actorEmail:input.actor,assignedAgent:input.agent,createdAt:new Date().toISOString()});return {success:true};});
}
