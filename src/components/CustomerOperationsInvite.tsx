import React from 'react';
import type {User} from 'firebase/auth';
import {auth,initAuth} from '../services/auth';
import {GoogleSignInButton} from './GoogleSignInButton';
export default function CustomerOperationsInvite(){
  const [user,setUser]=React.useState<User|null>(null),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(false);
  const [token]=React.useState(()=>new URLSearchParams(location.hash.slice(1)).get('invite')||'');
  React.useEffect(()=>initAuth(setUser,()=>setUser(null)),[]);
  async function claim(){setBusy(true);setMessage('');try{if(!auth.currentUser)throw new Error('Sign in with the invited account.');const r=await fetch('/api/customer-operations/invitations/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify({token})});const v=await r.json();if(!r.ok)throw new Error(v.error);history.replaceState(null,'',location.pathname);setMessage('Invitation accepted. Open your workspace to continue.');}catch(e){setMessage(e instanceof Error?e.message:'Could not claim invitation.');}finally{setBusy(false);}}
  return <main className="mx-auto max-w-lg space-y-5 p-8 text-slate-900"><h1 className="text-2xl font-semibold">Customer Operations invitation</h1><p>Sign in with the verified Google account that received this invitation.</p><GoogleSignInButton identityOnly user={user} onAuthChange={setUser}/>{user&&<button disabled={busy||!token} onClick={()=>void claim()} className="rounded bg-slate-900 px-4 py-2 text-white">{busy?'Accepting…':'Accept invitation'}</button>}<p role="status">{message||(!token?'Invitation token is missing.':'')}</p><a className="underline" href="/studio/customer-operations">Open workspace</a></main>;
}
