import CustomerOperationsFiles from './CustomerOperationsFiles';
import type { CustomerOperationsAttachment } from '../types/customerOperations';
import React from 'react';
import { auth } from '../services/auth';
import type {
  CustomerOperationsConversation,
  CustomerOperationsConversationMessage,
  CustomerOperationsChannelCapabilities,
  CustomerOperationsCustomer,
  CustomerOperationsMessageChannel,
  CustomerOperationsMessageVisibility,
  CustomerOperationsTicket,
} from '../types/customerOperations';

type Page<T> = { items: T[]; nextCursor: string | null };
type ConversationDetail = {
  conversation: CustomerOperationsConversation;
  messages: CustomerOperationsConversationMessage[];
};

async function inboxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
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

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const CustomerOperationsInbox: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [conversations, setConversations] = React.useState<CustomerOperationsConversation[]>([]);
  const [customers, setCustomers] = React.useState<CustomerOperationsCustomer[]>([]);
  const [tickets, setTickets] = React.useState<CustomerOperationsTicket[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [detail, setDetail] = React.useState<ConversationDetail | null>(null);
  const draftVersion=React.useRef('');
  const draftRevision=React.useRef<number|null>(null);
  const [assigneeFilter,setAssigneeFilter]=React.useState('');
  const [search,setSearch]=React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [customerId, setCustomerId] = React.useState('');
  const [ticketId, setTicketId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [initialMessage, setInitialMessage] = React.useState('');
  const creationKey=React.useRef(crypto.randomUUID());
  const messageKey=React.useRef(crypto.randomUUID());
  const [linkTicketId,setLinkTicketId]=React.useState('');
  const [files,setFiles]=React.useState<CustomerOperationsAttachment[]>([]);
  const [reply, setReply] = React.useState('');
  const [visibility, setVisibility] = React.useState<CustomerOperationsMessageVisibility>('customer');
  const [channel, setChannel] = React.useState<CustomerOperationsMessageChannel>('in_app');
  const [capabilities, setCapabilities] = React.useState<CustomerOperationsChannelCapabilities | null>(null);
  const [customerLink, setCustomerLink] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const base = `/api/customer-operations/businesses/${encodeURIComponent(businessId)}`;

  const loadConversations = React.useCallback(async (append = false, cursor?: string | null) => {
    const params = new URLSearchParams({ limit: '50' });
    if (statusFilter) params.set('status', statusFilter);
    if(assigneeFilter)params.set('assignee',assigneeFilter);
    if(search.trim())params.set('search',search.trim());
    if (append && cursor) params.set('cursor', cursor);
    const page = await inboxRequest<Page<CustomerOperationsConversation>>(`${base}/conversations?${params}`);
    setConversations((current) => append ? [...current, ...page.items] : page.items);
    setNextCursor(page.nextCursor);
  }, [base, statusFilter,assigneeFilter,search]);

  const loadDetail = React.useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      setCustomerLink('');
      return;
    }
    const result = await inboxRequest<ConversationDetail>(`${base}/conversations/${encodeURIComponent(id)}`);
    setDetail(result);
  }, [base]);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    void Promise.all([
      loadConversations(),
      inboxRequest<Page<CustomerOperationsCustomer>>(`${base}/customers?limit=100`),
      inboxRequest<Page<CustomerOperationsTicket>>(`${base}/tickets?limit=100`),
      inboxRequest<CustomerOperationsChannelCapabilities>(`${base}/channels`),
    ]).then(([, customerPage, ticketPage, channelCapabilities]) => {
      if (!active) return;
      setCustomers(customerPage.items);
      setTickets(ticketPage.items);
      setCapabilities(channelCapabilities);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load the inbox.');
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [base, loadConversations]);

  React.useEffect(() => {
    setFiles([]);setReply('');draftVersion.current='';draftRevision.current=null;messageKey.current=crypto.randomUUID();
    void loadDetail(selectedId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load conversation details.');
    });
  }, [selectedId, loadDetail]);

  const refresh = async (conversationId = selectedId) => {
    await Promise.all([loadConversations(), loadDetail(conversationId)]);
  };

  React.useEffect(()=>{let active=true,running=false;const timer=setInterval(()=>{if(document.hidden||running||isSaving)return;running=true;void Promise.all([loadConversations(),selectedId?loadDetail(selectedId):Promise.resolve()]).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not refresh the inbox.');}).finally(()=>{running=false;});},5000);return()=>{active=false;clearInterval(timer);};},[loadConversations,loadDetail,selectedId,isSaving]);
  async function changeTicketLink(id:string,remove=false){if(!detail)return;try{await inboxRequest(`${base}/conversations/${detail.conversation.id}/tickets/${encodeURIComponent(id)}`,{method:remove?'DELETE':'POST'});setLinkTicketId('');await refresh();}catch(e){setError(e instanceof Error?e.message:'Could not change ticket link.');}}
  const createConversation = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      const conversation = await inboxRequest<CustomerOperationsConversation>(`${base}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key':creationKey.current },
        body: JSON.stringify({ customerId, ticketId, subject, body: initialMessage }),
      });
      creationKey.current=crypto.randomUUID();
      setCustomerId('');
      setTicketId('');
      setSubject('');
      setInitialMessage('');
      setShowCreateForm(false);
      setSelectedId(conversation.id);
      setNotice('Conversation created. Generate a customer link to let the customer reply.');
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the conversation.');
    } finally {
      setIsSaving(false);
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || reply.trim().length < 2) return;
    setIsSaving(true);
    setError('');
    setNotice('');
    try {
      await inboxRequest<CustomerOperationsConversationMessage>(
        `${base}/conversations/${encodeURIComponent(detail.conversation.id)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key':messageKey.current },
          body: JSON.stringify({ body: reply, visibility, channel,attachmentIds:files.map(f=>f.id),expectedRevision:draftRevision.current??detail.conversation.revision??0,expectedUpdatedAt:draftVersion.current||detail.conversation.updatedAt }),
        }
      );
      messageKey.current=crypto.randomUUID();draftVersion.current='';draftRevision.current=null;setFiles([]);
      setReply('');
      await refresh();
      setNotice(visibility === 'customer'
        ? channel === 'email' ? 'Email delivered to the customer.' : 'Customer reply added to the conversation.'
        : 'Internal message added.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the message.');
      try {
        await refresh();
      } catch {
        // Keep the delivery error visible if refreshing the conversation also fails.
      }
    } finally {
      setIsSaving(false);
    }
  };

  const retryEmail = async (messageId: string) => {
    if (!detail) return;
    setError('');
    setNotice('');
    try {
      await inboxRequest(
        `${base}/conversations/${encodeURIComponent(detail.conversation.id)}/messages/${encodeURIComponent(messageId)}/retry`,
        { method: 'POST' }
      );
      await refresh();
      setNotice('Email delivered to the customer.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry email delivery.');
      try {
        await refresh();
      } catch {
        // Keep the delivery error visible if refreshing the conversation also fails.
      }
    }
  };

  const updateStatus = async () => {
    if (!detail) return;
    const status = detail.conversation.status === 'open' ? 'closed' : 'open';
    setError('');
    try {
      await inboxRequest(`${base}/conversations/${encodeURIComponent(detail.conversation.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refresh();
      setNotice(`Conversation ${status}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the conversation.');
    }
  };

  const issueCustomerLink = async () => {
    if (!detail) return;
    setError('');
    setNotice('');
    try {
      const result = await inboxRequest<{ link: string; expiresAt: string }>(
        `${base}/conversations/${encodeURIComponent(detail.conversation.id)}/customer-link`,
        { method: 'POST' }
      );
      setCustomerLink(result.link);
      setDetail((current) => current ? {
        ...current,
        conversation: { ...current.conversation, customerLinkExpiresAt: result.expiresAt },
      } : current);
      setNotice(`Customer link expires ${new Date(result.expiresAt).toLocaleString()}.`);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a customer link.');
    }
  };

  const revokeCustomerLink = async () => {
    if (!detail) return;
    setError('');
    setNotice('');
    try {
      await inboxRequest(
        `${base}/conversations/${encodeURIComponent(detail.conversation.id)}/customer-link`,
        { method: 'DELETE' }
      );
      setCustomerLink('');
      await refresh();
      setNotice('Customer link revoked.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke the customer link.');
    }
  };

  const copyCustomerLink = async () => {
    try {
      await navigator.clipboard.writeText(customerLink);
      setNotice('Customer link copied.');
    } catch {
      setError('Could not copy the link. Select and copy it manually.');
    }
  };

  const selectedCustomerTickets = tickets.filter((ticket) => ticket.customerId === customerId);
  const hasActiveCustomerLink = Boolean(
    detail?.conversation.customerLinkExpiresAt
    && Date.parse(detail.conversation.customerLinkExpiresAt) > Date.now()
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.4fr)_minmax(200px,0.7fr)]">

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-semibold">Unified inbox</h2>
            <p className="mt-1 text-xs text-slate-500">Customer replies and staff-only messages.</p>
          </div>
          <button type="button" onClick={() => setShowCreateForm((value) => !value)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {showCreateForm ? 'Cancel' : 'New conversation'}
          </button>
        </div>

        <div className="space-y-2 border-b p-3"><label className="block text-xs">Search conversation subject<input value={search} onChange={e=>setSearch(e.target.value)} maxLength={100} className="mt-1 w-full rounded border p-2"/></label><label className="block text-xs">Assignment<select aria-label="Conversation assignment filter" value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)} className="mt-1 w-full rounded border p-2"><option value="">All</option><option value="mine">Mine</option><option value="unassigned">Unassigned</option></select></label></div>
        {showCreateForm && (
          <form onSubmit={createConversation} className="space-y-3 border-b border-slate-200 bg-slate-50 p-4">
            <label className="block text-xs font-medium text-slate-600">Customer
              <select required value={customerId} onChange={(event) => {
                setCustomerId(event.target.value);
                setTicketId('');
              }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Select a customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">Related ticket (optional)
              <select value={ticketId} onChange={(event) => setTicketId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">No related ticket</option>
                {selectedCustomerTickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.ticketNumber} · {ticket.subject}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">Subject
              <input required minLength={3} maxLength={180} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-slate-600">First message to customer
              <textarea required minLength={2} maxLength={3000} rows={3} value={initialMessage} onChange={(event) => setInitialMessage(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <button disabled={isSaving || !customers.length} className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {isSaving ? 'Creating…' : 'Create conversation'}
            </button>
            {!customers.length && <p className="text-xs text-amber-700">Add a customer before creating a conversation.</p>}
          </form>
        )}

        <div className="border-b border-slate-100 p-3">
          <select aria-label="Filter conversations by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All conversations</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {error && <p role="alert" className="m-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {notice && <p role="status" className="m-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
        {isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading inbox…</p>
          : conversations.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No conversations yet.</p>
            : (
              <div className="divide-y divide-slate-100">
                {conversations.map((conversation) => (
                  <button type="button" key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedId === conversation.id ? 'bg-slate-50' : ''}`}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{conversation.subject}</span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${conversation.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{pretty(conversation.status)}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{conversation.customerName}{conversation.ticketNumber ? ` · ${conversation.ticketNumber}` : ''}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{conversation.lastMessagePreview}</span>
                  </button>
                ))}
                {nextCursor && (
                  <button type="button" onClick={() => void loadConversations(true, nextCursor).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load more conversations.'))} className="w-full px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Load more
                  </button>
                )}
              </div>
            )}
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!detail ? (
          <p className="p-12 text-center text-sm text-slate-500">Select a conversation to view its messages.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{detail.conversation.subject}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.conversation.customerName}{detail.conversation.customerEmail ? ` · ${detail.conversation.customerEmail}` : ''}
                  {detail.conversation.ticketNumber ? ` · ${detail.conversation.ticketNumber}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => void updateStatus()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                {detail.conversation.status === 'open' ? 'Close conversation' : 'Reopen conversation'}
              </button>
            </div>

            <div className="border-b border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Customer access link</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {detail.conversation.customerLinkExpiresAt
                      ? hasActiveCustomerLink
                        ? `Active until ${new Date(detail.conversation.customerLinkExpiresAt).toLocaleString()}.`
                        : `Expired on ${new Date(detail.conversation.customerLinkExpiresAt).toLocaleString()}.`
                      : 'No active customer link.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void issueCustomerLink()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-100">
                    {hasActiveCustomerLink ? 'Rotate link' : 'Create link'}
                  </button>
                  {detail.conversation.customerLinkExpiresAt && (
                    <button type="button" onClick={() => void revokeCustomerLink()} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
              {customerLink && (
                <div className="mt-3 flex gap-2">
                  <input aria-label="Customer conversation link" readOnly value={customerLink} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs" />
                  <button type="button" onClick={() => void copyCustomerLink()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white">Copy</button>
                </div>
              )}
            </div>

            <div className="max-h-[480px] min-h-56 space-y-3 overflow-y-auto p-5">
              {detail.messages.length ? detail.messages.map((message) => (
                <article key={message.id} className={`rounded-xl border p-3 ${message.visibility === 'internal' ? 'border-amber-200 bg-amber-50' : message.authorType === 'customer' ? 'border-slate-200 bg-slate-50' : 'border-blue-100 bg-blue-50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium">
                      {message.authorType === 'customer' ? 'Customer' : message.authorEmail || 'Business team'}
                      {message.visibility === 'internal' ? ' · Internal only' : ''}
                    </span>
                    <time className="text-slate-500">{new Date(message.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{message.body}</p><CustomerOperationsFiles files={message.attachments||[]} businessId={businessId} conversationId={detail!.conversation.id} onError={setError}/>
                  {message.channel === 'email' && (
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className={message.deliveryStatus === 'sent' ? 'text-emerald-700' : 'text-rose-700'}>
                        Email {message.deliveryStatus === 'sent' ? 'delivered' : 'delivery failed'}
                        {message.deliveryError ? ` · ${message.deliveryError}` : ''}
                      </span>
                      {message.deliveryStatus === 'failed' && (
                        <button type="button" onClick={() => void retryEmail(message.id)} className="font-medium text-slate-700 underline">
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )) : <p className="text-sm text-slate-500">No messages in this conversation.</p>}
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="message-visibility" checked={visibility === 'customer'} onChange={() => setVisibility('customer')} />
                  Reply to customer
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="message-visibility" checked={visibility === 'internal'} onChange={() => {
                    setVisibility('internal');
                    setChannel('in_app');
                  }} />
                  Internal only
                </label>
              </div>
              {visibility === 'customer' && (
                <label className="mb-3 block text-xs font-medium text-slate-600">Delivery channel
                  <select value={channel} onChange={(event) => setChannel(event.target.value as CustomerOperationsMessageChannel)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-auto">
                    <option value="in_app">In-app conversation</option>
                    <option value="email" disabled={!capabilities?.email.configured}>Email{capabilities?.email.configured ? '' : ' (SMTP not configured)'}</option>
                    <option value="whatsapp" disabled>WhatsApp (official provider not configured)</option>
                  </select>
                </label>
              )}
              {reply&&draftVersion.current&&(draftVersion.current!==detail!.conversation.updatedAt||draftRevision.current!==(detail!.conversation.revision||0))&&<div role="status" className="rounded border border-amber-300 p-3 text-sm">This conversation changed while you were writing. Review the latest messages.<button type="button" onClick={()=>{draftVersion.current=detail!.conversation.updatedAt;draftRevision.current=detail!.conversation.revision||0;setNotice('Latest messages acknowledged. You can now send your draft.');}} className="ml-2 rounded border px-2 py-1">I reviewed the updates</button></div>}
              <CustomerOperationsFiles files={files} onChange={value=>{messageKey.current=crypto.randomUUID();setFiles(value);}} businessId={businessId} conversationId={detail!.conversation.id} visibility={visibility} onError={setError}/>
              <textarea required minLength={2} maxLength={3000} rows={3} value={reply} onChange={(event) => (draftRevision.current ??= detail?.conversation.revision??0,draftVersion.current ||= detail?.conversation.updatedAt||'',messageKey.current=crypto.randomUUID(),setReply(event.target.value))} aria-label={visibility === 'customer' ? 'Customer reply' : 'Internal message'} placeholder={visibility === 'customer' ? 'Write a reply…' : 'Write an internal message…'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {!capabilities?.email.configured && visibility === 'customer' && (
                <p className="mt-2 text-xs text-slate-500">Email is unavailable until SMTP is configured on the local server. WhatsApp requires an official provider integration.</p>
              )}
              <div className="mt-3 flex justify-end">
                <button disabled={isSaving || reply.trim().length < 2} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {isSaving ? 'Sending…' : visibility === 'customer' ? 'Send reply' : 'Add internal message'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
      {detail && <aside aria-label="Customer context" className="mb-4 rounded border p-3 text-sm"><h2 className="font-semibold">Customer</h2><p className="mt-2">Assigned: {detail.conversation.assignedAgent||'Unassigned'}</p><button type="button" className="my-2 rounded border px-2 py-1" onClick={()=>void inboxRequest(`${base}/conversations/${detail.conversation.id}/assignment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignedAgent:auth.currentUser?.email})}).then(()=>refresh()).catch(e=>setError(e.message))}>Assign to me</button>{detail.conversation.assignedAgent===auth.currentUser?.email&&<button type="button" className="m-2 rounded border px-2 py-1" onClick={()=>void inboxRequest(`${base}/conversations/${detail.conversation.id}/assignment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignedAgent:''})}).then(()=>refresh()).catch(e=>setError(e.message))}>Release</button>}<p className="mt-2">{detail.conversation.customerName}</p><p className="mb-4 break-all text-slate-600">{detail.conversation.customerEmail}</p><h3 className="font-semibold">Linked tickets</h3>{(detail.conversation.ticketIds || (detail.conversation.ticketId?[detail.conversation.ticketId]:[])).map(id=><div key={id} className="flex items-center gap-2"><span>{tickets.find(t=>t.id===id)?.ticketNumber || id}</span><button type="button" onClick={()=>{if(window.confirm('Unlink this ticket from the conversation?'))void changeTicketLink(id,true);}} className="rounded border px-2 py-1">Unlink</button></div>)}<label className="block">Link a ticket<select aria-label="Link a ticket" value={linkTicketId} onChange={e=>setLinkTicketId(e.target.value)} className="m-2 rounded border p-2"><option value="">Choose a ticket</option>{tickets.filter(t=>t.customerId===detail.conversation.customerId).map(t=><option key={t.id} value={t.id}>{t.ticketNumber}: {t.subject}</option>)}</select></label><button type="button" disabled={!linkTicketId} onClick={()=>void changeTicketLink(linkTicketId)} className="rounded border px-3 py-2">Link ticket</button></aside>}
    </div>
  );
};
