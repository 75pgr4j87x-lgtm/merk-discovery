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
  projectId?: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  ticketCount: number;
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
  const [accessError, setAccessError] = React.useState('');
  const [tickets, setTickets] = React.useState<BetaTicket[]>([]);
  const [projects, setProjects] = React.useState<BetaProject[]>([]);
  const [testers, setTesters] = React.useState<BetaTester[]>([]);
  const [newTesterUrl, setNewTesterUrl] = React.useState('');
  const [creatingTester, setCreatingTester] = React.useState(false);
  const [testerError, setTesterError] = React.useState('');
  const [testerProfilesExpanded, setTesterProfilesExpanded] = React.useState(true);
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
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [newProjectName, setNewProjectName] = React.useState('');
  const [newProjectDescription, setNewProjectDescription] = React.useState('');
  const [creatingProject, setCreatingProject] = React.useState(false);
  const pageSize = 12;
  const projectDataRequest = React.useRef(0);

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('drive') === 'error') {
      setError('Google Drive could not be connected. Configure it from Studio access settings, then try again.');
    }
  }, []);

  const loadProjects = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await studioFetch('/api/betadesk/admin/projects');
      if (!response.ok) throw new Error(await responseError(response, 'Could not load projects.'));
      setProjects(await response.json() as BetaProject[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjectData = React.useCallback(async (projectId: string) => {
    const requestId = ++projectDataRequest.current;
    setLoading(true);
    setError('');
    const query = `?projectId=${encodeURIComponent(projectId)}`;
    try {
      const [ticketsResponse, testersResponse] = await Promise.all([
        studioFetch(`/api/betadesk/admin/tickets${query}`),
        studioFetch(`/api/betadesk/admin/testers${query}`),
      ]);
      if (!ticketsResponse.ok) throw new Error(await responseError(ticketsResponse, 'Could not load project tickets.'));
      if (!testersResponse.ok) throw new Error(await responseError(testersResponse, 'Could not load project tester profiles.'));
      const [ticketData, testerData] = await Promise.all([
        ticketsResponse.json() as Promise<BetaTicket[]>,
        testersResponse.json() as Promise<BetaTester[]>,
      ]);
      if (requestId !== projectDataRequest.current) return;
      setTickets(ticketData);
      setTesters(testerData);
      setSelectedNumber((current) => ticketData.some((ticket) => ticket.ticketNumber === current)
        ? current
        : ticketData[0]?.ticketNumber || '');
    } catch (loadError) {
      if (requestId !== projectDataRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Could not load project data.');
    } finally {
      if (requestId === projectDataRequest.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = initAuth((currentUser) => {
      setUser(currentUser);
      setAccess('checking');
      void (async () => {
        try {
          const response = await studioFetch('/api/betadesk/admin/access');
          const data = await response.json().catch(() => null) as { allowed?: boolean; error?: string } | null;
          if (!data) {
            throw new Error(
              `BetaDesk API returned a non-JSON response (HTTP ${response.status}). This deployment may be missing its BetaDesk API function.`
            );
          }
          if (!response.ok || !data.allowed) {
            setAccessError(data.error || 'This Google account does not have BetaDesk access.');
            setAccess('denied');
            return;
          }
          setAccessError('');
          setAccess('allowed');
        } catch (authError) {
          setAccessError(authError instanceof Error ? authError.message : 'Could not verify BetaDesk access.');
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
    if (access === 'allowed') void loadProjects();
  }, [access, loadProjects]);

  React.useEffect(() => {
    if (access === 'allowed' && selectedProjectId) void loadProjectData(selectedProjectId);
    if (!selectedProjectId) {
      setTickets([]);
      setTesters([]);
      setSelectedNumber('');
      setSelectedTicket(null);
    }
  }, [access, selectedProjectId, loadProjectData]);

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
          `/api/betadesk/admin/tickets/${encodeURIComponent(selectedNumber)}?projectId=${encodeURIComponent(selectedProjectId)}`
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
  }, [selectedNumber, selectedProjectId, access]);

  const filteredTickets = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch = !query
        || ticket.ticketNumber.toLowerCase().includes(query)
        || ticket.subject.toLowerCase().includes(query)
        || ticket.submitterName.toLowerCase().includes(query);
      return matchesSearch
        && (statusFilter === 'All statuses' || ticket.status === statusFilter)
        && (categoryFilter === 'All categories' || ticket.category === categoryFilter)
        && (priorityFilter === 'All priorities' || ticket.priority === priorityFilter)
        && (platformFilter === 'All platforms' || ticket.platform === platformFilter);
    });
  }, [tickets, search, statusFilter, categoryFilter, priorityFilter, platformFilter]);

  React.useEffect(() => setPage(0), [search, statusFilter, categoryFilter, priorityFilter, platformFilter]);

  const updateTicket = async (changes: Partial<Pick<BetaTicket, 'status' | 'priority' | 'assignedTo' | 'projectId'>>) => {
    if (!selectedTicket) return;
    setSaving(true);
    setError('');
    try {
      const response = await studioFetch(
        `/api/betadesk/admin/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}?projectId=${encodeURIComponent(selectedProjectId)}`,
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
        `/api/betadesk/admin/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}/comments?projectId=${encodeURIComponent(selectedProjectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply, visibility }),
        }
      );
      if (!response.ok) throw new Error(await responseError(response, 'Could not add comment.'));
      setReply('');
      const detailsResponse = await studioFetch(
        `/api/betadesk/admin/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}?projectId=${encodeURIComponent(selectedProjectId)}`
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
        `/api/betadesk/admin/testers/${encodeURIComponent(selectedTicket.testerId)}/revoke?projectId=${encodeURIComponent(selectedProjectId)}`,
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
      const response = await studioFetch('/api/betadesk/admin/testers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
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
      setSelectedProjectId(project.id);
      setNewProjectName('');
      setNewProjectDescription('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create project.');
    } finally {
      setCreatingProject(false);
    }
  };

  const selectProject = (projectId: string) => {
    projectDataRequest.current += 1;
    setLoading(false);
    setSelectedNumber('');
    setSelectedTicket(null);
    setSelectedProjectId(projectId);
    setNewTesterUrl('');
    setTesterError('');
  };

  const openAttachment = async (ticket: BetaTicket, attachment: BetaAttachment) => {
    setError('');
    const preview = window.open('about:blank', '_blank');
    if (!preview) {
      setError('Allow pop-ups to view this attachment.');
      return;
    }
    preview.opener = null;
    try {
      const chunks: Blob[] = [];
      const chunkSize = 4 * 1024 * 1024;
      for (let start = 0; start < attachment.size; start += chunkSize) {
        const end = Math.min(start + chunkSize, attachment.size) - 1;
        const response = await studioFetch(
          `/api/betadesk/admin/tickets/${encodeURIComponent(ticket.ticketNumber)}/attachments/${encodeURIComponent(attachment.uploadId)}?projectId=${encodeURIComponent(selectedProjectId)}`,
          { headers: { Range: `bytes=${start}-${end}` } }
        );
        if (!response.ok) throw new Error(await responseError(response, 'Could not access attachment.'));
        chunks.push(await response.blob());
      }
      const url = URL.createObjectURL(new Blob(chunks, { type: attachment.contentType }));
      preview.location.href = url;
      const cleanup = window.setInterval(() => {
        if (preview.closed) {
          window.clearInterval(cleanup);
          URL.revokeObjectURL(url);
        }
      }, 1000);
    } catch (attachmentError) {
      preview.close();
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
    const response = await studioFetch(`/api/betadesk/admin/tickets/${encodeURIComponent(ticketNumber)}?projectId=${encodeURIComponent(selectedProjectId)}`, {
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

  const projectTickets = tickets;
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
          <p className="my-4 text-sm text-[#76806B]">{accessError || 'This signed-in account does not currently have BetaDesk access. The Studio Super Admin can manage BetaDesk-only roles in Studio access settings.'}</p>
          <a href="/studio" className={`${primaryButton} mt-2`}>Return to Studio</a>
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

  const selectedProject = projects.find((project) => project.id === selectedProjectId && project.active);
  if (access === 'allowed' && (!selectedProjectId || !selectedProject)) {
    return (
      <BetaDeskShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
        <main className="mx-auto min-h-[calc(100vh-58px)] w-full max-w-5xl px-4 py-8 sm:px-7">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <a href="/studio" className="mb-3 inline-flex items-center gap-1 text-xs text-[#7C8B5F] hover:underline">
                <ArrowLeft className="h-3.5 w-3.5" /> Studio
              </a>
              <h1 className="text-3xl">BetaDesk projects</h1>
              <p className="mt-1 text-sm text-[#76806B]">Choose a project to manage its testers, feedback, and tickets.</p>
            </div>
            <GoogleSignInButton user={user} onAuthChange={setUser} />
          </header>
          {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {loading && projects.length === 0 && <p role="status" className="mb-4 text-sm text-[#76806B]">Loading projects…</p>}
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.filter((project) => project.active).map((project) => (
              <button key={project.id} type="button" onClick={() => selectProject(project.id)} className="min-w-0 rounded-xl border border-[#E5EADF] bg-white p-5 text-left shadow-sm transition hover:border-[#7C8B5F] hover:shadow-md">
                <span className="mb-3 inline-flex rounded-lg bg-[#F2F3ED] p-2 text-[#7C8B5F]"><FolderPlus className="h-5 w-5" /></span>
                <h2 className="break-words text-lg font-medium">{project.name}</h2>
                <p className="mt-1 line-clamp-2 min-h-8 text-xs text-[#76806B]">{project.description || (project.id === 'legacy' ? 'Existing BetaDesk tickets from before project organization.' : 'Beta feedback project')}</p>
                {project.id === 'legacy' && <span className="mt-3 inline-block rounded-full bg-[#F2F3ED] px-2.5 py-1 text-[10px] text-[#69745E]">Existing tickets</span>}
              </button>
            ))}
          </section>
          <section className="rounded-xl border border-[#E5EADF] bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg"><FolderPlus className="h-4 w-4 text-[#7C8B5F]" /> Create a project</h2>
            <p className="mt-1 text-xs text-[#76806B]">Each project has its own tester links, feedback, metrics, and ticket workflow.</p>
            <form onSubmit={createProject} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input required minLength={2} maxLength={100} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="App / project name" className={inputClass} />
              <input maxLength={500} value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder="Optional description" className={inputClass} />
              <button type="submit" className={`${primaryButton} shrink-0`} disabled={creatingProject}>{creatingProject ? 'Creating…' : 'Create project'}</button>
            </form>
          </section>
        </main>
      </BetaDeskShell>
    );
  }
  if (!selectedProject) return null;

  return (
    <BetaDeskShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <button type="button" onClick={() => selectProject('')} className="mb-3 inline-flex items-center gap-1 text-xs text-[#7C8B5F] hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> All projects
            </button>
            <h1 className="break-words text-3xl">{selectedProject.name}</h1>
            <p className="mt-1 text-sm text-[#76806B]">Project feedback, testers, and ticket management</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={selectClass} onClick={() => void loadProjectData(selectedProjectId)}>
              <RefreshCw className="inline h-4 w-4" /> Refresh
            </button>
            <GoogleSignInButton user={user} onAuthChange={setUser} />
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className="mb-6 rounded-xl border border-[#E5EADF] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              aria-expanded={testerProfilesExpanded}
              aria-controls="betadesk-tester-profiles-content"
              onClick={() => setTesterProfilesExpanded((expanded) => !expanded)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-2 text-lg">
                Tester profiles
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${testerProfilesExpanded ? 'rotate-180' : ''}`} />
              </span>
              <span className="mt-1 block text-xs text-[#76806B]">Create a private feedback link for {selectedProject.name}. Each link and its tickets stay in this project.</span>
            </button>
            <button type="button" className={primaryButton} disabled={creatingTester || selectedProject.id === 'legacy'} onClick={() => void createTesterLink()}>
              <Ticket className="h-4 w-4" /> {creatingTester ? 'Creating…' : 'Create tester link'}
            </button>
          </div>
          {testerProfilesExpanded && (
            <div id="betadesk-tester-profiles-content">
              {selectedProject.id === 'legacy' && <p className="mt-3 text-xs text-[#76806B]">This project contains historic tickets. Create a new project to invite testers for new feedback.</p>}
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
            </div>
          )}
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
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="col-span-2"><div className="text-[#8A9380]">Project</div><div className="mt-1">{selectedProject.name}</div></div>
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
