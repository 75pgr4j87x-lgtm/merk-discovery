import React from 'react';
import { auth } from '../services/auth';
import type { OperationsSettings, Rule } from '../../customerOperationsOperations';

type RecordItem = { id:string; [key:string]:unknown };
type Page = {items:RecordItem[];nextCursor:string|null};
type Tab='notifications'|'articles'|'automationRuns'|'surveys'|'settings'|'team';
export default function CustomerOperationsOperations({businessId,role}:{businessId:string;role:string}) {
  const manager=['business_owner','business_manager'].includes(role),owner=role==='business_owner';
  const [tab,setTab]=React.useState<Tab>('notifications');
  const [items,setItems]=React.useState<RecordItem[]>([]),[cursor,setCursor]=React.useState<string|null>(null);
  const [settings,setSettings]=React.useState<OperationsSettings|null>(null);
  const [invitationLink,setInvitationLink]=React.useState('');
  const [error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[busy,setBusy]=React.useState(false);
  const [search,setSearch]=React.useState(''),[editId,setEditId]=React.useState('');
  const [article,setArticle]=React.useState({title:'',category:'',body:'',status:'draft',visibility:'internal'});
  const [memberEmail,setMemberEmail]=React.useState(''),[memberRole,setMemberRole]=React.useState('business_support_agent');
  const [notificationsEnabled,setNotificationsEnabled]=React.useState(true);
  const [deadlineCursor,setDeadlineCursor]=React.useState<unknown>(null);
  const generation=React.useRef(0);
  const base=`/api/customer-operations/businesses/${encodeURIComponent(businessId)}`;
  async function request(path:string,body?:unknown,method='GET') {
    if(!auth.currentUser)throw new Error('Sign in to continue.');
    const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${await auth.currentUser.getIdToken()}`,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed. Please retry.');return data;
  }
  async function load(more=false,searchTerm=search) {
    const id=++generation.current;setBusy(true);setError('');
    try {
      if(tab==='notifications') {const prefs=await request('/operations/preferences');if(id===generation.current)setNotificationsEnabled(prefs.enabled);}
      if(tab==='settings') {const s=await request('/operations/settings');if(id===generation.current)setSettings(s);}
      else if(tab==='team') {const members=await request('/members');if(id===generation.current)setItems(members.map((m:{email:string})=>({...m,id:m.email})));}
      else {const q=new URLSearchParams();if(more&&cursor)q.set('cursor',cursor);if(tab==='articles'&&searchTerm)q.set('search',searchTerm);const p:Page=await request(`/operations/${tab}?${q}`);if(id===generation.current){setItems(previous=>more?[...previous,...p.items]:p.items);setCursor(p.nextCursor);}}
    }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Unable to load operations.');}
    finally{if(id===generation.current)setBusy(false);}
  }
  React.useEffect(()=>{setItems([]);setCursor(null);setNotice('');setError('');setEditId('');setSearch('');void load(false,'');return()=>{generation.current++;};},[businessId,tab]);
  React.useEffect(()=>{if(tab!=='notifications')return;const timer=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>clearInterval(timer);},[tab,businessId]);
  async function action(fn:()=>Promise<unknown>,message:string) {setBusy(true);setError('');setNotice('');try{await fn();setNotice(message);await load();}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
  const field='mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm';
  const button='rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
  const tabs:Tab[]=['notifications','articles',...(manager?['automationRuns','surveys','settings'] as Tab[]:[]),'team'];
  const newRule=()=>settings&&setSettings({...settings,rules:[...settings.rules,{id:crypto.randomUUID(),name:'',enabled:true,trigger:'created',priority:'',category:'',action:'notify',target:''}]});
  return <section aria-label="Operations" className="space-y-5">
    <nav aria-label="Operations sections" className="flex flex-wrap gap-2">{tabs.map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)} className={`${button} ${tab===t?'bg-slate-900 text-white':''}`}>{{notifications:'Notifications',articles:'Knowledge base',automationRuns:'Automation history',surveys:'Feedback',settings:'Rules & SLA',team:'Team'}[t]}</button>)}</nav>
    {error&&<p role="alert" className="rounded border border-red-300 p-3 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded border p-3">{notice}</p>}{busy&&<p role="status">Working…</p>}
    <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>void load()}>Refresh</button>{manager&&<button className={button} disabled={busy} onClick={()=>void action(async()=>{const r=await request('/operations/check-deadlines',{cursor:deadlineCursor},'POST');setDeadlineCursor(r.nextCursor||null);},'Deadline batch checked. Continue with the next batch if available.')}>{deadlineCursor?'Check next SLA batch':'Check SLA deadlines'}</button>}</div>
    {manager&&<p className="text-xs text-slate-600">SLA alerts run when you check deadlines. Notifications refresh every 30 seconds while this tab is visible. No background scheduler is configured.</p>}
    {tab==='notifications'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={notificationsEnabled} disabled={busy} onChange={e=>{const enabled=e.target.checked;void action(async()=>{await request('/operations/preferences',{enabled},'PUT');setNotificationsEnabled(enabled);},'Notification preference saved.');}}/>Show my in-app notifications (history is retained)</label>}
    {tab==='settings'&&settings&&<form onSubmit={e=>{e.preventDefault();void action(()=>request('/operations/settings',settings,'PUT'),'Operations settings saved.');}} className="space-y-5">
      <label className="block text-sm">Resolution SLA (calendar minutes, new/reopened tickets)<input type="number" min={5} max={43200} required className={field} value={settings.slaMinutes} onChange={e=>setSettings({...settings,slaMinutes:Number(e.target.value)})}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.reopenOnReply} onChange={e=>setSettings({...settings,reopenOnReply:e.target.checked})}/>Reopen resolved or closed tickets on a customer reply</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.surveyEnabled} onChange={e=>setSettings({...settings,surveyEnabled:e.target.checked})}/>Offer one satisfaction survey per resolution on the secure customer conversation page</label>
      <label className="block text-sm">Survey prompt<input required maxLength={200} className={field} value={settings.surveyPrompt} onChange={e=>setSettings({...settings,surveyPrompt:e.target.value})}/></label>
      <h2 className="font-semibold">Trigger → condition → action</h2><p className="text-sm text-slate-600">Rules run in order. Assignment only applies to unassigned tickets. Team routing sets the ticket’s team label. Notifications go to owners/managers.</p>
      {settings.rules.map((r,index)=>{
        const update=(changes:Partial<Rule>)=>setSettings({...settings,rules:settings.rules.map((v,i)=>i===index?{...v,...changes}:v)});
        return <fieldset key={r.id} className="grid gap-3 rounded border p-4 sm:grid-cols-2"><legend className="px-1 text-sm">Rule {index+1}</legend>
          <label className="text-sm">Name<input required maxLength={100} className={field} value={r.name} onChange={e=>update({name:e.target.value})}/></label>
          <label className="text-sm">Trigger<select aria-label="Trigger" className={field} value={r.trigger} onChange={e=>update({trigger:e.target.value as Rule['trigger']})}>{['created','resolved','customer_reply','sla_due'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
          <label className="text-sm">Priority<select aria-label="Priority" className={field} value={r.priority} onChange={e=>update({priority:e.target.value})}>{['','low','normal','high','urgent'].map(v=><option key={v} value={v}>{v||'Any priority'}</option>)}</select></label>
          <label className="text-sm">Category (exact match; optional)<input className={field} maxLength={80} value={r.category} onChange={e=>update({category:e.target.value})}/></label>
          <label className="text-sm">Action<select aria-label="Action" className={field} value={r.action} onChange={e=>update({action:e.target.value as Rule['action']})}><option value="notify">Notify managers</option><option value="assign">Assign active agent</option><option value="route_team">Route to team label</option></select></label>
          {r.action!=='notify'&&<label className="text-sm">{r.action==='assign'?'Agent email':'Team label'}<input required type={r.action==='assign'?'email':'text'} maxLength={150} className={field} value={r.target} onChange={e=>update({target:e.target.value})}/></label>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={r.enabled} onChange={e=>update({enabled:e.target.checked})}/>Enabled</label>
          <button type="button" className={button} onClick={()=>{if(window.confirm('Remove this rule when settings are saved?'))setSettings({...settings,rules:settings.rules.filter(v=>v.id!==r.id)});}}>Remove rule</button>
        </fieldset>;
      })}
      <div className="flex gap-3"><button type="button" className={button} disabled={settings.rules.length>=20} onClick={newRule}>Add rule</button><button disabled={busy} className={button}>Save rules & SLA</button></div>
    </form>}
    {tab==='articles'&&<>
      <form onSubmit={e=>{e.preventDefault();void load();}} className="flex items-end gap-2"><label className="flex-1 text-sm">Search article title<input className={field} value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label><button className={button} disabled={busy}>Search</button></form>
      {manager&&<form className="space-y-3 rounded border p-4" onSubmit={e=>{e.preventDefault();void action(async()=>{await request('/operations/articles'+(editId?'/'+encodeURIComponent(editId):''),article,editId?'PUT':'POST');setEditId('');setArticle({title:'',category:'',body:'',status:'draft',visibility:'internal'});},'Article saved.');}}>
        <h2 className="font-semibold">{editId?'Edit article':'New article'}</h2>
        <label className="block text-sm">Title<input className={field} required maxLength={180} value={article.title} onChange={e=>setArticle({...article,title:e.target.value})}/></label>
        <label className="block text-sm">Category<input className={field} required maxLength={80} value={article.category} onChange={e=>setArticle({...article,category:e.target.value})}/></label>
        <label className="block text-sm">Article text<textarea className={field} required maxLength={20000} rows={6} value={article.body} onChange={e=>setArticle({...article,body:e.target.value})}/></label>
        <label className="block text-sm">Status<select aria-label="Status" className={field} value={article.status} onChange={e=>setArticle({...article,status:e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <label className="block text-sm">Visibility<select aria-label="Visibility" className={field} value={article.visibility} onChange={e=>setArticle({...article,visibility:e.target.value})}><option value="internal">Internal staff only</option><option value="customer">Customers with a valid conversation link</option></select></label>
        <button className={button} disabled={busy}>Save article</button>{editId&&<button type="button" className={button} onClick={()=>setEditId('')}>Cancel edit</button>}
      </form>}
    </>}
    {tab==='team'&&invitationLink&&<label className="block text-sm">Private invitation link<input readOnly className={field} value={invitationLink} onFocus={e=>e.target.select()}/></label>}
    {tab==='team'&&owner&&<form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void action(async()=>{const result=await request('/members',{email:memberEmail,role:memberRole},'POST');setInvitationLink(result.invitationLink||'');},'Membership updated. New invitees must claim their private invitation link.');}}>
      <label className="text-sm">Member email<input type="email" className={field} required value={memberEmail} onChange={e=>setMemberEmail(e.target.value)}/></label>
      <label className="text-sm">Role<select aria-label="Role" className={field} value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option value="business_support_agent">Support agent</option><option value="business_manager">Manager</option></select></label><button disabled={busy} className={button}>Add / update member</button>
    </form>}
    {tab!=='settings'&&<div className="space-y-3">{!busy&&items.length===0&&<p className="rounded border p-4 text-sm text-slate-600">No records yet.</p>}{items.map(item=><article key={item.id} className="rounded border p-4 text-sm">
      {tab==='articles'?<><h2 className="font-semibold">{String(item.title)}</h2><p className="text-xs text-slate-500">{String(item.category)} · {String(item.status)} · {String(item.visibility)} · {String(item.updatedAt)}</p><p className="mt-2 whitespace-pre-wrap break-words">{String(item.body)}</p>{manager&&<button className={button} onClick={()=>{setEditId(item.id);setArticle({title:String(item.title),category:String(item.category),body:String(item.body),status:String(item.status),visibility:String(item.visibility)});}}>Edit article</button>}</>:
      tab==='notifications'?<><h2 className="font-semibold">{String(item.title)} {item.read?'· Read':''}</h2><p className="break-words">{String(item.body)}</p><p className="text-xs text-slate-500">{String(item.createdAt)}</p>{!item.read&&<button className={button} disabled={busy} onClick={()=>void action(()=>request('/operations/notifications/'+item.id+'/read',{},'POST'),'Notification marked read.')}>Mark read</button>}</>:
      tab==='team'?<><h2 className="break-all font-semibold">{String(item.email)}</h2><p>{String(item.role).replaceAll('_',' ')}</p>{owner&&item.role!=='business_owner'&&<button className={button} disabled={busy} onClick={()=>{if(window.confirm('Deactivate this business membership?'))void action(()=>request('/members/'+encodeURIComponent(String(item.email)),undefined,'DELETE'),'Member deactivated.');}}>Deactivate</button>}</>:
      tab==='surveys'?<><h2 className="font-semibold">{item.submittedAt?`Score ${item.score}/5`:'Awaiting feedback'}</h2><p>Ticket {String(item.ticketId)}</p><p>{String(item.prompt)}</p>{item.submittedAt&&<><p>Resolved: {item.resolved?'Yes':'No'}</p><p className="whitespace-pre-wrap break-words">{String(item.comment||'')}</p></>}</>:
      <><h2 className="font-semibold">{String(item.ruleName)} · {String(item.result)}</h2><p>Trigger: {String(item.trigger)} · {String(item.createdAt)}</p>{item.error&&<p className="text-red-800">{String(item.error)}</p>}{item.result==='failed'&&!item.retryRunId&&<button disabled={busy} className={button} onClick={()=>void action(()=>request('/operations/automationRuns/'+item.id+'/retry',{},'POST'),'Assignment retry completed.')}>Retry assignment</button>}</>}
    </article>)}</div>}
    {cursor&&tab!=='team'&&<button className={button} disabled={busy} onClick={()=>void load(true)}>Load more</button>}
  </section>;
}
