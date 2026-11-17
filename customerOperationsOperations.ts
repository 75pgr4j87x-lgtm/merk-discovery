import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { linkedTicketIds } from './customerOperationsMessaging.js';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { CustomerOperationsTicket } from './src/types/customerOperations.js';

export type Rule = { id: string; name: string; enabled: boolean; trigger: 'created' | 'resolved' | 'customer_reply' | 'sla_due'; priority: string; category: string; action: 'notify' | 'assign' | 'route_team'; target: string };
export type OperationsSettings = { slaMinutes: number; reopenOnReply: boolean; surveyEnabled: boolean; surveyPrompt: string; rules: Rule[] };
export const defaultOperationsSettings: OperationsSettings = { slaMinutes: 1440, reopenOnReply: true, surveyEnabled: false, surveyPrompt: 'How satisfied are you with our support?', rules: [] };
const roles = ['business_owner','business_manager'];
export class OperationsError extends Error { constructor(public status: number, message: string) { super(message); } }
const text = (v:unknown,max:number) => typeof v === 'string' ? v.trim().slice(0,max) : '';
export function validateSettings(value:unknown): OperationsSettings {
  const v=value as OperationsSettings;
  if(!v || !Number.isInteger(v.slaMinutes) || v.slaMinutes<5 || v.slaMinutes>43200 || typeof v.reopenOnReply!=='boolean' || typeof v.surveyEnabled!=='boolean' || !text(v.surveyPrompt,200) || !Array.isArray(v.rules) || v.rules.length>20) throw new OperationsError(400,'Set an SLA from 5 to 43,200 minutes, survey prompt, reply policy and at most 20 rules.');
  const ids=new Set<string>();
  const rules=v.rules.map(r=>{
    if(!r || !/^[a-zA-Z0-9_-]{1,60}$/.test(r.id) || ids.has(r.id) || !text(r.name,100) || typeof r.enabled!=='boolean' || !['created','resolved','customer_reply','sla_due'].includes(r.trigger) || !['notify','assign','route_team'].includes(r.action) || !['','low','normal','high','urgent'].includes(r.priority) || typeof r.category!=='string' || typeof r.target!=='string' || (r.action!=='notify'&&!r.target.trim())) throw new OperationsError(400,'Invalid automation rule. Use distinct IDs and supported triggers/actions.');
    ids.add(r.id);return {id:r.id,name:text(r.name,100),enabled:r.enabled,trigger:r.trigger,priority:r.priority,category:text(r.category,80),action:r.action,target:text(r.target,150).toLowerCase()};
  });
  return {slaMinutes:v.slaMinutes,reopenOnReply:v.reopenOnReply,surveyEnabled:v.surveyEnabled,surveyPrompt:text(v.surveyPrompt,200),rules};
}
export function matchingRules(settings:OperationsSettings,trigger:Rule['trigger'],ticket:CustomerOperationsTicket) {
  return settings.rules.filter(r=>r.enabled&&r.trigger===trigger&&(!r.priority||r.priority===ticket.priority)&&(!r.category||r.category.toLowerCase()===ticket.category.toLowerCase()));
}
export const operationsRoot=(db:Firestore,businessId:string)=>db.collection('customerOperationsBusinesses').doc(businessId);
export const operationKey=(...parts:string[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');

// Called before any writes in the parent ticket/message transaction. The event,
// actions and run outcomes commit together; Firestore retries cannot duplicate them.
export async function applyTicketOperations(db:Firestore, tx:Transaction, ticket:CustomerOperationsTicket, previous:CustomerOperationsTicket|null, eventId:string, actor:string, trigger:Rule['trigger'] | 'updated', now:string) {
  const root=operationsRoot(db,ticket.businessId);
  const config=await tx.get(root.collection('operations').doc('settings'));
  const settings:OperationsSettings=config.exists ? config.data() as OperationsSettings : defaultOperationsSettings;
  const rules=trigger==='updated'?[]:matchingRules(settings,trigger,ticket);
  const memberships = await Promise.all(rules.filter(r=>r.action==='assign').map(async rule=>({rule, snapshot:await tx.get(db.collection('customerOperationsBusinessMemberships').where('businessId','==',ticket.businessId).where('email','==',rule.target))})));
  const teams=await Promise.all(rules.filter(r=>r.action==='route_team').map(async rule=>({rule,snapshot:await tx.get(root.collection('teams').doc(rule.target))})));
  const next={...ticket};
  if(trigger==='created') {next.slaDueAt=new Date(Date.parse(now)+settings.slaMinutes*60000).toISOString();next.slaTargetAt=next.slaDueAt;next.slaPolicyMinutes=settings.slaMinutes;next.reopenCount=0;next.slaBreachedAt=null;}
  if(trigger==='customer_reply'&&settings.reopenOnReply&&['resolved','closed'].includes(ticket.status)) {next.status='open';next.resolvedAt=null;next.slaBreachedAt=null;next.reopenCount=(ticket.reopenCount||0)+1;next.surveyId=null;next.slaDueAt=new Date(Date.parse(now)+settings.slaMinutes*60000).toISOString();next.slaTargetAt=next.slaDueAt;}
  if(trigger==='updated' && previous && ['resolved','closed'].includes(previous.status) && !['resolved','closed'].includes(next.status)) {next.slaBreachedAt=null;next.reopenCount=(previous.reopenCount||0)+1;next.slaDueAt=new Date(Date.parse(now)+settings.slaMinutes*60000).toISOString();next.slaTargetAt=next.slaDueAt;next.surveyId=null;}
  if(['resolved','closed'].includes(next.status)) next.slaDueAt=null;
  if(trigger==='resolved'&&settings.surveyEnabled) {
    const surveyId=operationKey(ticket.id,eventId);
    tx.create(root.collection('surveys').doc(surveyId),{id:surveyId,businessId:ticket.businessId,ticketId:ticket.id,customerId:ticket.customerId,prompt:settings.surveyPrompt,createdAt:now,submittedAt:null});next.surveyId=surveyId;
  }
  for(const rule of rules) {
    let result='applied',error:string|null=null;
    if(rule.action==='assign') {
      const member=memberships.find(m=>m.rule.id===rule.id)?.snapshot.docs.find(d=>d.get('active')===true);
      if(next.assignedAgent) result='skipped';
      else if(!member) {result='failed';error='Assignment target is no longer an active business member.';}
      else next.assignedAgent=rule.target;
    }
    if(rule.action==='route_team'){const team=teams.find(t=>t.rule.id===rule.id)?.snapshot;if(!team?.exists||!team.get('active')){result='failed';error='Routing team is inactive or missing.';}else next.assignedTeam=rule.target;}
    if(rule.action==='notify') tx.create(root.collection('notifications').doc(operationKey(eventId,rule.id)),{id:operationKey(eventId,rule.id),businessId:ticket.businessId,ticketId:ticket.id,title:rule.name,body:`${ticket.ticketNumber}: ${ticket.subject}`,audience:'managers',createdAt:now});
    tx.create(root.collection('automationRuns').doc(operationKey(eventId,rule.id)),{id:operationKey(eventId,rule.id),ruleId:rule.id,ruleName:rule.name,eventId,ticketId:ticket.id,trigger,action:rule.action,target:rule.target,result,error,createdAt:now,actor});
  }
  if((!previous || previous.assignedAgent!==next.assignedAgent) && next.assignedAgent) tx.create(root.collection('notifications').doc(operationKey('assignment',eventId)),{id:operationKey('assignment',eventId),businessId:ticket.businessId,ticketId:ticket.id,title:'Ticket assigned to you',body:`${ticket.ticketNumber}: ${ticket.subject}`,audience:next.assignedAgent,createdAt:now});
  return next;
}

export class OperationsStore {
  constructor(private db:Firestore) {}
  async preferences(businessId:string,who:string,enabled?:boolean) {
    const ref=operationsRoot(this.db,businessId).collection('notificationPreferences').doc(operationKey(who));
    if(enabled!==undefined){await this.db.runTransaction(async tx=>{tx.set(ref,{email:who,enabled,updatedAt:new Date().toISOString()});});return {enabled};}
    const s=await ref.get();return {enabled:s.exists?s.get('enabled')!==false:true};
  }
  async teams(businessId:string,input?:unknown,actor='',id=''){
    const root=operationsRoot(this.db,businessId);
    if(input!==undefined){const v=input as {name:string;members:string[];active:boolean};if(!text(v?.name,100)||!Array.isArray(v?.members)||v.members.length>100||v.members.some(m=>typeof m!=='string'||!m.includes('@'))||typeof v.active!=='boolean'||(id&&!/^[0-9a-f-]{36}$/.test(id)))throw new OperationsError(400,'Provide a team name, active state and up to 100 member emails.');const emails=[...new Set(v.members.map(m=>m.trim().toLowerCase()))],ref=root.collection('teams').doc(id||randomUUID());await this.db.runTransaction(async tx=>{const [current,members]=await Promise.all([tx.get(ref),tx.get(this.db.collection('customerOperationsBusinessMemberships').where('businessId','==',businessId))]);if(id&&!current.exists)throw new OperationsError(404,'Team not found.');if(emails.some(email=>!members.docs.some(m=>m.get('email')===email&&m.get('active')&&m.get('uid'))))throw new OperationsError(400,'Team members must have active claimed membership in this business.');tx.set(ref,{id:ref.id,businessId,name:text(v.name,100),members:emails,active:v.active,updatedAt:new Date().toISOString(),updatedBy:actor});tx.create(root.collection('operationsAudit').doc(),{action:'team_saved',teamId:ref.id,actor,createdAt:new Date().toISOString()});});}
    const teams=await root.collection('teams').orderBy('name').limit(100).get();return teams.docs.map(d=>d.data());
  }
  async settings(businessId:string) {const s=await operationsRoot(this.db,businessId).collection('operations').doc('settings').get();return s.exists?s.data() as OperationsSettings:defaultOperationsSettings;}
  async saveSettings(businessId:string,value:unknown,actor:string) {
    const settings=validateSettings(value),root=operationsRoot(this.db,businessId),now=new Date().toISOString();
    await this.db.runTransaction(async tx=>{tx.set(root.collection('operations').doc('settings'),settings);tx.create(root.collection('operationsAudit').doc(randomUUID()),{action:'operations_settings_updated',actor,createdAt:now});});return settings;
  }
  async list(businessId:string,kind:'articles'|'automationRuns'|'surveys'|'notifications',cursor:string,who:string,manager:boolean,search='') {
    const root=operationsRoot(this.db,businessId);
    if(kind==='notifications'&&!(await this.preferences(businessId,who)).enabled)return {items:[],nextCursor:null};
    let q=root.collection(kind).limit(51);
    if(kind==='notifications') q=q.where('audience','in',manager?[who,'managers']:[who]);
    const searching=kind==='articles'&&Boolean(search),sort=searching?'titleSearch':'createdAt',direction=searching?'asc' as const:'desc' as const;
    if(searching) q=q.where('titleSearch','>=',search.toLowerCase()).where('titleSearch','<=',search.toLowerCase()+'\uf8ff');
    q=q.orderBy(sort,direction).orderBy('__name__',direction);
    if(cursor){try{const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(typeof c.sort!=='string'||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(c.id))throw new Error();q=q.startAfter(c.sort,c.id);}catch{throw new OperationsError(400,'Invalid cursor.');}}
    const s=await q.get();const items:Array<Record<string,unknown>&{id:string}>=s.docs.slice(0,50).map(d=>({ ...d.data(),id:d.id }));
    if(kind==='notifications' && items.length) {const reads=await this.db.getAll(...items.map(item=>root.collection('notificationReads').doc(operationKey(item.id,who))));items.forEach((item,i)=>Object.assign(item,{read:reads[i].exists}));}
    return {items,nextCursor:s.size>50?Buffer.from(JSON.stringify({sort:s.docs[49].get(sort),id:s.docs[49].id})).toString('base64url'):null};
  }
  async saveArticle(businessId:string,id:string,value:unknown,actor:string) {
    const v=value as Record<string,unknown>,title=text(v?.title,180),body=text(v?.body,20000),category=text(v?.category,80);
    if(!title||!body||!category||!['draft','published'].includes(String(v?.status))||!['internal','customer'].includes(String(v?.visibility))) throw new OperationsError(400,'Complete article title, category, body, status and visibility.');
    const root=operationsRoot(this.db,businessId),ref=root.collection('articles').doc(id||randomUUID()),now=new Date().toISOString();
    return this.db.runTransaction(async tx=>{const existing=await tx.get(ref);if(id&&!existing.exists)throw new OperationsError(404,'Article not found.');const article={id:ref.id,businessId,title,titleSearch:title.toLowerCase(),body,category,status:v.status,visibility:v.visibility,author:existing.exists?existing.get('author'):actor,updatedBy:actor,createdAt:existing.exists?existing.get('createdAt'):now,updatedAt:now};tx.set(ref,article);tx.create(root.collection('operationsAudit').doc(randomUUID()),{action:'article_saved',articleId:ref.id,actor,createdAt:now});return article;});
  }
  async retryRun(businessId:string,id:string,actor:string) {
    const root=operationsRoot(this.db,businessId),ref=root.collection('automationRuns').doc(id),retryRef=root.collection('automationRuns').doc(operationKey(id,'retry')),now=new Date().toISOString();
    return this.db.runTransaction(async tx=>{
      const [run,retry,config]=await Promise.all([tx.get(ref),tx.get(retryRef),tx.get(root.collection('operations').doc('settings'))]);
      if(retry.exists)return {success:true};
      if(!run.exists||run.get('result')!=='failed')throw new OperationsError(409,'Only a failed assignment run can be retried.');
      const settings=config.exists?config.data() as OperationsSettings:defaultOperationsSettings;
      const rule=settings.rules.find(r=>r.id===run.get('ruleId')&&r.enabled&&r.action==='assign');
      if(!rule)throw new OperationsError(409,'The assignment rule is disabled or has changed.');
      const ticketRef=this.db.collection('customerOperationsTickets').doc(run.get('ticketId')),snapshot=await tx.get(ticketRef),ticket=snapshot.data() as CustomerOperationsTicket;
      if(!snapshot.exists||ticket.businessId!==businessId)throw new OperationsError(404,'Ticket not found.');
      if(!matchingRules(settings,run.get('trigger'),ticket).some(r=>r.id===rule.id))throw new OperationsError(409,'The ticket no longer meets this rule.');
      const members=await tx.get(this.db.collection('customerOperationsBusinessMemberships').where('businessId','==',businessId).where('email','==',rule.target));
      if(!members.docs.some(m=>m.get('active')===true))throw new OperationsError(409,'The assignment target is not active. Restore membership or edit the rule first.');
      const skipped=Boolean(ticket.assignedAgent);
      if(!skipped){tx.update(ticketRef,{assignedAgent:rule.target,updatedAt:now});tx.create(ticketRef.collection('events').doc(retryRef.id),{id:retryRef.id,action:'automation_assignment_retried',actorEmail:actor,changes:{assignedAgent:{from:'',to:rule.target}},createdAt:now});tx.create(root.collection('notifications').doc(retryRef.id),{id:retryRef.id,businessId,ticketId:ticket.id,title:'Ticket assigned to you',body:`${ticket.ticketNumber}: ${ticket.subject}`,audience:rule.target,createdAt:now});}
      tx.create(retryRef,{...run.data(),id:retryRef.id,retryOf:id,result:skipped?'skipped':'applied',error:null,actor,createdAt:now});tx.update(ref,{retryRunId:retryRef.id});return {success:true};
    });
  }
  async acknowledge(businessId:string,id:string,who:string,manager:boolean) {
    const root=operationsRoot(this.db,businessId);
    await this.db.runTransaction(async tx=>{const ref=root.collection('notifications').doc(id),s=await tx.get(ref);if(!s.exists||!(s.get('audience')===who||(manager&&s.get('audience')==='managers')))throw new OperationsError(404,'Notification not found.');tx.set(root.collection('notificationReads').doc(operationKey(id,who)),{notificationId:id,email:who,readAt:new Date().toISOString()});});
  }
  async checkDeadlines(businessId:string,actor:string,cursor?:{dueAt:string;id:string}|null) {
    const now=new Date().toISOString();
    const until=new Date(Date.parse(now)+15*60000).toISOString();
    let query=this.db.collection('customerOperationsTickets').where('businessId','==',businessId).where('slaDueAt','>=','0000').where('slaDueAt','<=',until).orderBy('slaDueAt').orderBy('__name__').limit(50);
    if(cursor){if(!/^\d{4}-\d{2}-\d{2}T/.test(cursor.dueAt)||!Number.isFinite(Date.parse(cursor.dueAt))||!/^[a-zA-Z0-9_-]{1,80}$/.test(cursor.id))throw new OperationsError(400,'Invalid deadline cursor.');query=query.startAfter(cursor.dueAt,cursor.id);}
    const due=await query.get();
    let processed=0;
    for(const document of due.docs) { const changed=await this.db.runTransaction(async tx=>{
      const s=await tx.get(document.ref),ticket=s.data() as CustomerOperationsTicket;
      if(!ticket||ticket.businessId!==businessId||['resolved','closed'].includes(ticket.status)||!ticket.slaDueAt||ticket.slaDueAt>until)return;
      const approaching=ticket.slaDueAt>now;
      const eventId=operationKey(ticket.id,ticket.slaDueAt,approaching?'sla_approaching':'sla_due'),root=operationsRoot(this.db,businessId),marker=root.collection('deadlineChecks').doc(eventId);
      if((await tx.get(marker)).exists)return;
      const next=await applyTicketOperations(this.db,tx,ticket,ticket,eventId,actor,'sla_due',now);
      tx.set(document.ref,{...next,...(!approaching?{slaDueAt:null,slaBreachedAt:now}:{}),updatedAt:now});
      tx.create(root.collection('notifications').doc(eventId),{id:eventId,businessId,ticketId:ticket.id,title:approaching?'SLA deadline approaching':'SLA deadline reached',body:`${ticket.ticketNumber}: ${ticket.subject}`,audience:ticket.assignedAgent||'managers',createdAt:now});
      tx.create(marker,{ticketId:ticket.id,checkedAt:now});return true;
    });if(changed)processed++; }
    const last=due.docs.at(-1);return {processed,nextCursor:due.size===50&&last?{dueAt:last.get('slaDueAt'),id:last.id}:null};
  }
}

export function operationsRouter(deps:{authorize:express.RequestHandler;store:()=>OperationsStore}) {
  const router=express.Router({mergeParams:true});
  router.use(deps.authorize);
  const manager:express.RequestHandler=(_req,res,next)=>{if(!roles.includes(res.locals.customerOperationsBusinessRole)){res.status(403).json({error:'Business owner or manager access is required.'});return;}next();};
  const handle=(fn:(req:express.Request<{businessId:string;id:string}>,res:express.Response)=>Promise<unknown>):express.RequestHandler=>async(req,res)=>{try{await fn(req as express.Request<{businessId:string;id:string}>,res);}catch(e){res.status(e instanceof OperationsError?e.status:503).json({error:e instanceof OperationsError?e.message:'Operations unavailable. Please retry.'});}};
  router.get('/teams',handle(async(req,res)=>res.json(await deps.store().teams(req.params.businessId))));
  router.post('/teams',manager,handle(async(req,res)=>res.status(201).json(await deps.store().teams(req.params.businessId,req.body,res.locals.customerOperationsEmail))));
  router.put('/teams/:id',manager,handle(async(req,res)=>res.json(await deps.store().teams(req.params.businessId,req.body,res.locals.customerOperationsEmail,req.params.id))));
  router.get('/preferences',handle(async(req,res)=>res.json(await deps.store().preferences(req.params.businessId,res.locals.customerOperationsEmail))));
  router.put('/preferences',handle(async(req,res)=>{if(typeof req.body?.enabled!=='boolean')throw new OperationsError(400,'Notification preference must be enabled or disabled.');res.json(await deps.store().preferences(req.params.businessId,res.locals.customerOperationsEmail,req.body.enabled));}));
  router.get('/settings',manager,handle(async(req,res)=>res.json(await deps.store().settings(req.params.businessId))));
  router.put('/settings',manager,handle(async(req,res)=>res.json(await deps.store().saveSettings(req.params.businessId,req.body,res.locals.customerOperationsEmail))));
  router.post('/check-deadlines',manager,handle(async(req,res)=>res.json(await deps.store().checkDeadlines(req.params.businessId,res.locals.customerOperationsEmail,req.body?.cursor))));
  for(const kind of ['articles','automationRuns','surveys','notifications'] as const) router.get('/'+kind,...(kind==='automationRuns'||kind==='surveys'?[manager]:[]),handle(async(req,res)=>{
    const cursor=text(req.query.cursor,512);if(cursor&&!/^[a-zA-Z0-9_-]{1,512}$/.test(cursor))throw new OperationsError(400,'Invalid cursor.');
    res.json(await deps.store().list(req.params.businessId,kind,cursor,res.locals.customerOperationsEmail,roles.includes(res.locals.customerOperationsBusinessRole),text(req.query.search,100)));
  }));
  router.post('/automationRuns/:id/retry',manager,handle(async(req,res)=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.id))throw new OperationsError(400,'Invalid run ID.');res.json(await deps.store().retryRun(req.params.businessId,req.params.id,res.locals.customerOperationsEmail));}));
  router.post('/articles',manager,handle(async(req,res)=>res.status(201).json(await deps.store().saveArticle(req.params.businessId,'',req.body,res.locals.customerOperationsEmail))));
  router.put('/articles/:id',manager,handle(async(req,res)=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.id))throw new OperationsError(400,'Invalid article ID.');res.json(await deps.store().saveArticle(req.params.businessId,req.params.id,req.body,res.locals.customerOperationsEmail));}));
  router.post('/notifications/:id/read',handle(async(req,res)=>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(req.params.id))throw new OperationsError(400,'Invalid notification ID.');await deps.store().acknowledge(req.params.businessId,req.params.id,res.locals.customerOperationsEmail,roles.includes(res.locals.customerOperationsBusinessRole));res.json({success:true});}));
  return router;
}

export async function conversationSurvey(db:Firestore, context:{businessId:string;id:string;ticketId:string|null},tokenHash:string,feedback?:unknown) {
  if(!context.ticketId)return null;
  const root=operationsRoot(db,context.businessId),now=new Date().toISOString();
  return db.runTransaction(async tx=>{
    const [conversation,business,ticket]=await Promise.all([
      tx.get(db.collection('customerOperationsConversations').doc(context.id)),tx.get(root),tx.get(db.collection('customerOperationsTickets').doc(context.ticketId!))]);
    if(!conversation.exists||conversation.get('customerLinkTokenHash')!==tokenHash||!conversation.get('customerLinkExpiresAt')||conversation.get('customerLinkExpiresAt')<=now||!business.exists||business.get('status')!=='active'||ticket.get('businessId')!==context.businessId||ticket.get('customerId')!==conversation.get('customerId')||!linkedTicketIds(conversation.data()!).includes(context.ticketId!)) throw new OperationsError(404,'Conversation not found.');
    const customer=await tx.get(db.collection('customerOperationsCustomers').doc(conversation.get('customerId')));
    if(!customer.exists||customer.get('status')!=='active'||customer.get('businessId')!==context.businessId)throw new OperationsError(404,'Conversation not found.');
    const surveyId=ticket.get('surveyId');if(!surveyId)return null;
    const ref=root.collection('surveys').doc(surveyId),s=await tx.get(ref);
    if(!s.exists||s.get('ticketId')!==ticket.id||s.get('customerId')!==customer.id)return null;
    if(feedback!==undefined){
      const v=feedback as {score:number;resolved:boolean;comment:string};
      if(!v||!Number.isInteger(v.score)||v.score<1||v.score>5||typeof v.resolved!=='boolean'||typeof v.comment!=='string'||v.comment.length>2000)throw new OperationsError(400,'Choose a score from 1 to 5, resolution answer and comment up to 2,000 characters.');
      if(s.get('submittedAt')) {if(s.get('score')!==v.score||s.get('resolved')!==v.resolved||s.get('comment')!==v.comment.trim())throw new OperationsError(409,'Feedback has already been submitted.');}
      else tx.update(ref,{score:v.score,resolved:v.resolved,comment:v.comment.trim(),submittedAt:now});
      return {prompt:s.get('prompt'),submitted:true};
    }
    return {prompt:s.get('prompt'),submitted:Boolean(s.get('submittedAt'))};
  });
}
export async function customerKnowledge(db:Firestore,businessId:string) {
  const s=await operationsRoot(db,businessId).collection('articles').where('status','==','published').where('visibility','==','customer').orderBy('titleSearch').limit(50).get();
  return s.docs.map(d=>({id:d.id,title:d.get('title'),body:d.get('body'),category:d.get('category'),updatedAt:d.get('updatedAt')}));
}
