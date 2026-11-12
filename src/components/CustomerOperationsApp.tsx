import { WorkspaceNavigation } from './WorkspaceNavigation';
import React from 'react';
import { Building2, CircleUserRound, Inbox, LayoutDashboard, Phone, Shield, Users } from 'lucide-react';
import { User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { CustomerOperationsBusinessWorkspace } from './CustomerOperationsBusinessWorkspace';
import { CustomerOperationsInbox } from './CustomerOperationsInbox';
import { CustomerOperationsCallLogs } from './CustomerOperationsCallLogs';
import { auth, initAuth } from '../services/auth';
import type {
  CustomerOperationsAccess,
  CustomerOperationsBusiness,
  CustomerOperationsPlatformMembership,
} from '../types/customerOperations';

const CustomerOperationsPlatform = React.lazy(() => import('./CustomerOperationsPlatform'));
const CustomerOperationsOperations = React.lazy(() => import('./CustomerOperationsOperations'));
const CustomerOperationsReports = React.lazy(() => import('./CustomerOperationsReports'));

type Section = 'overview' | 'businesses' | 'team' | 'customers' | 'tickets' | 'inbox' | 'calls' | 'reports' | 'operations' | 'platform-support';
type Workspace = { id: string; label: string; role: string };

async function customerOperationsFetch(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return fetch(path, { ...init, headers });
}

async function responseData<T>(response: Response): Promise<T> {
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

export const CustomerOperationsApp: React.FC = () => {
  const [user, setUser] = React.useState<User | null>(null);
  const [access, setAccess] = React.useState<CustomerOperationsAccess | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [section, setSection] = React.useState<Section>('overview');
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [businesses, setBusinesses] = React.useState<CustomerOperationsBusiness[]>([]);
  const [platformMembers, setPlatformMembers] = React.useState<CustomerOperationsPlatformMembership[]>([]);
  const [businessName, setBusinessName] = React.useState('');
  const [ownerEmail, setOwnerEmail] = React.useState('');
  const [platformMemberEmail, setPlatformMemberEmail] = React.useState('');
  const [invitationLink,setInvitationLink]=React.useState('');
  const [notice, setNotice] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const isPlatformAdmin = access?.platformRole === 'platform_super_admin';
  const workspaces: Workspace[] = [
    ...(access?.platformRole ? [{
      id: 'platform',
      label: 'Platform administration',
      role: access.platformRole === 'platform_super_admin' ? 'Platform Super Admin' : 'Platform Support Agent',
    }] : []),
    ...(access?.businesses || []).map((membership) => ({
      id: `business:${membership.businessId}`,
      label: membership.businessName,
      role: membership.role,
    })),
  ];
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) || workspaces[0];
  const isBusinessWorkspace = selectedWorkspace?.id.startsWith('business:') || false;
  const isPlatformWorkspace = selectedWorkspace?.id === 'platform';
  const showPlatformAdmin = isPlatformAdmin && isPlatformWorkspace;
  const selectedBusinessId = isBusinessWorkspace ? selectedWorkspace?.id.slice('business:'.length) || '' : '';

  const loadAdminData = React.useCallback(async () => {
    if (!isPlatformAdmin) return;
    const [businessResponse, memberResponse] = await Promise.all([
      customerOperationsFetch('/api/customer-operations/businesses'),
      customerOperationsFetch('/api/customer-operations/platform-members'),
    ]);
    const [businessData, memberData] = await Promise.all([
      responseData<CustomerOperationsBusiness[]>(businessResponse),
      responseData<CustomerOperationsPlatformMembership[]>(memberResponse),
    ]);
    setBusinesses(businessData);
    setPlatformMembers(memberData);
  }, [isPlatformAdmin]);

  const loadAccess = React.useCallback(async (currentUser: User) => {
    setIsLoading(true);
    setLoadError('');
    setUser(currentUser);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/customer-operations/access', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextAccess = await responseData<CustomerOperationsAccess>(response);
      setAccess(nextAccess);
      setWorkspaceId((current) => current && (
        (current === 'platform' && Boolean(nextAccess.platformRole))
        || nextAccess.businesses.some((membership) => current === `business:${membership.businessId}`)
      )
        ? current
        : nextAccess.platformRole ? 'platform' : `business:${nextAccess.businesses[0]?.businessId || ''}`);
      setUser(currentUser);
    } catch (error) {
      setAccess(null);
      setLoadError(error instanceof Error ? error.message : 'Could not verify access.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => { void loadAccess(currentUser); },
      () => {
        setUser(null);
        setAccess(null);
        setSection('overview');
        setWorkspaceId('');
        setLoadError('');
        setIsLoading(false);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [loadAccess]);

  React.useEffect(() => {
    if (isPlatformAdmin) {
      void loadAdminData().catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : 'Could not load platform administration data.');
      });
    } else {
      setBusinesses([]);
      setPlatformMembers([]);
    }
  }, [isPlatformAdmin, loadAdminData]);

  const createBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setActionError('');
    setNotice('');
    try {
      const response = await customerOperationsFetch('/api/customer-operations/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: businessName, ownerEmail }),
      });
      const created=await responseData<CustomerOperationsBusiness & {invitationLink:string}>(response);setInvitationLink(created.invitationLink);
      setBusinessName('');
      setOwnerEmail('');
      setNotice('Business created. Share the private invitation link with its owner.');
      await loadAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create the business.');
    } finally {
      setIsSaving(false);
    }
  };

  const grantPlatformAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setActionError('');
    setNotice('');
    try {
      const response = await customerOperationsFetch('/api/customer-operations/platform-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: platformMemberEmail, role: 'platform_support_agent' }),
      });
      const invited=await responseData<CustomerOperationsPlatformMembership & {invitationLink:string}>(response);setInvitationLink(invited.invitationLink);
      setPlatformMemberEmail('');
      setNotice('Platform Support Agent access granted.');
      await loadAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not grant platform access.');
    } finally {
      setIsSaving(false);
    }
  };

  const revokePlatformAccess = async (email: string) => {
    if (!window.confirm(`Remove Platform Support Agent access for ${email}?`)) return;
    setActionError('');
    setNotice('');
    try {
      const response = await customerOperationsFetch(
        `/api/customer-operations/platform-members/${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );
      await responseData<{ success: boolean }>(response);
      setNotice(`Platform access removed for ${email}.`);
      await loadAdminData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not remove platform access.');
    }
  };

  const navItems: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} /> },
    { id: 'platform-support', label: isBusinessWorkspace ? 'Contact platform' : 'Platform support', icon: <Inbox size={17} /> },
    ...(showPlatformAdmin ? [
      { id: 'businesses' as const, label: 'Businesses', icon: <Building2 size={17} /> },
      { id: 'team' as const, label: 'Support agents', icon: <Users size={17} /> },
    ] : []),
    ...(isBusinessWorkspace ? [
      { id: 'customers' as const, label: 'Customers', icon: <CircleUserRound size={17} /> },
      { id: 'tickets' as const, label: 'Tickets', icon: <Shield size={17} /> },
      { id: 'inbox' as const, label: 'Inbox', icon: <Inbox size={17} /> },
      { id: 'calls' as const, label: 'Call logs', icon: <Phone size={17} /> },
      { id: 'operations' as const, label: 'Operations', icon: <Users size={17} /> },
      ...(['business_owner', 'business_manager'].includes(selectedWorkspace?.role || '') ? [{ id: 'reports' as const, label: 'Reports', icon: <LayoutDashboard size={17} /> }] : []),
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Shield size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold">Customer Support</p>
            <p className="text-xs text-slate-500">Merk Discovery</p>
          </div>
        </div>
        <WorkspaceNavigation active="support" />
        <GoogleSignInButton identityOnly user={user} onAuthChange={(nextUser) => {
          setUser(nextUser);
          if (nextUser) void loadAccess(nextUser);
          else {
            setAccess(null);
            setWorkspaceId('');
            setSection('overview');
            setLoadError('');
          }
        }} isLoading={isLoading} />
      </header>

      {isLoading ? (
        <main className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-slate-500">Checking access…</main>
      ) : !user ? (
        <main className="mx-auto max-w-lg px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">Customer Support</h1>
          <p className="mt-3 text-sm text-slate-600">Sign in with your verified Google account to continue.</p>
          {loadError && <p role="alert" className="mt-4 text-sm text-rose-700">{loadError}</p>}
        </main>
      ) : !access?.allowed ? (
        <main className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-xl font-semibold">No Customer Support access</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {loadError || `The signed-in account ${access?.email || user.email || ''} has not been assigned a platform or business workspace.`}
          </p>
        </main>
      ) : (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1440px] flex-col md:flex-row">
          <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r">
            <label htmlFor="operations-workspace" className="mb-2 block px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Workspace
            </label>
            {workspaces.length > 1 ? (
              <select
                id="operations-workspace"
                value={selectedWorkspace?.id || ''}
                onChange={(event) => {
                  setWorkspaceId(event.target.value);
                  setSection('overview');
                }}
                className="mb-5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm capitalize"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.label}</option>
                ))}
              </select>
            ) : (
              <div className="mb-5 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {selectedWorkspace?.label || 'Workspace'}
              </div>
            )}
            <nav aria-label="Customer Operations navigation" className="space-y-1">
              {navItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  aria-current={section === item.id ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    section === item.id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item.icon}{item.label}
                </button>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 p-5 sm:p-8">
            <div className="mx-auto max-w-5xl">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {section === 'overview' ? selectedWorkspace?.label
                      : section === 'businesses' ? 'Businesses'
                        : section === 'team' ? 'Support agents'
                          : section === 'customers' ? 'Customers'
                            : section === 'tickets' ? 'Tickets'
                              : section === 'inbox' ? 'Inbox' : section === 'reports' ? 'Reports' : section === 'operations' ? 'Operations' : section === 'platform-support' ? (isBusinessWorkspace?'Contact platform support':'Platform support') : 'Call logs'}
                  </h1>
                  <p className="mt-1 text-sm capitalize text-slate-500">
                    {selectedWorkspace?.role.replaceAll('_', ' ') || 'Workspace access'}
                  </p>
                </div>
                <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 sm:flex">
                  <CircleUserRound size={14} /> {access.email}
                </span>
              </div>

              {actionError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}</p>}
              {invitationLink && <div className="mb-4 rounded border p-4"><label className="text-sm">Private invitation link<input readOnly value={invitationLink} className="mt-2 w-full rounded border p-2" /></label><button className="mt-2 rounded border px-3 py-2" onClick={()=>void navigator.clipboard.writeText(invitationLink).then(()=>setNotice('Invitation link copied.')).catch(()=>setActionError('Copy the link from the field.'))}>Copy invitation</button></div>}
              {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

              {section==='platform-support'&&<React.Suspense fallback={<p role="status">Loading platform support…</p>}><CustomerOperationsPlatform key={selectedWorkspace?.id} businessId={isBusinessWorkspace?selectedBusinessId:undefined} platformRole={isPlatformWorkspace?access?.platformRole||undefined:undefined} businesses={businesses}/></React.Suspense>}
              {section === 'overview' && (
                <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                  <h2 className="text-base font-semibold">Customer Operations workspace</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Manage business-scoped customers, tickets, conversations, and call activity. Email delivery depends on local SMTP configuration; WhatsApp remains disabled until an official provider is configured.
                  </p>
                  {isBusinessWorkspace && (
                    <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      This workspace is scoped to your business membership. Platform staff do not receive access to its customer records through this workspace.
                    </p>
                  )}
                  {showPlatformAdmin && (
                    <button
                      type="button"
                      onClick={() => setSection('businesses')}
                      className="mt-6 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      Set up a business
                    </button>
                  )}
                </section>
              )}

              {section === 'businesses' && showPlatformAdmin && (
                <div className="space-y-6">
                  <form onSubmit={createBusiness} className="rounded-xl border border-slate-200 bg-white p-6">
                    <h2 className="font-semibold">Add a business workspace</h2>
                    <p className="mt-1 text-sm text-slate-500">The verified email entered here receives the initial Business Owner membership.</p>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium">
                        Business name
                        <input required maxLength={150} value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                      </label>
                      <label className="text-sm font-medium">
                        Owner email
                        <input required type="email" maxLength={254} value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                      </label>
                    </div>
                    <button disabled={isSaving} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                      {isSaving ? 'Creating…' : 'Create workspace'}
                    </button>
                  </form>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <h2 className="border-b border-slate-200 px-6 py-4 font-semibold">Registered businesses</h2>
                    {businesses.length ? businesses.map((business) => (
                      <div key={business.id} className="flex items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0">
                        <div>
                          <p className="text-sm font-medium">{business.name}</p>
                          <p className="mt-1 text-xs text-slate-500">Created {new Date(business.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs capitalize text-emerald-700">{business.status}</span>
                      </div>
                    )) : <p className="px-6 py-8 text-sm text-slate-500">No business workspaces have been created.</p>}
                  </section>
                </div>
              )}

              {section === 'team' && showPlatformAdmin && (
                <div className="space-y-6">
                  <form onSubmit={grantPlatformAccess} className="rounded-xl border border-slate-200 bg-white p-6">
                    <h2 className="font-semibold">Grant platform support access</h2>
                    <p className="mt-1 text-sm text-slate-500">Platform Support Agents cannot access private business customer workspaces by default.</p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <input required type="email" maxLength={254} aria-label="Support agent email" placeholder="agent@example.com" value={platformMemberEmail} onChange={(event) => setPlatformMemberEmail(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <button disabled={isSaving} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                        Grant access
                      </button>
                    </div>
                  </form>
                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <h2 className="border-b border-slate-200 px-6 py-4 font-semibold">Platform Support Agents</h2>
                    {platformMembers.length ? platformMembers.map((member) => (
                      <div key={member.email} className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0">
                        <div>
                          <p className="text-sm font-medium">{member.email}</p>
                          <p className="mt-1 text-xs capitalize text-slate-500">{member.role.replaceAll('_', ' ')}</p>
                        </div>
                        <button type="button" onClick={() => void revokePlatformAccess(member.email)} className="rounded-md px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">
                          Remove access
                        </button>
                      </div>
                    )) : <p className="px-6 py-8 text-sm text-slate-500">No platform support agents have been added.</p>}
                  </section>
                </div>
              )}

              {isBusinessWorkspace && selectedBusinessId && (section === 'customers' || section === 'tickets') && (
                <CustomerOperationsBusinessWorkspace
                  key={selectedBusinessId}
                  businessId={selectedBusinessId}
                  panel={section}
                  onNavigate={setSection}
                />
              )}
              {isBusinessWorkspace && selectedBusinessId && section === 'inbox' && (
                <CustomerOperationsInbox key={selectedBusinessId} businessId={selectedBusinessId} />
              )}
              {isBusinessWorkspace && selectedBusinessId && section === 'operations' && (
                <React.Suspense fallback={<p role="status">Loading operations…</p>}>
                  <CustomerOperationsOperations key={selectedBusinessId} businessId={selectedBusinessId} role={selectedWorkspace?.role || ''} />
                </React.Suspense>
              )}
              {isBusinessWorkspace && selectedBusinessId && section === 'reports' && (
                <React.Suspense fallback={<p role="status">Loading reports…</p>}>
                  <CustomerOperationsReports key={selectedBusinessId} businessId={selectedBusinessId} />
                </React.Suspense>
              )}
              {isBusinessWorkspace && selectedBusinessId && section === 'calls' && (
                <CustomerOperationsCallLogs key={selectedBusinessId} businessId={selectedBusinessId} />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
};
