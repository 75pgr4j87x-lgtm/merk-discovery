import {ConversationalForm} from './chat/ClientChat';
import React from 'react';
export default function CustomerOperationsFeedback({token}:{token:string}) {
  const [survey,setSurvey]=React.useState<{prompt:string;submitted:boolean}|null>(null);
  const [articles,setArticles]=React.useState<Array<{id:string;title:string;body:string;category:string}>>([]);
  const [score,setScore]=React.useState(''),[resolved,setResolved]=React.useState(''),[comment,setComment]=React.useState('');
  const [error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[loading,setLoading]=React.useState(true);
  const [search,setSearch]=React.useState('');
  async function request(path:string,body?:unknown) {
    const r=await fetch('/api/customer-operations/public/'+path,{method:body===undefined?'GET':'POST',headers:{'X-Customer-Conversation-Token':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Support resources unavailable.');return data;
  }
  React.useEffect(()=>{let active=true;async function load(){try{const [s,k]=await Promise.all([request('survey'),request('knowledge')]);if(active){setSurvey(s.survey);setArticles(k.articles);setError('');}}catch(e){if(active)setError(e instanceof Error?e.message:'Support resources unavailable.');}finally{if(active)setLoading(false);}}void load();const timer=setInterval(()=>{if(!document.hidden)void load();},60000);return()=>{active=false;clearInterval(timer);};},[token]);
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const s=await request('survey',{score:Number(score),resolved:resolved==='yes',comment});setSurvey(s.survey);}catch(e){setError(e instanceof Error?e.message:'Feedback could not be submitted.');}finally{setBusy(false);}}
  const field='mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-slate-900';
  return <section className="space-y-4 rounded border border-slate-200 bg-white p-5 text-slate-900" aria-label="Feedback and support articles">
    {loading&&<p role="status">Loading support resources…</p>}{error&&<p role="alert" className="text-red-800">{error}</p>}
    {survey&&(survey.submitted?<p role="status">Thank you. Your feedback has been recorded.</p>:<ConversationalForm onSubmit={submit} className="space-y-3"><h2 className="font-semibold">{survey.prompt}</h2>
      <label className="block text-sm">Satisfaction score<select aria-label="Satisfaction score" required className={field} value={score} onChange={e=>setScore(e.target.value)}><option value="">Choose a score</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label>
      <label className="block text-sm">Was the issue resolved?<select aria-label="Was the issue resolved?" required className={field} value={resolved} onChange={e=>setResolved(e.target.value)}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label className="block text-sm">Comment (optional)<textarea className={field} maxLength={2000} rows={3} value={comment} onChange={e=>setComment(e.target.value)}/></label><button disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy?'Submitting…':'Submit feedback'}</button>
    </ConversationalForm>)}
    {articles.length>0&&<><h2 className="font-semibold">Support articles</h2><label className="block text-sm">Search articles<input className={field} value={search} onChange={e=>setSearch(e.target.value)}/></label>{articles.filter(a=>(a.title+' '+a.category).toLowerCase().includes(search.toLowerCase())).map(a=><details className="rounded border p-3" key={a.id}><summary className="cursor-pointer font-medium">{a.title}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm">{a.body}</p></details>)}</>}
  </section>;
}
