import {ChatIdentity,ChatBubble} from './chat/ClientChat';
import CustomerOperationsFiles from './CustomerOperationsFiles';
import type { CustomerOperationsAttachment } from '../types/customerOperations';
import CustomerOperationsFeedback from './CustomerOperationsFeedback';
import React from 'react';
import type {
  CustomerOperationsConversationMessage,
  CustomerOperationsConversationStatus,
} from '../types/customerOperations';

type PublicConversation = {
  id: string;
  customerName: string;
  ticketNumber: string | null;
  subject: string;
  status: CustomerOperationsConversationStatus;
};

type PublicConversationData = {
  conversation: PublicConversation;
  messages: CustomerOperationsConversationMessage[];
};

async function publicConversationRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-Customer-Conversation-Token', token);
  const response = await fetch(path, { ...init, headers });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data
      && typeof data.error === 'string'
      ? data.error
      : 'The request could not be completed.';
    throw new Error(message);
  }
  return data as T;
}

export const CustomerOperationsCustomerConversation: React.FC = () => {
  const [token] = React.useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [data, setData] = React.useState<PublicConversationData | null>(null);
  const messageKey=React.useRef(crypto.randomUUID());
  const [files,setFiles]=React.useState<CustomerOperationsAttachment[]>([]);
  const [reply, setReply] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const loadConversation = React.useCallback(async () => {
    if (!token) throw new Error('This conversation link is invalid or expired.');
    const result = await publicConversationRequest<PublicConversationData>(token, '/api/customer-operations/public/conversations');
    setData(result);
  }, [token]);

  React.useEffect(() => {
    let active = true;
    void loadConversation().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load this conversation.');
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [loadConversation]);

  React.useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden&&token)void loadConversation().catch(e=>setError(e instanceof Error?e.message:'Could not refresh messages.'));},5000);return()=>clearInterval(timer);},[token,loadConversation]);

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || reply.trim().length < 2) return;
    setIsSending(true);
    setError('');
    setNotice('');
    try {
      await publicConversationRequest<CustomerOperationsConversationMessage>(
        token,
        '/api/customer-operations/public/conversations/messages',
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key':messageKey.current },
        body: JSON.stringify({ body: reply, attachmentIds:files.map(f=>f.id) }),
        }
      );
      messageKey.current=crypto.randomUUID();setFiles([]);
      setReply('');
      await loadConversation();
      setNotice('Your reply was sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your reply.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="client-chat client-conversation"><ChatIdentity title="Your support conversation" subtitle="Private messages between you and the support team"/><div className="chat-thread"><ChatBubble><p>You’re in the right place. Send a reply below or attach a file to help the team understand your issue.</p></ChatBubble>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer conversation</p>
          {data ? (
            <>
              <h1 className="mt-2 text-2xl font-semibold">{data.conversation.subject}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {data.conversation.customerName}
                {data.conversation.ticketNumber ? ` · ${data.conversation.ticketNumber}` : ''}
              </p>
              <p className="mt-2 text-xs capitalize text-slate-500">Status: {data.conversation.status}</p>
            </>
          ) : <h1 className="mt-2 text-2xl font-semibold">Secure message</h1>}
        </header>

        <section aria-live="polite" className="min-h-64 space-y-3 p-5 sm:p-8">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
          {isLoading ? <p className="text-center text-sm text-slate-500">Loading conversation…</p>
            : data?.messages.length ? data.messages.map((message) => (
              <article key={message.id} className={`max-w-[90%] rounded-xl border p-4 ${message.authorType === 'customer' ? 'chat-bubble customer' : 'chat-bubble assistant'}`}>
                <p className="text-xs font-medium text-slate-600">{message.authorType === 'customer' ? 'You' : 'Support team'}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{message.body}</p><CustomerOperationsFiles files={message.attachments||[]} publicToken={token} onError={setError}/>
                <time className="mt-2 block text-right text-[11px] text-slate-500">{new Date(message.createdAt).toLocaleString()}</time>
              </article>
            )) : data && <p className="text-center text-sm text-slate-500">No customer-visible messages yet.</p>}
        </section>

        {data && (
          <form onSubmit={sendReply} className="border-t border-slate-200 p-5 sm:p-8">
            <label htmlFor="customer-conversation-reply" className="mb-2 block text-sm font-medium">Your reply</label>
            <CustomerOperationsFiles files={files} publicToken={token} onError={setError} onChange={value=>{messageKey.current=crypto.randomUUID();setFiles(value);}}/>
            <textarea
              id="customer-conversation-reply"
              required
              minLength={2}
              maxLength={3000}
              rows={4}
              value={reply}
              onChange={(event) => (messageKey.current=crypto.randomUUID(),setReply(event.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Write your message…"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Only messages shared with you appear here.</p>
              <button disabled={isSending || reply.trim().length < 2} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {isSending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>
        )}
      </div>
    {data && <CustomerOperationsFeedback token={token} />}
      </div></main>
  );
};
