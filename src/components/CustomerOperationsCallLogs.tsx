import React from 'react';
import { auth } from '../services/auth';
import type {
  CustomerOperationsCallDirection,
  CustomerOperationsCallLog,
  CustomerOperationsCallOutcome,
  CustomerOperationsCustomer,
} from '../types/customerOperations';

type Page<T> = { items: T[]; nextCursor: string | null };

async function callLogRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

const directions: CustomerOperationsCallDirection[] = ['inbound', 'outbound'];
const outcomes: CustomerOperationsCallOutcome[] = [
  'answered', 'missed', 'voicemail', 'callback_requested', 'other',
];

export const CustomerOperationsCallLogs: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [customers, setCustomers] = React.useState<CustomerOperationsCustomer[]>([]);
  const [calls, setCalls] = React.useState<CustomerOperationsCallLog[]>([]);
  const [customerId, setCustomerId] = React.useState('');
  const [direction, setDirection] = React.useState<CustomerOperationsCallDirection>('inbound');
  const [outcome, setOutcome] = React.useState<CustomerOperationsCallOutcome>('answered');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [durationSeconds, setDurationSeconds] = React.useState('0');
  const [summary, setSummary] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const base = `/api/customer-operations/businesses/${encodeURIComponent(businessId)}`;

  const loadCalls = React.useCallback(async () => {
    const result = await callLogRequest<CustomerOperationsCallLog[]>(`${base}/calls?limit=100`);
    setCalls(result);
  }, [base]);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    void Promise.all([
      callLogRequest<Page<CustomerOperationsCustomer>>(`${base}/customers?limit=100`),
      loadCalls(),
    ]).then(([customerPage]) => {
      if (active) setCustomers(customerPage.items);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load call logs.');
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [base, loadCalls]);

  React.useEffect(() => {
    const customer = customers.find((item) => item.id === customerId);
    if (customer && !phoneNumber) setPhoneNumber(customer.phone || customer.whatsapp || '');
  }, [customerId, customers, phoneNumber]);

  const logCall = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      await callLogRequest<CustomerOperationsCallLog>(`${base}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          direction,
          outcome,
          phoneNumber,
          durationSeconds: Number(durationSeconds),
          summary,
        }),
      });
      setSummary('');
      setDurationSeconds('0');
      setNotice('Call activity recorded.');
      await loadCalls();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the call.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
      <form onSubmit={logCall} className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Log a call</h2>
          <p className="mt-1 text-sm text-slate-500">Record call activity manually; audio is not captured or stored.</p>
        </div>
        <label className="block text-xs font-medium text-slate-600">Customer
          <select required value={customerId} onChange={(event) => {
            setCustomerId(event.target.value);
            setPhoneNumber('');
          }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">Select a customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">Direction
            <select value={direction} onChange={(event) => setDirection(event.target.value as CustomerOperationsCallDirection)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {directions.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">Outcome
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as CustomerOperationsCallOutcome)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {outcomes.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium text-slate-600">Phone number
          <input maxLength={40} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-slate-600">Duration in seconds
          <input type="number" min="0" max="86400" step="1" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-slate-600">Summary
          <textarea required minLength={2} maxLength={2000} rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button disabled={isSaving || !customers.length} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {isSaving ? 'Saving…' : 'Save call log'}
        </button>
        {!customers.length && <p className="text-xs text-amber-700">Add a customer before recording a call.</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-semibold">Recent call activity</h2>
          <p className="mt-1 text-sm text-slate-500">Visible only to members of this business workspace.</p>
        </div>
        {isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading call logs…</p>
          : calls.length ? (
            <div className="divide-y divide-slate-100">
              {calls.map((call) => (
                <article key={call.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{call.customerName} · {pretty(call.direction)} · {pretty(call.outcome)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {call.phoneNumber || 'No number recorded'} · {formatDuration(call.durationSeconds)} · {call.agentEmail}
                      </p>
                    </div>
                    <time className="text-xs text-slate-500">{new Date(call.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{call.summary}</p>
                </article>
              ))}
            </div>
          ) : <p className="p-8 text-center text-sm text-slate-500">No calls have been recorded.</p>}
      </section>
    </div>
  );
};
