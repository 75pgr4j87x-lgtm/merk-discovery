import {GuestIntakeSettings} from './CustomerOperationsGuestIntake';
import React from 'react';
import { auth } from '../services/auth';
import type {
  CustomerOperationsActivity,
  CustomerOperationsBusinessMembership,
  CustomerOperationsCustomer,
  CustomerOperationsCustomerStatus,
  CustomerOperationsInternalNote,
  CustomerOperationsTicket,
  CustomerOperationsTicketEvent,
  CustomerOperationsTicketPriority,
  CustomerOperationsTicketStatus,
} from '../types/customerOperations';

type Panel = 'customers' | 'tickets';
type Page<T> = { items: T[]; nextCursor: string | null };
type CustomerDetail = {
  customer: CustomerOperationsCustomer;
  internalNotes: CustomerOperationsInternalNote[];
  activity: CustomerOperationsActivity[];
};
type TicketDetail = {
  ticket: CustomerOperationsTicket;
  internalNotes: CustomerOperationsInternalNote[];
  events: CustomerOperationsTicketEvent[];
};

async function operationsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `****** await user.getIdToken()}`);
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

function queryString(values: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const ticketStatuses: CustomerOperationsTicketStatus[] = [
  'new', 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed',
];
const ticketPriorities: CustomerOperationsTicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export const CustomerOperationsBusinessWorkspace: React.FC<{
  businessId: string;
  panel: Panel;
  onNavigate: (panel: Panel) => void;
}> = ({ businessId, panel, onNavigate }) => {
  const [customers, setCustomers] = React.useState<CustomerOperationsCustomer[]>([]);
  const [customerOptions, setCustomerOptions] = React.useState<CustomerOperationsCustomer[]>([]);
  const [tickets, setTickets] = React.useState<CustomerOperationsTicket[]>([]);
  const [members, setMembers] = React.useState<CustomerOperationsBusinessMembership[]>([]);
  const [customerCursor, setCustomerCursor] = React.useState<string | null>(null);
  const [ticketCursor, setTicketCursor] = React.useState<string | null>(null);
  const [customerHasMore, setCustomerHasMore] = React.useState(false);
  const [ticketHasMore, setTicketHasMore] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState('');
  const [selectedTicketId, setSelectedTicketId] = React.useState('');
  const [customerDetail, setCustomerDetail] = React.useState<CustomerDetail | null>(null);
  const [ticketDetail, setTicketDetail] = React.useState<TicketDetail | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState('');
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [customerEmail, setCustomerEmail] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerCompany, setCustomerCompany] = React.useState('');
  const [customerTags, setCustomerTags] = React.useState('');
  const [ticketCustomerId, setTicketCustomerId] = React.useState('');
  const [ticketSubject, setTicketSubject] = React.useState('');
  const [ticketDescription, setTicketDescription] = React.useState('');
  const [ticketCategory, setTicketCategory] = React.useState('General');
  const [ticketPriority, setTicketPriority] = React.useState<CustomerOperationsTicketPriority>('normal');
  const [ticketAssignee, setTicketAssignee] = React.useState('');
  const [noteBody, setNoteBody] = React.useState('');

  const base = `/api/customer-operations/businesses/${encodeURIComponent(businessId)}`;

  const loadMembers = React.useCallback(async () => {
    setMembers(await operationsRequest<CustomerOperationsBusinessMembership[]>(`${base}/members`));
  }, [base]);

  const loadCustomers = React.useCallback(async (append = false, cursor?: string | null) => {
    const query = queryString({
      limit: '50',
      search,
      status: statusFilter,
      ...(append && cursor ? { cursor } : {}),
    });
    const page = await operationsRequest<Page<CustomerOperationsCustomer>>(`${base}/customers?${query}`);
    setCustomers((current) => append ? [...current, ...page.items] : page.items);
    setCustomerCursor(page.nextCursor);
    setCustomerHasMore(Boolean(page.nextCursor));
  }, [base, search, statusFilter]);

  const loadCustomerOptions = React.useCallback(async () => {
    const page = await operationsRequest<Page<CustomerOperationsCustomer>>(`${base}/customers?limit=100`);
    setCustomerOptions(page.items);
  }, [base]);

  const loadTickets = React.useCallback(async (append = false, cursor?: string | null) => {
    const query = queryString({
      limit: '50',
      search,
      status: statusFilter,
      priority: priorityFilter,
      ...(append && cursor ? { cursor } : {}),
    });
    const page = await operationsRequest<Page<CustomerOperationsTicket>>(`${base}/tickets?${query}`);
    setTickets((current) => append ? [...current, ...page.items] : page.items);
    setTicketCursor(page.nextCursor);
    setTicketHasMore(Boolean(page.nextCursor));
  }, [base, search, statusFilter, priorityFilter]);

  const loadCustomerDetail = React.useCallback(async (id: string) => {
    if (!id) {
      setCustomerDetail(null);
      return;
    }
    setCustomerDetail(await operationsRequest<CustomerDetail>(`${base}/customers/${encodeURIComponent(id)}`));
  }, [base]);

  const loadTicketDetail = React.useCallback(async (id: string) => {
    if (!id) {
      setTicketDetail(null);
      return;
    }
    setTicketDetail(await operationsRequest<TicketDetail>(`${base}/tickets/${encodeURIComponent(id)}`));
  }, [base]);

  React.useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    void Promise.all([
      loadMembers(),
      loadCustomerOptions(),
      panel === 'customers' ? loadCustomers() : loadTickets(),
    ]).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load workspace data.');
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [businessId, panel, loadMembers, loadCustomerOptions, loadCustomers, loadTickets]);

  React.useEffect(() => {
    setStatusFilter('');
    setPriorityFilter('');
    setNoteBody('');
  }, [businessId, panel]);

  React.useEffect(() => {
    setError('');
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void (panel === 'customers' ? loadCustomers() : loadTickets())
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load records.'))
        .finally(() => setIsLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [panel, search, statusFilter, priorityFilter, loadCustomers, loadTickets]);

  React.useEffect(() => {
    void loadCustomerDetail(selectedCustomerId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load customer details.');
    });
  }, [selectedCustomerId, loadCustomerDetail]);

  React.useEffect(() => {
    void loadTicketDetail(selectedTicketId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load ticket details.');
    });
  }, [selectedTicketId, loadTicketDetail]);

  React.useEffect(() => {
    if (customers.length && !ticketCustomerId) setTicketCustomerId(customers[0].id);
  }, [customers, ticketCustomerId]);

  const clearAlerts = () => {
    setError('');
    setNotice('');
  };

  const createCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    clearAlerts();
    setIsSaving(true);
    try {
      const customer = await operationsRequest<CustomerOperationsCustomer>(`${base}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          company: customerCompany,
          tags: customerTags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerCompany('');
      setCustomerTags('');
      setShowCreateForm(false);
      setSelectedCustomerId(customer.id);
      setNotice('Customer created.');
      await Promise.all([loadCustomers(), loadCustomerOptions()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create customer.');
    } finally {
      setIsSaving(false);
    }
  };

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    clearAlerts();
    setIsSaving(true);
    try {
      const ticket = await operationsRequest<CustomerOperationsTicket>(`${base}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: ticketCustomerId,
          subject: ticketSubject,
          description: ticketDescription,
          category: ticketCategory,
          priority: ticketPriority,
          assignedAgent: ticketAssignee,
        }),
      });
      setTicketSubject('');
      setTicketDescription('');
      setTicketCategory('General');
      setTicketPriority('normal');
      setTicketAssignee('');
      setShowCreateForm(false);
      setSelectedTicketId(ticket.id);
      setNotice(`${ticket.ticketNumber} created.`);
      await loadTickets();
      await Promise.all([loadCustomers(), loadCustomerOptions()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create ticket.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customerDetail) return;
    clearAlerts();
    const formData = new FormData(event.currentTarget);
    setIsSaving(true);
    try {
      await operationsRequest<CustomerOperationsCustomer>(`${base}/customers/${encodeURIComponent(customerDetail.customer.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          whatsapp: formData.get('whatsapp'),
          company: formData.get('company'),
          assignedOwner: formData.get('assignedOwner'),
          status: formData.get('status'),
          tags: String(formData.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      await Promise.all([loadCustomerDetail(customerDetail.customer.id), loadCustomers()]);
      setNotice('Customer details updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update customer.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateTicket = async (changes: Record<string, string>) => {
    if (!ticketDetail) return;
    clearAlerts();
    try {
      await operationsRequest<CustomerOperationsTicket>(`${base}/tickets/${encodeURIComponent(ticketDetail.ticket.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      await Promise.all([loadTicketDetail(ticketDetail.ticket.id), loadTickets()]);
      setNotice('Ticket updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update ticket.');
    }
  };

  const addNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteBody.trim()) return;
    clearAlerts();
    const path = panel === 'customers' && selectedCustomerId
      ? `${base}/customers/${encodeURIComponent(selectedCustomerId)}/internal-notes`
      : selectedTicketId ? `${base}/tickets/${encodeURIComponent(selectedTicketId)}/internal-notes` : '';
    if (!path) return;
    try {
      await operationsRequest<CustomerOperationsInternalNote>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody }),
      });
      setNoteBody('');
      if (panel === 'customers') await loadCustomerDetail(selectedCustomerId);
      else await loadTicketDetail(selectedTicketId);
      setNotice('Internal note added.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add internal note.');
    }
  };

  const list = panel === 'customers' ? customers : tickets;
  const listTitle = panel === 'customers' ? 'Customers' : 'Tickets';

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <div className="xl:col-span-2"><GuestIntakeSettings businessId={businessId} /></div>
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-semibold">{listTitle}</h2>
            <p className="mt-1 text-xs text-slate-500">Records are private to this business workspace.</p>
          </div>
          <button type="button" onClick={() => setShowCreateForm((value) => !value)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {showCreateForm ? 'Cancel' : panel === 'customers' ? 'Add customer' : 'Create ticket'}
          </button>
        </div>

        {showCreateForm && panel === 'customers' && (
          <form onSubmit={createCustomer} className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Name
              <input required minLength={2} maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">Email
              <input type="email" maxLength={254} value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">Phone
              <input maxLength={40} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">Company
              <input maxLength={150} value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">Tags (comma separated)
              <input maxLength={500} value={customerTags} onChange={(event) => setCustomerTags(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <button disabled={isSaving} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2">
              {isSaving ? 'Saving…' : 'Save customer'}
            </button>
          </form>
        )}

        {showCreateForm && panel === 'tickets' && (
          <form onSubmit={createTicket} className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4">
            <label className="text-xs font-medium text-slate-600">Customer
              <select required value={ticketCustomerId} onChange={(event) => setTicketCustomerId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Select a customer</option>
                {customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.email ? ` · ${customer.email}` : ''}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Subject
              <input required minLength={3} maxLength={180} value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-slate-600">Description
              <textarea required minLength={2} maxLength={5000} rows={3} value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">Category
                <input required maxLength={80} value={ticketCategory} onChange={(event) => setTicketCategory(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-slate-600">Priority
                <select value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value as CustomerOperationsTicketPriority)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  {ticketPriorities.map((priority) => <option key={priority} value={priority}>{pretty(priority)}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Assign to
                <select value={ticketAssignee} onChange={(event) => setTicketAssignee(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {members.map((member) => <option key={member.email} value={member.email}>{member.email}</option>)}
                </select>
              </label>
            </div>
            <button disabled={isSaving || !customers.length} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {isSaving ? 'Saving…' : 'Create ticket'}
            </button>
            {!customerOptions.length && <p className="text-xs text-amber-700">Add a customer before creating a ticket.</p>}
          </form>
        )}

        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(150px,1fr)_auto_auto]">
          <input aria-label={`Search ${listTitle.toLowerCase()}`} placeholder={`Search ${listTitle.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {(panel === 'customers' ? ['active', 'inactive'] : ticketStatuses).map((value) => <option key={value} value={value}>{pretty(value)}</option>)}
          </select>
          {panel === 'tickets' ? (
            <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">All priorities</option>
              {ticketPriorities.map((priority) => <option key={priority} value={priority}>{pretty(priority)}</option>)}
            </select>
          ) : <span />}
        </div>

        {error && <p role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {notice && <p role="status" className="m-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

        {isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading {listTitle.toLowerCase()}…</p>
          : list.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No {listTitle.toLowerCase()} match this view.</p>
            : (
              <div className="divide-y divide-slate-100">
                {panel === 'customers' ? customers.map((customer) => (
                  <button type="button" key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedCustomerId === customer.id ? 'bg-slate-50' : ''}`}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{customer.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${customer.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{pretty(customer.status)}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{customer.email || customer.phone || 'No contact details'}{customer.company ? ` · ${customer.company}` : ''}</span>
                  </button>
                )) : tickets.map((ticket) => (
                  <button type="button" key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)} className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedTicketId === ticket.id ? 'bg-slate-50' : ''}`}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{ticket.subject}</span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${ticket.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : ticket.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{pretty(ticket.priority)}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{ticket.ticketNumber} · {ticket.customerName} · {pretty(ticket.status)}{ticket.assignedAgent ? ` · ${ticket.assignedAgent}` : ' · Unassigned'}</span>
                  </button>
                ))}
              </div>
            )}
        {panel === 'customers' && customerHasMore && (
          <button type="button" onClick={() => {
            void loadCustomers(true, customerCursor).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load more customers.'));
          }} className="w-full border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Load more customers</button>
        )}
        {panel === 'tickets' && ticketHasMore && (
          <button type="button" onClick={() => {
            void loadTickets(true, ticketCursor).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load more tickets.'));
          }} className="w-full border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Load more tickets</button>
        )}
      </section>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
        {panel === 'customers' ? customerDetail ? (
          <div>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Customer profile</p>
                <h2 className="mt-1 text-lg font-semibold">{customerDetail.customer.name}</h2>
              </div>
              <button type="button" onClick={() => {
                setTicketCustomerId(customerDetail.customer.id);
                onNavigate('tickets');
              }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50">Create ticket</button>
            </div>
            <form key={customerDetail.customer.id} onSubmit={(event) => void updateCustomer(event)} className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Name<input required name="name" defaultValue={customerDetail.customer.name} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Email<input type="email" name="email" defaultValue={customerDetail.customer.email} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Phone<input name="phone" defaultValue={customerDetail.customer.phone} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">WhatsApp<input name="whatsapp" defaultValue={customerDetail.customer.whatsapp} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Company<input name="company" defaultValue={customerDetail.customer.company} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">Assigned owner
                <select name="assignedOwner" defaultValue={customerDetail.customer.assignedOwner} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="">Unassigned</option>{members.map((member) => <option key={member.email} value={member.email}>{member.email}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Status
                <select name="status" defaultValue={customerDetail.customer.status} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Tags<input name="tags" defaultValue={customerDetail.customer.tags.join(', ')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>
              <button disabled={isSaving} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2">{isSaving ? 'Saving…' : 'Save profile'}</button>
            </form>
            <div className="mt-7 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-semibold">Tickets</h3>
              <CustomerTicketLinks base={base} customerId={customerDetail.customer.id} onOpen={(id) => {
                setSelectedTicketId(id);
                onNavigate('tickets');
              }} />
            </div>
            <InternalNotesForm notes={customerDetail.internalNotes} body={noteBody} setBody={setNoteBody} onSubmit={addNote} />
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Recent activity</h3>
              <ul className="mt-3 space-y-3">
                {customerDetail.activity.map((item) => <li key={item.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-xs text-slate-700">{pretty(item.action)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{item.actorEmail} · {new Date(item.createdAt).toLocaleString()}</p>
                </li>)}
                {!customerDetail.activity.length && <li className="text-xs text-slate-500">No activity yet.</li>}
              </ul>
            </div>
          </div>
        ) : <p className="py-12 text-center text-sm text-slate-500">Select a customer to view their profile and history.</p>
          : ticketDetail ? (
            <div>
              <p className="text-xs text-slate-500">{ticketDetail.ticket.ticketNumber} · {ticketDetail.ticket.customerName}</p>
              <h2 className="mt-1 text-lg font-semibold">{ticketDetail.ticket.subject}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ticketDetail.ticket.description}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">Status
                  <select value={ticketDetail.ticket.status} onChange={(event) => void updateTicket({ status: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    {ticketStatuses.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">Priority
                  <select value={ticketDetail.ticket.priority} onChange={(event) => void updateTicket({ priority: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    {ticketPriorities.map((priority) => <option key={priority} value={priority}>{pretty(priority)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600 sm:col-span-2">Assigned agent
                  <select value={ticketDetail.ticket.assignedAgent} onChange={(event) => void updateTicket({ assignedAgent: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Unassigned</option>{members.map((member) => <option key={member.email} value={member.email}>{member.email}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" onClick={() => {
                setSelectedCustomerId(ticketDetail.ticket.customerId);
                onNavigate('customers');
              }} className="mt-4 text-xs font-medium text-blue-700 hover:underline">View customer profile</button>
              <InternalNotesForm notes={ticketDetail.internalNotes} body={noteBody} setBody={setNoteBody} onSubmit={addNote} />
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Ticket history</h3>
                <ul className="mt-3 space-y-3">
                  {ticketDetail.events.map((item) => <li key={item.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-xs text-slate-700">{pretty(item.action)}{Object.keys(item.changes).length ? ` · ${Object.entries(item.changes).map(([field, change]) => `${pretty(field)}: ${change.from || '—'} → ${change.to || '—'}`).join(' · ')}` : ''}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{item.actorEmail} · {new Date(item.createdAt).toLocaleString()}</p>
                  </li>)}
                  {!ticketDetail.events.length && <li className="text-xs text-slate-500">No ticket history yet.</li>}
                </ul>
              </div>
            </div>
          ) : <p className="py-12 text-center text-sm text-slate-500">Select a ticket to review and update it.</p>}
      </section>
    </div>
  );
};

const CustomerTicketLinks: React.FC<{
  base: string;
  customerId: string;
  onOpen: (id: string) => void;
}> = ({ base, customerId, onOpen }) => {
  const [tickets, setTickets] = React.useState<CustomerOperationsTicket[]>([]);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let active = true;
    void operationsRequest<Page<CustomerOperationsTicket>>(
      `${base}/tickets?${queryString({ limit: '50', customerId })}`
    ).then((page) => {
      if (active) setTickets(page.items);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load customer tickets.');
    });
    return () => { active = false; };
  }, [base, customerId]);
  return (
    <div className="mt-3 space-y-2">
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => onOpen(ticket.id)} className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100">
        <span className="truncate text-xs font-medium">{ticket.ticketNumber} · {ticket.subject}</span>
        <span className="shrink-0 text-[11px] text-slate-500">{pretty(ticket.status)}</span>
      </button>)}
      {!tickets.length && !error && <p className="text-xs text-slate-500">No tickets for this customer.</p>}
    </div>
  );
};

const InternalNotesForm: React.FC<{
  notes: CustomerOperationsInternalNote[];
  body: string;
  setBody: (body: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}> = ({ notes, body, setBody, onSubmit }) => (
  <div className="mt-6 border-t border-slate-200 pt-5">
    <h3 className="text-sm font-semibold">Internal notes <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Private</span></h3>
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <textarea required minLength={2} maxLength={3000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a note visible only to this business's team…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50">Add internal note</button>
    </form>
    <ul className="mt-4 space-y-3">
      {notes.map((note) => <li key={note.id} className="rounded-lg bg-amber-50/70 p-3">
        <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{note.body}</p>
        <p className="mt-2 text-[10px] text-slate-500">{note.authorEmail} · {new Date(note.createdAt).toLocaleString()}</p>
      </li>)}
      {!notes.length && <li className="text-xs text-slate-500">No internal notes.</li>}
    </ul>
  </div>
);
