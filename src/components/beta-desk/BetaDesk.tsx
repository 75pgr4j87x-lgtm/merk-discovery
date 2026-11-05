import React from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  CircleDot,
  Filter,
  LayoutList,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  Paperclip,
  FolderPlus,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { initAuth, studioFetch } from '../../services/auth';
import { TesterLinkRequired } from './TesterPortal';
import { BetaDeskThemeToggle, useBetaDeskTheme } from './BetaDeskTheme';
import { soundTrack } from '../../utils/soundtrack';

type TicketStatus =
  | 'Open'
  | 'Under Review'
  | 'In Progress'
  | 'Awaiting User Response'
  | 'Resolved'
  | 'Closed';
type TicketPriority = 'Critical' | 'High' | 'Medium' | 'Low';
type TicketCategory =
  | 'Bug Report'
  | 'Feature Request'
  | 'General Feedback'
  | 'UI/UX Improvement'
  | 'Technical Issue'
  | 'Other';

interface BetaTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  projectId: string;
  testerId: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  submitterName: string;
  platform: string;
  appVersion: string;
  deviceModel: string;
  operatingSystem: string;
  attachments: BetaAttachment[];
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  resolvedAt?: string;
}

interface BetaAttachment {
  uploadId: string;
  fileName: string;
  contentType: string;
  size: number;
}

interface BetaProject {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
}

interface BetaTester {
  id: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  ticketCount: number;
}

interface BetaAdmin {
  email: string;
  active: boolean;
  invitedBy: string;
  createdAt: string;
}

interface BetaComment {
  id: string;
  authorType: 'tester' | 'admin';
  authorName: string;
  message: string;
  visibility: 'public' | 'internal';
  createdAt: string;
}

const categories: TicketCategory[] = [
  'Bug Report',
  'Feature Request',
  'General Feedback',
  'UI/UX Improvement',
  'Technical Issue',
  'Other',
];
const statuses: TicketStatus[] = [
  'Open',
  'Under Review',
  'In Progress',
  'Awaiting User Response',
  'Resolved',
  'Closed',
];
const priorities: TicketPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const selectClass =
  'rounded-lg border border-[#E5EADF] bg-white px-3 py-2 text-sm text-[#3F4A32] outline-none focus:border-[#7C8B5F]';
const inputClass =
  'w-full rounded-lg border border-[#E5EADF] bg-white px-3 py-2.5 text-sm text-[#3F4A32] outline-none placeholder:text-[#9AA18E] focus:border-[#7C8B5F]';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#3F4A32] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#343D29] disabled:cursor-not-allowed disabled:opacity-50';

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function badgeClass(kind: 'status' | 'priority', value: string) {
  if (kind === 'priority') {
    if (value === 'Critical') return 'bg-rose-50 text-rose-700';
    if (value === 'High') return 'bg-orange-50 text-orange-700';
    if (value === 'Low') return 'bg-stone-100 text-stone-600';
    return 'bg-amber-50 text-amber-700';
  }
  if (value === 'Resolved' || value === 'Closed') return 'bg-emerald-50 text-emerald-700';
  if (value === 'In Progress') return 'bg-blue-50 text-blue-700';
  if (value === 'Awaiting User Response') return 'bg-violet-50 text-violet-700';
  if (value === 'Under Review') return 'bg-amber-50 text-amber-700';
  return 'bg-stone-100 text-stone-700';
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : fallback;
}

export const BetaDeskAdmin: React.FC = () => {
  const { theme, toggle: toggleTheme } = useBetaDeskTheme();
  const [user, setUser] = React.useState<User | null>(null);
  const [access, setAccess] = React.useState<'checking' | 'allowed' | 'denied'>('checking');
  const [canManageAdmins, setCanManageAdmins] = React.useState(false);
  const [tickets, setTickets] = React.useState<BetaTicket[]>([]);
  const [projects, setProjects] = React.useState<BetaProject[]>([]);
  const [admins, setAdmins] = React.useState<BetaAdmin[]>([]);
  const [testers, setTesters] = React.useState<BetaTester[]>([]);
  const [newTesterUrl, setNewTesterUrl] = React.useState('');
  const [creatingTester, setCreatingTester] = React.useState(false);
  const [testerError, setTesterError] = React.useState('');
  const [selectedNumber, setSelectedNumber] = React.useState('');
  const [selectedTicket, setSelectedTicket] = React.useState<BetaTicket | null>(null);
  const [comments, setComments] = React.useState<BetaComment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All statuses');
  const [categoryFilter, setCategoryFilter] = React.useState('All categories');
  const [priorityFilter, setPriorityFilter] = React.useState('All priorities');
  const [platformFilter, setPlatformFilter] = React.useState('All platforms');
  const [page, setPage] = React.useState(0);
  const [view, setView] = React.useState<'list' | 'board'>('list');
  const [reply, setReply] = React.useState('');
  const [visibility, setVisibility] = React.useState<'public' | 'internal'>('public');
  const [assignedTo, setAssignedTo] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [projectFilter, setProjectFilter] = React.useState('All projects');
  const [newProjectName, setNewProjectName] = React.useState('');
  const [newProjectDescription, setNewProjectDescription] = React.useState('');
  const [creatingProject, setCreatingProject] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [adminError, setAdminError] = React.useState('');
  const [managingAdmin, setManagingAdmin] = React.useState(false);
  const pageSize = 12;

  const loadTickets = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await studioFetch('/api/betadesk/admin/tickets');
      if (!response.ok) throw new Error(await responseError(response, 'Could not load tickets.'));
      const data = await response.json() as BetaTicket[];
      setTickets(data);
      setSelectedNumber((current) => current || data[0]?.ticketNumber || '');
      const [projectsResponse, testersResponse, adminsResponse] = await Promise.all([
        studioFetch('/api/betadesk/admin/projects'),
        studioFetch('/api/betadesk/admin/testers'),
        studioFetch('/api/betadesk/admin/admins'),
      ]);
      if (!projectsResponse.ok) throw new Error(await responseError(projectsResponse, 'Could not load projects.'));
      if (!testersResponse.ok) throw new Error(await responseError(testersResponse, 'Could not load tester profiles.'));
      if (!adminsResponse.ok) throw new Error(await responseError(adminsResponse, 'Could not load BetaDesk admins.'));
      setProjects(await projectsResponse.json() as BetaProject[]);
      setTesters(await testersResponse.json() as BetaTester[]);
      const adminData = await adminsResponse.json() as { admins: BetaAdmin[]; canManageAdmins: boolean };
      setAdmins(adminData.admins);
      setCanManageAdmins(adminData.canManageAdmins);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = initAuth((currentUser) => {
      setUser(currentUser);
      setAccess('checking');
      void (async () => {
        try {
          const response = await studioFetch('/api/betadesk/admin/access');
          const data = await response.json();
          setAccess(response.ok && data.allowed ? 'allowed' : 'denied');
          setCanManageAdmins(Boolean(data.canManageAdmins));
        } catch {
          setAccess('denied');
        }
      })();
    }, () => {
      setUser(null);
      setAccess('checking');
      setTickets([]);
      setSelectedTicket(null);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    if (access === 'allowed') void loadTickets();
  }, [access, loadTickets]);

  React.useEffect(() => {
    if (!selectedNumber || access !== 'allowed') {
      setSelectedTicket(null);
      setComments([]);
      return;
    }
    let active = true;
    void (async () => {
      setError('');
      try {
        const response = await studioFetch(
          `/api/betadesk/admin/tickets/${encodeURIComponent(selectedNumber)}`
        );
        if (!response.ok) throw new Error(await responseError(response, 'Could not load ticket details.'));
        const data = await response.json() as { ticket: BetaTicket; comments: BetaComment[] };
        if (!active) return;
        setSelectedTicket(data.ticket);
        setComments(data.comments);
        setAssignedTo(data.ticket.assignedTo || '');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load ticket details.');
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedNumber, access]);

  const filteredTickets = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch = !query
        || ticket.ticketNumber.toLowerCase().includes(query)
        || ticket.subject.toLowerCase().includes(query)
        || ticket.submitterName.toLowerCase().includes(query);
      return matchesSearch
        && (projectFilter === 'All projects' || ticket.projectId === projectFilter)
        && (statusFilter === 'All statuses' || ticket.status === statusFilter)
        && (categoryFilter === 'All categories' || ticket.category === categoryFilter)
        && (priorityFilter === 'All priorities' || ticket.priority === priorityFilter)
        && (platformFilter === 'All platforms' || ticket.platform === platformFilter);
    });
  }, [tickets, search, projectFilter, statusFilter, categoryFilter, priorityFilter, platformFilter]);

  React.useEffect(() => setPage(0), [search, projectFilter, statusFilter, categoryFilter, priorityFilter, platformFilter]);

  const updateTicket = async (changes: Partial<Pick<BetaTicket, 'status' | 'priority' | 'assignedTo' | 'projectId'>>) => {
    if (!selectedTicket) return;
    setSaving(true);
    setError('');
    try {
      const response = await studioFetch(
        `/api/betadesk/admin/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        }
      );
      if (!response.ok) throw new Error(await responseError(response, 'Could not update ticket.'));
      const updated = await response.json() as BetaTicket;
      setSelectedTicket(updated);
      setTickets((current) => current.map((ticket) => ticket.ticketNumber === updated.ticketNumber ? updated : ticket));
      setAssignedTo(updated.assignedTo || '');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update ticket.');
    } finally {
      setSaving(false);
    }
  };

  const addReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    setSaving(true);
    setError('');
    try {
      const response = await studioFetch(
        `/api/betadesk/admin/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply, visibility }),
        }
      );
      if (!response.ok) throw new Error(await responseError(response, 'Could not add comment.'));
      setReply('');
      const detailsResponse = await studioFetch(
        `/api/betadesk/admin/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}`
      );
      if (!detailsResponse.ok) throw new Error(await responseError(detailsResponse, 'Comment saved but could not reload ticket.'));
      const data = await detailsResponse.json() as { ticket: BetaTicket; comments: BetaComment[] };
      setSelectedTicket(data.ticket);
      setComments(data.comments);
      setTickets((current) => current.map((ticket) => ticket.ticketNumber === data.ticket.ticketNumber ? data.ticket : ticket));
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Could not add comment.');
    } finally {
      setSaving(false);
    }
  };

  const revokeLinks = async () => {
    if (!selectedTicket || !window.confirm(`Revoke this tester's personal link? This also blocks access to all of their tickets.`)) return;
    setSaving(true);
    setError('');
    try {
      const response = await studioFetch(
        `/api/betadesk/admin/testers/${encodeURIComponent(selectedTicket.testerId)}/revoke`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error(await responseError(response, 'Could not revoke access links.'));
      setTesters((current) => current.map((tester) => tester.id === selectedTicket.testerId ? { ...tester, active: false } : tester));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Could not revoke access links.');
    } finally {
      setSaving(false);
    }
  };

  const createTesterLink = async () => {
    setCreatingTester(true);
    setTesterError('');
    try {
      const response = await studioFetch('/api/betadesk/admin/testers', { method: 'POST' });
      if (!response.ok) throw new Error(await responseError(response, 'Could not create tester link.'));
      const data = await response.json() as { tester: BetaTester; shareUrl: string };
      setNewTesterUrl(data.shareUrl);
      setTesters((current) => [{ ...data.tester, ticketCount: 0 }, ...current]);
    } catch (createError) {
      setTesterError(createError instanceof Error ? createError.message : 'Could not create tester link.');
    } finally {
      setCreatingTester(false);
    }
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingProject(true);
    setError('');
    try {
      const response = await studioFetch('/api/betadesk/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDescription }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not create project.'));
      const project = await response.json() as BetaProject;
      setProjects((current) => [...current, project]);
      setProjectFilter(project.id);
      setNewProjectName('');
      setNewProjectDescription('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create project.');
    } finally {
      setCreatingProject(false);
    }
  };

  const inviteBetaDeskAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setManagingAdmin(true);
    setAdminError('');
    try {
      const response = await studioFetch('/api/betadesk/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not invite administrator.'));
      const admin = await response.json() as BetaAdmin;
      setAdmins((current) => [admin, ...current.filter((item) => item.email !== admin.email)]);
      setInviteEmail('');
    } catch (inviteError) {
      setAdminError(inviteError instanceof Error ? inviteError.message : 'Could not invite administrator.');
    } finally {
      setManagingAdmin(false);
    }
  };

  const removeBetaDeskAdmin = async (email: string) => {
    if (!window.confirm(`Remove BetaDesk access for ${email}? This does not change their Studio/Merakifos access.`)) return;
    setAdminError('');
    try {
      const response = await studioFetch(`/api/betadesk/admin/admins/${encodeURIComponent(email)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseError(response, 'Could not remove BetaDesk admin.'));
      setAdmins((current) => current.filter((admin) => admin.email !== email));
    } catch (removeError) {
      setAdminError(removeError instanceof Error ? removeError.message : 'Could not remove BetaDesk admin.');
    }
  };

  const openAttachment = async (ticket: BetaTicket, attachment: BetaAttachment) => {
    setError('');
    try {
      const response = await studioFetch(
        `/api/betadesk/admin/tickets/${encodeURIComponent(ticket.ticketNumber)}/attachments/${encodeURIComponent(attachment.uploadId)}`
      );
      if (!response.ok) throw new Error(await responseError(response, 'Could not access attachment.'));
      const result = await response.json() as { url: string };
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'Could not access attachment.');
    }
  };

  const handleButtonSound = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-sound-control]')) return;
    const button = target.closest('button');
    if (button && !button.disabled) soundTrack.playSoftDrop(0.9);
  };

  const copyTesterLink = async () => {
    if (!newTesterUrl) return;
    try {
      await navigator.clipboard.writeText(newTesterUrl);
      setTesterError('Tester link copied. Share it privately with the client.');
    } catch {
      setTesterError('Copy was blocked by the browser. Select and copy the link manually.');
    }
  };

  const moveTicket = async (ticketNumber: string, status: TicketStatus) => {
    const response = await studioFetch(`/api/betadesk/admin/tickets/${encodeURIComponent(ticketNumber)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError(await responseError(response, 'Could not move ticket.'));
      return;
    }
    const updated = await response.json() as BetaTicket;
    setTickets((current) => current.map((ticket) => ticket.ticketNumber === updated.ticketNumber ? updated : ticket));
    if (selectedTicket?.ticketNumber === updated.ticketNumber) setSelectedTicket(updated);
  };

  const projectTickets = React.useMemo(
    () => projectFilter === 'All projects'
      ? tickets
      : tickets.filter((ticket) => ticket.projectId === projectFilter),
    [tickets, projectFilter]
  );
  const avgResolutionHours = React.useMemo(() => {
    const resolved = projectTickets.filter((ticket) => ticket.resolvedAt);
    if (!resolved.length) return '—';
    const average = resolved.reduce(
      (total, ticket) => total + (Date.parse(ticket.resolvedAt!) - Date.parse(ticket.createdAt)) / 3600000,
      0
    ) / resolved.length;
    return `${average.toFixed(1)}h`;
  }, [projectTickets]);

  if (!user || access === 'checking') {
    return (
      <BetaDeskShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
        <div className="mx-auto mt-20 max-w-md rounded-2xl border border-[#E5EADF] bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-4 h-9 w-9 text-[#7C8B5F]" />
          <h1 className="text-2xl">BetaDesk Admin</h1>
          <p className="my-4 text-sm text-[#76806B]">Sign in with an authorized BetaDesk administrator account.</p>
          <div className="flex justify-center"><GoogleSignInButton user={user} onAuthChange={setUser} /></div>
        </div>
      </BetaDeskShell>
    );
  }

  if (access === 'denied') {
    return (
      <BetaDeskShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
        <div className="mx-auto mt-20 max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center">
          <LockKeyhole className="mx-auto mb-4 h-9 w-9 text-rose-600" />
          <h1 className="text-2xl">Admin access required</h1>
          <p className="my-4 text-sm text-[#76806B]">This Google account is not authorized to manage BetaDesk tickets.</p>
          <GoogleSignInButton user={user} onAuthChange={setUser} />
        </div>
      </BetaDeskShell>
    );
  }

  const openCount = projectTickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status)).length;
  const criticalCount = projectTickets.filter((ticket) => ticket.priority === 'Critical' && ticket.status !== 'Closed').length;
  const categoryCounts = categories.map((category) => ({
    category,
    count: projectTickets.filter((ticket) => ticket.category === category).length,
  }));
  const visibleTickets = filteredTickets.slice(page * pageSize, (page + 1) * pageSize);
  const metricCards: Array<{
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { label: 'Total tickets', value: projectTickets.length, icon: Ticket },
    { label: 'Needs attention', value: openCount, icon: CircleDot },
    { label: 'Critical issues', value: criticalCount, icon: AlertCircle },
    { label: 'Resolved', value: projectTickets.filter((ticket) => ticket.status === 'Resolved').length, icon: Check },
    { label: 'Avg. resolution', value: avgResolutionHours, icon: BarChart3 },
  ];

  return (
    <BetaDeskShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <a href="/studio" className="mb-3 inline-flex items-center gap-1 text-xs text-[#7C8B5F] hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Studio
            </a>
            <h1 className="text-3xl">BetaDesk</h1>
            <p className="mt-1 text-sm text-[#76806B]">Beta feedback and ticket management</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={selectClass} onClick={() => void loadTickets()}>
              <RefreshCw className="inline h-4 w-4" /> Refresh
            </button>
            <GoogleSignInButton user={user} onAuthChange={setUser} />
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <div className="mb-6 grid items-start gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#E5EADF] bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg"><FolderPlus className="h-4 w-4 text-[#7C8B5F]" /> Beta projects</h2>
            <p className="mt-1 text-xs text-[#76806B]">Keep feedback for each app separate. Older tickets are grouped under the legacy project.</p>
            <form onSubmit={createProject} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input required minLength={2} maxLength={100} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="New app / project name" className={inputClass} />
              <input maxLength={500} value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="Optional description" className={inputClass} />
              <button type="submit" className={primaryButton} disabled={creatingProject}>{creatingProject ? 'Creating…' : 'Create'}</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {projects.map((project) => <span key={project.id} className="rounded-full bg-[#F2F3ED] px-3 py-1 text-xs">{project.name}{project.id === 'legacy' ? ' · existing tickets' : ''}</span>)}
            </div>
          </section>

          <section className="rounded-xl border border-[#E5EADF] bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg"><UserPlus className="h-4 w-4 text-[#7C8B5F]" /> BetaDesk admins</h2>
            <p className="mt-1 text-xs text-[#76806B]">This access is separate from Studio/Merakifos admin access.</p>
            {canManageAdmins && (
              <form onSubmit={inviteBetaDeskAdmin} className="mt-3 flex gap-2">
                <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Google account email" className={inputClass} />
                <button type="submit" className={primaryButton} disabled={managingAdmin}>{managingAdmin ? 'Adding…' : 'Add admin'}</button>
              </form>
            )}
            {adminError && <p role="alert" className="mt-2 text-xs text-rose-700">{adminError}</p>}
            <div className="mt-3 divide-y divide-[#F0F1EB]">
              {admins.map((admin) => (
                <div key={admin.email} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{admin.email}</span>
                  {canManageAdmins && <button type="button" title={`Remove ${admin.email} from BetaDesk admins`} className="rounded p-1.5 text-rose-700 hover:bg-rose-50" onClick={() => void removeBetaDeskAdmin(admin.email)}><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              {admins.length === 0 && <p className="py-2 text-xs text-[#8A9380]">Only the Studio owner currently has BetaDesk access.</p>}
            </div>
          </section>
        </div>

        <section className="mb-6 rounded-xl border border-[#E5EADF] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg">Tester profiles</h2>
              <p className="mt-1 text-xs text-[#76806B]">Create one private feedback link per client. Their name is saved once; no email or account is required.</p>
            </div>
            <button type="button" className={primaryButton} disabled={creatingTester} onClick={() => void createTesterLink()}>
              <Ticket className="h-4 w-4" /> {creatingTester ? 'Creating…' : 'Create tester link'}
            </button>
          </div>
          {newTesterUrl && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <label className="mb-2 block text-xs font-medium text-emerald-900">New private tester link — copy and send it to the client</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={newTesterUrl} className={`${inputClass} bg-white`} />
                <button type="button" className={selectClass} onClick={() => void copyTesterLink()}>Copy link</button>
              </div>
              <p className="mt-2 text-xs text-emerald-800">This URL contains the only usable copy of the secret. Save and share it securely; it cannot be recovered from the admin view.</p>
            </div>
          )}
          {testerError && <p role="status" className="mt-2 text-xs text-[#69745E]">{testerError}</p>}
          <div className="mt-4 divide-y divide-[#F0F1EB]">
            {testers.length === 0 ? <p className="py-3 text-xs text-[#8A9380]">No tester links created yet.</p> : testers.map((tester) => (
              <div key={tester.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-medium">{tester.displayName || 'Name not set yet'}</span>
                  <span className="ml-2 text-xs text-[#8A9380]">{tester.ticketCount} ticket{tester.ticketCount === 1 ? '' : 's'} · added {formatDate(tester.createdAt)}</span>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] ${tester.active ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
                  {tester.active ? 'Link active' : 'Link revoked'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {metricCards.map(({ label, value, icon: CardIcon }) => (
            <article key={label} className="rounded-xl border border-[#E5EADF] bg-white p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-[#76806B]">
                {label}<CardIcon className="h-4 w-4 text-[#7C8B5F]" />
              </div>
              <div className="text-2xl font-medium text-[#3F4A32]">{value}</div>
            </article>
          ))}
        </section>

        <section className="mb-6 rounded-xl border border-[#E5EADF] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4 text-[#7C8B5F]" /> Ticket categories</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryCounts.map(({ category, count }) => {
              const max = Math.max(1, ...categoryCounts.map((entry) => entry.count));
              return (
                <div key={category} className="text-xs">
                  <div className="mb-1 flex justify-between text-[#69745E]"><span>{category}</span><span>{count}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#F0F1EB]">
                    <div className="h-full rounded-full bg-[#7C8B5F]" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(370px,0.8fr)]">
          <section className="min-w-0 rounded-xl border border-[#E5EADF] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5EADF] p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg">Tickets</h2>
                <span className="rounded-full bg-[#F2F3ED] px-2 py-0.5 text-xs text-[#69745E]">{filteredTickets.length}</span>
              </div>
              <div className="flex gap-1 rounded-lg bg-[#F4F5F1] p-1">
                <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={`rounded-md p-1.5 ${view === 'list' ? 'bg-white shadow-sm' : 'text-[#76806B]'}`} title="List view"><LayoutList className="h-4 w-4" /></button>
                <button onClick={() => setView('board')} aria-pressed={view === 'board'} className={`rounded-md p-1.5 ${view === 'board' ? 'bg-white shadow-sm' : 'text-[#76806B]'}`} title="Kanban board"><CircleDot className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid gap-2 border-b border-[#E5EADF] p-3 sm:grid-cols-2 xl:grid-cols-3">
              <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className={selectClass}>
                <option>All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <label className="relative sm:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#9AA18E]" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, subject, reporter" className={`${inputClass} pl-9`} />
              </label>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClass}>
                <option>All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={selectClass}>
                <option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className={selectClass}>
                <option>All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
              <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className={selectClass}>
                <option>All platforms</option>{[...new Set(tickets.map((ticket) => ticket.platform).filter(Boolean))].map((platform) => <option key={platform}>{platform}</option>)}
              </select>
              <div className="flex items-center gap-1 text-xs text-[#8A9380]"><Filter className="h-3.5 w-3.5" /> Filters apply to real ticket records</div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-[#76806B]">Loading tickets…</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-10 text-center">
                <Ticket className="mx-auto mb-3 h-8 w-8 text-[#A7AE9B]" />
                <p className="text-sm font-medium">No tickets found</p>
                <p className="mt-1 text-xs text-[#8A9380]">New beta submissions will appear here.</p>
              </div>
            ) : view === 'list' ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-[#FAFBF8] text-xs text-[#76806B]">
                      <tr><th className="px-4 py-3 font-medium">Ticket</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Priority</th><th className="px-4 py-3 font-medium">Updated</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F1EB]">
                      {visibleTickets.map((ticket) => (
                        <tr key={ticket.ticketNumber} onClick={() => setSelectedNumber(ticket.ticketNumber)} className={`cursor-pointer hover:bg-[#FAFBF8] ${ticket.ticketNumber === selectedNumber ? 'bg-[#F7F8F3]' : ''}`}>
                          <td className="max-w-[280px] px-4 py-3">
                            <div className="font-medium text-[#3F4A32]">{ticket.subject}</div>
                            <div className="mt-1 truncate text-xs text-[#8A9380]">{ticket.ticketNumber} · reported by {ticket.submitterName}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#69745E]">{ticket.category}</td>
                          <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] ${badgeClass('status', ticket.status)}`}>{ticket.status}</span></td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] ${badgeClass('priority', ticket.priority)}`}>{ticket.priority}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-[#8A9380]">{formatDate(ticket.lastActivityAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-[#E5EADF] px-4 py-3 text-xs text-[#76806B]">
                  <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredTickets.length)} of {filteredTickets.length}</span>
                  <div className="flex gap-2">
                    <button className={selectClass} disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
                    <button className={selectClass} disabled={(page + 1) * pageSize >= filteredTickets.length} onClick={() => setPage((value) => value + 1)}>Next</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid gap-3 overflow-x-auto p-3 md:grid-cols-2 2xl:grid-cols-3">
                {statuses.map((status) => (
                  <div key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                    event.preventDefault();
                    const number = event.dataTransfer.getData('text/betadesk-ticket');
                    if (number) void moveTicket(number, status);
                  }} className="min-h-32 rounded-lg bg-[#F7F8F4] p-2.5">
                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#69745E]">
                      {status}<span className="rounded-full bg-white px-2 py-0.5">{filteredTickets.filter((ticket) => ticket.status === status).length}</span>
                    </div>
                    <div className="space-y-2">
                      {filteredTickets.filter((ticket) => ticket.status === status).map((ticket) => (
                        <button key={ticket.ticketNumber} draggable onDragStart={(event) => event.dataTransfer.setData('text/betadesk-ticket', ticket.ticketNumber)} onClick={() => setSelectedNumber(ticket.ticketNumber)} className="block w-full cursor-grab rounded-lg border border-[#E5EADF] bg-white p-3 text-left shadow-sm">
                          <span className="text-[10px] text-[#8A9380]">{ticket.ticketNumber}</span>
                          <span className="mt-1 block text-sm font-medium">{ticket.subject}</span>
                          <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] ${badgeClass('priority', ticket.priority)}`}>{ticket.priority}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#E5EADF] bg-white">
            {!selectedTicket ? (
              <div className="p-10 text-center text-sm text-[#8A9380]">Select a ticket to view its details and conversation.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[#E5EADF] p-4">
                  <div className="min-w-0">
                    <span className="text-xs text-[#7C8B5F]">{selectedTicket.ticketNumber}</span>
                    <h2 className="mt-1 break-words text-xl">{selectedTicket.subject}</h2>
                  </div>
                  <button disabled={saving || !testers.find((tester) => tester.id === selectedTicket.testerId)?.active} onClick={() => void revokeLinks()} className="shrink-0 rounded-lg border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50">Revoke tester link</button>
                </div>
                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap gap-2">
                    <select className={selectClass} value={selectedTicket.status} disabled={saving} onChange={(event) => void updateTicket({ status: event.target.value as TicketStatus })}>
                      {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                    <select className={selectClass} value={selectedTicket.priority} disabled={saving} onChange={(event) => void updateTicket({ priority: event.target.value as TicketPriority })}>
                      {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                    <select className={selectClass} value={selectedTicket.projectId} disabled={saving} aria-label="Ticket project" onChange={(event) => void updateTicket({ projectId: event.target.value })}>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="col-span-2"><div className="text-[#8A9380]">Project</div><div className="mt-1">{projects.find((project) => project.id === selectedTicket.projectId)?.name || 'Legacy / Unassigned Tickets'}</div></div>
                    <div><div className="text-[#8A9380]">Category</div><div className="mt-1">{selectedTicket.category}</div></div>
                    <div><div className="text-[#8A9380]">Platform</div><div className="mt-1">{selectedTicket.platform || '—'}</div></div>
                    <div><div className="text-[#8A9380]">Reporter profile</div><div className="mt-1">{selectedTicket.submitterName}</div></div>
                    <div><div className="text-[#8A9380]">Submitted</div><div className="mt-1">{formatDate(selectedTicket.createdAt)}</div></div>
                    <div><div className="text-[#8A9380]">App version</div><div className="mt-1">{selectedTicket.appVersion || '—'}</div></div>
                    <div><div className="text-[#8A9380]">Device / OS</div><div className="mt-1">{[selectedTicket.deviceModel, selectedTicket.operatingSystem].filter(Boolean).join(' · ') || '—'}</div></div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[#8A9380]" htmlFor="betadesk-assignee">Assigned administrator</label>
                    <div className="flex gap-2">
                      <input id="betadesk-assignee" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Email or leave unassigned" className={inputClass} />
                      <button className={selectClass} disabled={saving || assignedTo === selectedTicket.assignedTo} onClick={() => void updateTicket({ assignedTo })}>Save</button>
                    </div>
                  </div>
                  <article className="rounded-lg bg-[#FAFBF8] p-3">
                    <div className="mb-1 text-xs font-medium text-[#69745E]">Original feedback</div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{selectedTicket.description}</p>
                  </article>
                  {selectedTicket.attachments?.length > 0 && (
                    <section>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4 text-[#7C8B5F]" /> Attachments</h3>
                      <ul className="space-y-1">
                        {selectedTicket.attachments.map((attachment) => (
                          <li key={attachment.uploadId}>
                            <button type="button" className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E5EADF] bg-white px-3 py-2 text-left text-xs hover:border-[#7C8B5F]" onClick={() => void openAttachment(selectedTicket, attachment)}>
                              <span className="truncate">{attachment.fileName}</span>
                              <span className="shrink-0 text-[#8A9380]">{(attachment.size / (1024 * 1024)).toFixed(1)} MB</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium"><MessageSquare className="h-4 w-4 text-[#7C8B5F]" /> Conversation & notes</div>
                    <div className="max-h-80 space-y-2 overflow-auto rounded-lg bg-[#FAFBF8] p-3">
                      {comments.length === 0 ? <p className="text-xs text-[#8A9380]">No replies yet.</p> : comments.map((comment) => (
                        <article key={comment.id} className="rounded-lg border border-[#E5EADF] bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="font-medium">{comment.authorName} · {comment.visibility === 'internal' ? 'Internal note' : 'Public reply'}</span>
                            <time className="text-[#8A9380]">{formatDate(comment.createdAt)}</time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-5">{comment.message}</p>
                        </article>
                      ))}
                    </div>
                    <form onSubmit={addReply} className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="betadesk-reply" className="text-xs text-[#8A9380]">Add a response or private note</label>
                        <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'internal')} className="rounded-md border border-[#E5EADF] bg-white px-2 py-1 text-xs">
                          <option value="public">Visible to tester</option><option value="internal">Internal note</option>
                        </select>
                      </div>
                      <textarea id="betadesk-reply" rows={3} maxLength={3000} required value={reply} onChange={(event) => setReply(event.target.value)} className={inputClass} placeholder="Write a response…" />
                      <button disabled={saving || !reply.trim()} className={primaryButton}><Send className="h-4 w-4" /> Send reply</button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </BetaDeskShell>
  );
};

interface BetaDeskShellProps {
  children: React.ReactNode;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  onClickCapture?: React.MouseEventHandler<HTMLDivElement>;
}

const BetaDeskShell: React.FC<BetaDeskShellProps> = ({ children, theme = 'light', onToggleTheme = () => {}, onClickCapture }) => (
  <div className="betadesk-theme min-h-screen bg-[#FAF6F1] text-[#3F4A32]" data-theme={theme} onClickCapture={onClickCapture}>
    <div className="border-b border-[#E5EADF] bg-white/80 px-4 py-3 sm:px-7">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-2 text-xs font-medium tracking-wide text-[#69745E]">
        <div className="flex items-center gap-2"><Ticket className="h-4 w-4 text-[#7C8B5F]" /> MERAKIFOS <span className="text-[#D9A441]">/</span> BETADESK</div>
        <BetaDeskThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </div>
    {children}
  </div>
);

export const BetaDeskPublic: React.FC = () => <TesterLinkRequired />;

const FeedbackForm: React.FC = () => {
  const [form, setForm] = React.useState({
    submitterName: '',
    submitterEmail: '',
    subject: '',
    description: '',
    category: 'Bug Report' as TicketCategory,
    platform: '',
    appVersion: '',
    deviceModel: '',
    operatingSystem: '',
  });
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [accessUrl, setAccessUrl] = React.useState('');
  const [ticketNumber, setTicketNumber] = React.useState('');
  const [testerEmailStatus, setTesterEmailStatus] = React.useState<'sent' | 'recorded' | 'failed'>('recorded');
  const [error, setError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [showAccessRequest, setShowAccessRequest] = React.useState(false);
  const [accessRequest, setAccessRequest] = React.useState({ ticketNumber: '', email: '' });
  const [accessNotice, setAccessNotice] = React.useState('');
  const [accessRequesting, setAccessRequesting] = React.useState(false);

  const change = (field: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/betadesk/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not submit feedback.'));
      const result = await response.json() as {
        ticketNumber: string;
        accessUrl: string;
        testerEmailStatus: 'sent' | 'recorded' | 'failed';
      };
      setTicketNumber(result.ticketNumber);
      setAccessUrl(result.accessUrl);
      setTesterEmailStatus(result.testerEmailStatus);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestAccessLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setAccessRequesting(true);
    setAccessNotice('');
    try {
      const response = await fetch('/api/betadesk/tickets/access-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accessRequest),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not process this request.'));
      setAccessNotice('If the ticket and email match, a fresh private link will arrive shortly.');
    } catch (requestError) {
      setAccessNotice(requestError instanceof Error ? requestError.message : 'Could not process this request.');
    } finally {
      setAccessRequesting(false);
    }
  };

  return (
    <BetaDeskShell>
      <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        {!ticketNumber ? (
          <section className="rounded-2xl border border-[#E5EADF] bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#F2F3ED] px-3 py-1 text-xs text-[#69745E]"><MessageSquare className="h-3.5 w-3.5" /> Beta tester feedback</div>
            <h1 className="text-3xl">Help us improve</h1>
            <p className="mb-6 mt-2 text-sm leading-6 text-[#76806B]">Report a bug, share an idea, or tell us how your beta experience is going. No account is needed.</p>
            {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium">Your name<input required maxLength={100} value={form.submitterName} onChange={change('submitterName')} className={`${inputClass} mt-1.5`} /></label>
                <label className="text-xs font-medium">Email address<input required type="email" maxLength={254} value={form.submitterEmail} onChange={change('submitterEmail')} className={`${inputClass} mt-1.5`} /></label>
              </div>
              <label className="block text-xs font-medium">Category<select value={form.category} onChange={change('category')} className={`${inputClass} mt-1.5`}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="block text-xs font-medium">Subject<input required minLength={3} maxLength={150} value={form.subject} onChange={change('subject')} className={`${inputClass} mt-1.5`} placeholder="A short summary" /></label>
              <label className="block text-xs font-medium">What happened or what would you like to see?<textarea required minLength={10} maxLength={5000} rows={6} value={form.description} onChange={change('description')} className={`${inputClass} mt-1.5`} placeholder="Include steps to reproduce if you're reporting a bug." /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium">Platform<input maxLength={80} value={form.platform} onChange={change('platform')} className={`${inputClass} mt-1.5`} placeholder="Web, iOS, Android…" /></label>
                <label className="text-xs font-medium">App version<input maxLength={80} value={form.appVersion} onChange={change('appVersion')} className={`${inputClass} mt-1.5`} /></label>
                <label className="text-xs font-medium">Device<input maxLength={120} value={form.deviceModel} onChange={change('deviceModel')} className={`${inputClass} mt-1.5`} placeholder="Optional" /></label>
                <label className="text-xs font-medium">Operating system<input maxLength={120} value={form.operatingSystem} onChange={change('operatingSystem')} className={`${inputClass} mt-1.5`} placeholder="Optional" /></label>
              </div>
              <p className="text-xs text-[#8A9380]">Please do not include passwords, payment details, or other sensitive information.</p>
              <button disabled={submitting} className={`${primaryButton} w-full sm:w-auto`}><Send className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Submit feedback'}</button>
            </form>
            <div className="mt-7 border-t border-[#E5EADF] pt-5">
              <button type="button" onClick={() => setShowAccessRequest((value) => !value)} className="text-xs text-[#7C8B5F] hover:underline">
                Already submitted? Request a private ticket link
              </button>
              {showAccessRequest && (
                <form onSubmit={requestAccessLink} className="mt-3 space-y-3 rounded-lg bg-[#FAFBF8] p-4">
                  <p className="text-xs text-[#76806B]">Enter your ticket reference and the email used to submit it. For privacy, we will not reveal whether the details match.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium">Ticket reference<input required value={accessRequest.ticketNumber} onChange={(event) => setAccessRequest((current) => ({ ...current, ticketNumber: event.target.value }))} placeholder="BETA-1001" className={`${inputClass} mt-1.5`} /></label>
                    <label className="text-xs font-medium">Email address<input required type="email" value={accessRequest.email} onChange={(event) => setAccessRequest((current) => ({ ...current, email: event.target.value }))} className={`${inputClass} mt-1.5`} /></label>
                  </div>
                  <button disabled={accessRequesting} className={primaryButton}>{accessRequesting ? 'Requesting…' : 'Email me a link'}</button>
                  {accessNotice && <p role="status" className="text-xs text-[#69745E]">{accessNotice}</p>}
                </form>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-[#E5EADF] bg-white p-7 text-center shadow-sm sm:p-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-6 w-6" /></div>
            <h1 className="text-3xl">Thanks for the feedback</h1>
            <p className="mt-2 text-sm text-[#76806B]">Your ticket has been created.</p>
            <div className="my-6 rounded-xl bg-[#F7F8F4] p-4">
              <div className="text-xs text-[#8A9380]">Ticket reference</div>
              <div className="mt-1 text-2xl font-medium">{ticketNumber}</div>
            </div>
            <a href={accessUrl} className={primaryButton}>Continue the conversation <ChevronDown className="h-4 w-4 -rotate-90" /></a>
            <p className="mt-4 text-xs leading-5 text-[#8A9380]">
              {testerEmailStatus === 'sent'
                ? 'A private access link was also sent to your email. Save it somewhere secure; it expires in 90 days.'
                : 'Email delivery is not currently available. Save your private access link now; it expires in 90 days.'}
            </p>
            <button className="mt-5 text-xs text-[#7C8B5F] hover:underline" onClick={() => {
              setTicketNumber('');
              setAccessUrl('');
              setIdempotencyKey(crypto.randomUUID());
              setForm({
                submitterName: '',
                submitterEmail: '',
                subject: '',
                description: '',
                category: 'Bug Report',
                platform: '',
                appVersion: '',
                deviceModel: '',
                operatingSystem: '',
              });
            }}>Submit another item</button>
          </section>
        )}
      </main>
    </BetaDeskShell>
  );
};

const PublicTicket: React.FC<{ ticketToken: string }> = ({ ticketToken }) => {
  const [ticket, setTicket] = React.useState<BetaTicket | null>(null);
  const [comments, setComments] = React.useState<BetaComment[]>([]);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);

  const loadTicket = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/betadesk/tickets/access/${encodeURIComponent(ticketToken)}`);
      if (!response.ok) throw new Error(await responseError(response, 'This ticket link is invalid or expired.'));
      const data = await response.json() as { ticket: BetaTicket; comments: BetaComment[] };
      setTicket(data.ticket);
      setComments(data.comments);
    } catch (loadError) {
      setTicket(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketToken]);

  React.useEffect(() => { void loadTicket(); }, [loadTicket]);

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/betadesk/tickets/access/${encodeURIComponent(ticketToken)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Could not send reply.'));
      setMessage('');
      await loadTicket();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <BetaDeskShell>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <a href="/feedback/submit" className="mb-4 inline-flex items-center gap-1 text-xs text-[#7C8B5F] hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Submit other feedback</a>
        {loading ? <div className="rounded-xl bg-white p-8 text-center text-sm text-[#76806B]">Loading your ticket…</div> : !ticket ? (
          <section className="rounded-xl border border-rose-200 bg-white p-7 text-center">
            <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-rose-600" />
            <h1 className="text-2xl">Ticket link unavailable</h1>
            <p className="mt-2 text-sm text-[#76806B]">{error}</p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-[#E5EADF] bg-white shadow-sm">
            <header className="border-b border-[#E5EADF] p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#7C8B5F]"><span>{ticket.ticketNumber}</span><span>·</span><span>{ticket.category}</span><span className={`rounded-full px-2 py-1 ${badgeClass('status', ticket.status)}`}>{ticket.status}</span></div>
              <h1 className="mt-3 text-2xl sm:text-3xl">{ticket.subject}</h1>
              <p className="mt-2 text-xs text-[#8A9380]">Last updated {formatDate(ticket.lastActivityAt)}</p>
            </header>
            <div className="space-y-4 p-5 sm:p-7">
              <article className="rounded-lg bg-[#FAFBF8] p-4">
                <div className="mb-1 text-xs font-medium text-[#69745E]">Your feedback</div>
                <p className="whitespace-pre-wrap text-sm leading-6">{ticket.description}</p>
              </article>
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-[#7C8B5F]" /> Conversation</h2>
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <article key={comment.id} className={`rounded-lg border p-4 ${comment.authorType === 'admin' ? 'border-[#E5EADF] bg-white' : 'border-transparent bg-[#FAFBF8]'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium">{comment.authorType === 'admin' ? 'Beta support' : 'You'}</span><time className="text-[#8A9380]">{formatDate(comment.createdAt)}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{comment.message}</p>
                    </article>
                  ))}
                  {comments.length === 0 && <p className="text-sm text-[#8A9380]">There are no replies yet.</p>}
                </div>
              </div>
              {ticket.status === 'Closed' ? (
                <div className="rounded-lg bg-[#F7F8F4] p-3 text-sm text-[#69745E]">This ticket is closed. Contact support if you need more help.</div>
              ) : (
                <form onSubmit={sendReply} className="space-y-2">
                  <label htmlFor="public-ticket-reply" className="block text-xs font-medium">Add a reply</label>
                  <textarea id="public-ticket-reply" rows={4} maxLength={3000} required value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} placeholder="Write your message…" />
                  {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
                  <button disabled={sending || !message.trim()} className={primaryButton}><Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send reply'}</button>
                </form>
              )}
            </div>
          </section>
        )}
        {!loading && ticket && <button className="mt-4 inline-flex items-center gap-2 text-xs text-[#7C8B5F] hover:underline" onClick={() => void loadTicket()}><RefreshCw className="h-3.5 w-3.5" /> Refresh conversation</button>}
      </main>
    </BetaDeskShell>
  );
};
