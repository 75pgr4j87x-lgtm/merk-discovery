import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {startSmtpFixture} from './helpers/smtpFixture.mjs';
import {sendCustomerOperationsConversationEmail} from '../serverEmailAndExcel.js';

test('real Nodemailer SMTP transport delivers one message to a loopback receiver',async()=>{
 const smtp=await startSmtpFixture(),names=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM','SMTP_SECURE'] as const,previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 try{Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.port),SMTP_USER:'fixture@example.test',SMTP_PASS:randomBytes(16).toString('hex'),SMTP_FROM:'fixture@example.test',SMTP_SECURE:'false'});const id=await sendCustomerOperationsConversationEmail({recipient:'recipient@example.test',subject:'Local E2E transport',body:'A local-only message.',conversationUrl:'http://127.0.0.1/customer-operations/conversations#token=local-fixture'});assert.ok(id);assert.equal(smtp.messages.length,1);assert.ok(smtp.messages[0].includes('A local-only message.'));assert.ok(smtp.messages[0].includes('recipient@example.test'));}
 finally{for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n];}await smtp.close();}
});

test('actual Express webhook routes validate exact raw-body signatures before processing',async()=>{
 const secret=randomBytes(32).toString('hex'),svixKey=randomBytes(32),oldMeta=process.env.META_APP_SECRET,oldEmail=process.env.RESEND_WEBHOOK_SECRET;process.env.META_APP_SECRET=secret;process.env.RESEND_WEBHOOK_SECRET='whsec_'+svixKey.toString('base64');
 const {default:app}=await import('../server.js');const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/customer-operations/webhooks/`;
 try{const body='{ "object": "whatsapp_business_account", "entry": [] }';const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');let r=await fetch(base+'whatsapp',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body});assert.equal(r.status,200);assert.deepEqual(await r.json(),{received:true});r=await fetch(base+'whatsapp',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body:'{}'});assert.equal(r.status,401);
 const payload=JSON.stringify({type:'fixture.ignored'}),timestamp=String(Math.floor(Date.now()/1000)),id='fixture-http';const signed='v1,'+createHmac('sha256',svixKey).update(`${id}.${timestamp}.`).update(payload).digest('base64');r=await fetch(base+'email',{method:'POST',headers:{'Content-Type':'application/json','svix-id':id,'svix-timestamp':timestamp,'svix-signature':signed},body:payload});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ignored:true});r=await fetch(base+'email',{method:'POST',headers:{'Content-Type':'application/json','svix-id':id,'svix-timestamp':'1','svix-signature':signed},body:payload});assert.equal(r.status,401);}
 finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));if(oldMeta===undefined)delete process.env.META_APP_SECRET;else process.env.META_APP_SECRET=oldMeta;if(oldEmail===undefined)delete process.env.RESEND_WEBHOOK_SECRET;else process.env.RESEND_WEBHOOK_SECRET=oldEmail;}
});
