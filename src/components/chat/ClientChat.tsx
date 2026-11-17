import React from 'react';
import {ArrowUp,Sparkles} from 'lucide-react';
import './client-chat.css';
export function ChatIdentity({title='Merakifos',subtitle='Your project, one conversation at a time'}:{title?:string;subtitle?:string}){return <header className="chat-identity"><span className="chat-avatar" aria-hidden="true"><Sparkles size={19}/></span><div><strong>{title}</strong><p>{subtitle}</p></div><span className="chat-guide">Conversation</span></header>;}
export function ChatBubble({children,from='assistant',label}:{children:React.ReactNode;from?:'assistant'|'customer';label?:string}){return <article className={'chat-bubble '+from}><span className="chat-speaker">{label||(from==='customer'?'You':'Merakifos guide')}</span><div>{children}</div></article>;}
export function ChatFrame({title,subtitle,children}:{title:string;subtitle?:string;children:React.ReactNode}){return <main className="client-chat"><ChatIdentity title={title} subtitle={subtitle}/><div className="chat-thread">{children}</div></main>;}
export function ChatComposer({value,onChange,onSend,label='Your reply',busy=false,optional=false,type='text',action='Send reply'}:{value:string;onChange:(v:string)=>void;onSend:()=>void;label?:string;busy?:boolean;optional?:boolean;type?:'text'|'email';action?:string}){
 const ref=React.useRef<HTMLInputElement|HTMLTextAreaElement|null>(null);
 React.useEffect(()=>{ref.current?.focus({preventScroll:true});},[label]);
 const props={value,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange(e.target.value),disabled:busy,required:!optional,maxLength:3000,'aria-label':label,placeholder:type==='email'?'you@example.com':'Type your reply…'};
 return <form className="chat-composer" onSubmit={e=>{e.preventDefault();if(!busy&&(optional||value.trim()))onSend();}}>{type==='email'?<input {...props} type="email" ref={el=>{ref.current=el;}}/>:<textarea {...props} rows={2} ref={el=>{ref.current=el;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>}<button type="submit" aria-label={action} disabled={busy||(!optional&&!value.trim())}><ArrowUp size={20}/><span className="sr-only">{action}</span></button></form>;
}
// Progressively enhances existing validated forms; final submit still uses their original handlers.
export function ConversationalForm({children,onSubmit,className='',...props}:React.FormHTMLAttributes<HTMLFormElement>){
 const ref=React.useRef<HTMLFormElement>(null),[step,setStep]=React.useState(0),[count,setCount]=React.useState(0),[prompt,setPrompt]=React.useState('Let’s take this one step at a time.'),[history,setHistory]=React.useState<string[]>([]);
 const labels=()=>Array.from(ref.current?.querySelectorAll<HTMLLabelElement>('.chat-fields label')||[]).filter(l=>l.querySelector('input:not([type=file]),textarea,select'));
 React.useLayoutEffect(()=>{const all=labels();setCount(all.length);all.forEach((l,i)=>{l.hidden=i!==step;});const current=all[step];setPrompt(current?.childNodes[0]?.textContent?.trim()||'Everything looks ready. Review your details, then send.');const el=current?.querySelector<HTMLElement>('input,textarea,select');el?.focus({preventScroll:true});return()=>{all.forEach(l=>{l.hidden=false;});};},[step,children]);
 function next(){const all=labels(),fields=Array.from(all[step]?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select')||[]);if(fields.some(f=>!f.reportValidity()))return;const answer=fields.map(f=>f.value.trim()).filter(Boolean).join(', ')||'Skipped';setHistory(h=>[...h.slice(0,step),answer]);setStep(s=>s+1);}
 return <form {...props} noValidate className={'chat-guided-form '+className} ref={ref} onSubmit={e=>{if(step<count){e.preventDefault();next();return;}const invalid=Array.from(ref.current?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select')||[]).find(f=>!f.checkValidity());if(invalid){e.preventDefault();return;}onSubmit?.(e);}} onInvalidCapture={e=>{const index=labels().findIndex(l=>l.contains(e.target as Node));if(index>=0)setStep(index);}}>
 <div className="chat-form-history">{history.slice(0,step).map((answer,i)=><ChatBubble from="customer" key={i}><p>{answer}</p><button type="button" onClick={()=>setStep(i)}>Edit answer</button></ChatBubble>)}</div>
 <ChatBubble><p>{prompt}</p></ChatBubble><div className="chat-fields" data-finished={step>=count}>{children}</div>
 {step<count&&<div className="chat-form-actions"><button type="button" className="chat-primary" onClick={next}>Send answer <ArrowUp size={16}/></button>{step>0&&<button type="button" onClick={()=>setStep(s=>s-1)}>Back</button>}<span>{step+1} of {count}</span></div>}
 {step>=count&&count>0&&<button type="button" className="chat-edit" onClick={()=>setStep(0)}>Review my answers</button>}
 </form>;
}
