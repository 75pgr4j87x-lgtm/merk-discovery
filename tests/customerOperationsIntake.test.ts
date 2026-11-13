import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {MemoryDB} from './helpers/memoryFirestore.js';
import {submitGuestIssue,intakeInput} from '../customerOperationsIntake.js';
const input={name:'Guest Example',subject:'Cannot open invoice',description:'The invoice button does not open the document.'};
function fixture(){const db=new MemoryDB();db.rows.set('customerOperationsBusinesses/business-a',{name:'Example',status:'active',guestIntakeEnabled:true});return db;}
test('guest intake atomically creates a customer, ticket and customer-authored conversation; retry is idempotent',async()=>{
 const db=fixture(),token=randomBytes(32).toString('base64url');const a=await submitGuestIssue(db.firestore(),'business-a',token,input),b=await submitGuestIssue(db.firestore(),'business-a',token,input);assert.deepEqual(a,b);
 const rows=[...db.rows.entries()];assert.equal(rows.filter(([p])=>/^customerOperationsCustomers\/[^/]+$/.test(p)).length,1);assert.equal(rows.filter(([p])=>/^customerOperationsTickets\/[^/]+$/.test(p)).length,1);
 const conversation=rows.find(([p])=>/^customerOperationsConversations\/[^/]+$/.test(p))![1];assert.notEqual(conversation.customerLinkTokenHash,token);assert.equal(conversation.customerEmail,'');
 const ticket=rows.find(([p])=>/^customerOperationsTickets\/[^/]+$/.test(p))![1];assert.equal(ticket.firstResponseAt,null);assert.ok(ticket.slaDueAt);
 const message=rows.find(([p])=>p.includes('/messages/'))![1];assert.equal(message.authorType,'customer');assert.equal(message.visibility,'customer');
 await assert.rejects(()=>submitGuestIssue(db.firestore(),'business-a',token,{...input,name:'Different person'}),/already used/);
});
test('same-name guests remain separate; disabled and cross-business submissions fail closed',async()=>{
 const db=fixture(),token=randomBytes(32).toString('base64url');await submitGuestIssue(db.firestore(),'business-a',token,input);await submitGuestIssue(db.firestore(),'business-a',randomBytes(32).toString('base64url'),input);
 assert.equal([...db.rows.keys()].filter(p=>/^customerOperationsCustomers\/[^/]+$/.test(p)).length,2);
 db.rows.set('customerOperationsBusinesses/business-b',{status:'active',guestIntakeEnabled:true});await assert.rejects(()=>submitGuestIssue(db.firestore(),'business-b',token,input),/already used/);
 db.rows.set('customerOperationsBusinesses/business-a',{status:'active',guestIntakeEnabled:false});await assert.rejects(()=>submitGuestIssue(db.firestore(),'business-a',randomBytes(32).toString('base64url'),input),/unavailable/);
});
test('guest intake rejects malformed credentials and input',async()=>{
 const db=fixture();assert.throws(()=>intakeInput({...input,name:'x'}));assert.throws(()=>intakeInput({...input,description:'x'.repeat(3001)}));await assert.rejects(()=>submitGuestIssue(db.firestore(),'business-a','guess',input),/tracking key/);
});
