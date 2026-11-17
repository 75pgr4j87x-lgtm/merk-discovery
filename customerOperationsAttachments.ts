import {randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import type {Bucket} from '@google-cloud/storage';
export class AttachmentError extends Error{constructor(public status:number,message:string){super(message);}}
export function inspectAttachment(value:unknown){
  const v=value as {name:string;data:string};
  if(!v||typeof v.name!=='string'||typeof v.data!=='string'||v.data.length>2800000||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.data))throw new AttachmentError(400,'Upload a valid file of at most 2 MB.');
  const bytes=Buffer.from(v.data,'base64');if(!bytes.length||bytes.length>2*1024*1024||bytes.toString('base64')!==v.data)throw new AttachmentError(400,'Invalid or oversized file.');
  const hex=bytes.subarray(0,16).toString('hex');
  const type=hex.startsWith('89504e470d0a1a0a')?'image/png':hex.startsWith('ffd8ff')?'image/jpeg':bytes.subarray(0,6).toString().match(/^GIF8[79]a$/)?'image/gif':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':null;
  if(!type)throw new AttachmentError(400,'Only PNG, JPEG, GIF, WebP and PDF attachments are supported.');
  const extension=({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','application/pdf':'pdf'} as Record<string,string>)[type];
  const stem=v.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120).replace(/\.[^.]*$/,'')||'attachment';
  return {bytes,type,name:`${stem}.${extension}`};
}
export async function saveAttachment(db:Firestore,bucket:Bucket,input:{businessId:string;conversationId:string;visibility:'customer'|'internal';owner:string;file:unknown}){
  const file=inspectAttachment(input.file),id=randomUUID(),key=`customer-operations/${input.businessId}/${input.conversationId}/${id}`;
  const metadata={id,businessId:input.businessId,conversationId:input.conversationId,visibility:input.visibility,owner:input.owner,name:file.name,mime:file.type,size:file.bytes.length,storageKey:key,createdAt:new Date().toISOString(),messageId:null};
  const object=bucket.file(key);await object.save(file.bytes,{resumable:false,validation:'crc32c',metadata:{contentType:file.type,cacheControl:'private, no-store'}});
  try{await db.collection('customerOperationsAttachments').doc(id).create(metadata);}catch(e){await object.delete().catch(()=>{});throw e;}
  return {id,name:metadata.name,mime:metadata.mime,size:metadata.size};
}
export async function loadAttachment(db:Firestore,bucket:Bucket,businessId:string,id:string,conversationId?:string,publicOnly=false){
  if(!/^[0-9a-f-]{36}$/.test(id))throw new AttachmentError(404,'Attachment not found.');
  const snapshot=await db.collection('customerOperationsAttachments').doc(id).get(),a=snapshot.data();
  if(!a||a.businessId!==businessId||!a.messageId||(conversationId&&a.conversationId!==conversationId)||(publicOnly&&a.visibility!=='customer'))throw new AttachmentError(404,'Attachment not found.');
  const [conversation,message]=await Promise.all([db.collection('customerOperationsConversations').doc(a.conversationId).get(),db.collection('customerOperationsConversations').doc(a.conversationId).collection('messages').doc(a.messageId).get()]);
  if(!conversation.exists||conversation.get('businessId')!==businessId||!message.exists||(publicOnly&&(message.get('visibility')!=='customer'||message.get('channel')==='email'&&message.get('deliveryStatus')!=='sent'))||!message.get('attachments')?.some((item:{id:string})=>item.id===id))throw new AttachmentError(404,'Attachment not found.');
  const [bytes]=await bucket.file(a.storageKey).download({validation:'crc32c'});return {bytes,name:a.name as string,mime:a.mime as string};
}
