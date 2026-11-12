import type {Firestore} from 'firebase-admin/firestore';
import {messageOperationId,MessagingError} from './customerOperationsMessaging.js';
export async function claimEmailDelivery(db:Firestore,businessId:string,conversationId:string,messageId:string,retry=false){
 const conversation=db.collection('customerOperationsConversations').doc(conversationId),message=conversation.collection('messages').doc(messageId),lease=db.collection('customerOperationsDeliveryLeases').doc(messageOperationId('email',businessId,conversationId,messageId));
 return db.runTransaction(async tx=>{
  const [thread,current,existing]=await Promise.all([tx.get(conversation),tx.get(message),tx.get(lease)]);
  if(!thread.exists||thread.get('businessId')!==businessId||!current.exists||current.get('channel')!=='email'||current.get('visibility')!=='customer')throw new MessagingError(404,'Email message not found.');
  if(current.get('deliveryStatus')==='sent')return {claimed:false,lease};
  if(existing.exists&&!(retry&&existing.get('state')==='failed'))throw new MessagingError(409,'Delivery is already processing or uncertain. Reconcile the SMTP result before sending again.');
  if(current.get('deliveryStatus')==='failed')tx.update(message,{deliveryStatus:'pending',deliveryError:null});
  tx.set(lease,{businessId,conversationId,messageId,state:'sending',attempts:(existing.get('attempts')||0)+1,startedAt:new Date().toISOString()});
  return {claimed:true,lease};
 });
}
export function definitiveSmtpFailure(error:unknown){const e=error as {responseCode?:number;code?:string};return Boolean(e&&((typeof e.responseCode==='number'&&e.responseCode>=400)||['ECONNREFUSED','ENOTFOUND','EAI_AGAIN','EAUTH'].includes(e.code||'')));}
