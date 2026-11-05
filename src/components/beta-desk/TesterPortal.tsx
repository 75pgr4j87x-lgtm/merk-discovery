import React from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Send,
  Ticket,
  Upload,
} from 'lucide-react';
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
  testerId: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  submitterName: string;
  platform: string;
  appVersion: string;
  deviceModel: string;
  operatingSystem: string;
  projectId: string;
  attachments: BetaAttachment[];
  createdAt: string;
  lastActivityAt: string;
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
}

interface BetaComment {
  id: string;
  authorType: 'tester' | 'admin';
  authorName: string;
  message: string;
  visibility: 'public' | 'internal';
  createdAt: string;
}

interface Tester {
  id: string;
  projectId?: string;
  displayName: string;
  active: boolean;
}

const categories: TicketCategory[] = [
  'Bug Report',
  'Feature Request',
  'General Feedback',
  'UI/UX Improvement',
  'Technical Issue',
  'Other',
];

const inputClass =
  'w-full rounded-lg border border-[#E5EADF] bg-white px-3 py-2.5 text-sm text-[#3F4A32] outline-none placeholder:text-[#9AA18E] focus:border-[#7C8B5F]';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[#3F4A32] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#343D29] disabled:cursor-not-allowed disabled:opacity-50';

function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function getError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : fallback;
}

const TesterShell: React.FC<React.PropsWithChildren<{
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onClickCapture?: React.MouseEventHandler<HTMLDivElement>;
}>> = ({ children, theme, onToggleTheme, onClickCapture }) => (
  <div className="betadesk-theme min-h-screen bg-[#FAF6F1] text-[#3F4A32]" data-theme={theme} onClickCapture={onClickCapture}>
    <div className="border-b border-[#E5EADF] bg-white/80 px-4 py-3 sm:px-7">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 text-xs font-medium tracking-wide text-[#69745E]">
        <div className="flex items-center gap-2"><Ticket className="h-4 w-4 text-[#7C8B5F]" /> MERAKIFOS <span className="text-[#D9A441]">/</span> BETADESK</div>
        <BetaDeskThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </div>
    {children}
  </div>
);

export const TesterPortal: React.FC<{ testerToken: string }> = ({ testerToken }) => {
  const { theme, toggle: toggleTheme } = useBetaDeskTheme();
  const [tester, setTester] = React.useState<Tester | null>(null);
  const [tickets, setTickets] = React.useState<BetaTicket[]>([]);
  const [projects, setProjects] = React.useState<BetaProject[]>([]);
  const [projectId, setProjectId] = React.useState('');
  const [uploadedFiles, setUploadedFiles] = React.useState<BetaAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [selectedTicket, setSelectedTicket] = React.useState<BetaTicket | null>(null);
  const [comments, setComments] = React.useState<BetaComment[]>([]);
  const [displayName, setDisplayName] = React.useState('');
  const [form, setForm] = React.useState({
    subject: '',
    description: '',
    category: 'Bug Report' as TicketCategory,
    platform: '',
    appVersion: '',
    deviceModel: '',
    operatingSystem: '',
  });
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleButtonSound: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-sound-control]')) return;
    const button = target.closest('button');
    if (button && !button.disabled) soundTrack.playSoftDrop(0.9);
  };

  const apiFetch = React.useCallback((path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${testerToken}`);
    return fetch(`/api/betadesk/tester${path}`, { ...init, headers });
  }, [testerToken]);

  const loadPortal = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [response, projectsResponse] = await Promise.all([
        apiFetch(''),
        apiFetch('/projects'),
      ]);
      if (!response.ok) throw new Error(await getError(response, 'This tester link is invalid or revoked.'));
      if (!projectsResponse.ok) throw new Error(await getError(projectsResponse, 'Could not load active beta projects.'));
      const data = await response.json() as { tester: Tester; tickets: BetaTicket[] };
      const projectData = await projectsResponse.json() as BetaProject[];
      setTester(data.tester);
      setTickets(data.tickets);
      setProjects(projectData);
      setProjectId((current) => current && projectData.some((project) => project.id === current) ? current : projectData[0]?.id || '');
    } catch (loadError) {
      setTester(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load your tester profile.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  React.useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const loadTicket = async (ticketNumber: string) => {
    setError('');
    try {
      const response = await apiFetch(`/tickets/${encodeURIComponent(ticketNumber)}`);
      if (!response.ok) throw new Error(await getError(response, 'Could not load ticket.'));
      const data = await response.json() as { ticket: BetaTicket; comments: BetaComment[] };
      setSelectedTicket(data.ticket);
      setComments(data.comments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load ticket.');
    }
  };

  const claimName = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch('/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      if (!response.ok) throw new Error(await getError(response, 'Could not save your name.'));
      const data = await response.json() as { tester: Tester; tickets: BetaTicket[] };
      setTester(data.tester);
      setTickets(data.tickets);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'Could not save your name.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (field: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const uploadFiles = async (selectedFiles: File[]) => {
    if (!selectedFiles.length) return;
    const supported = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']);
    const stagedSize = uploadedFiles.reduce((total, file) => total + file.size, 0)
      + selectedFiles.reduce((total, file) => total + file.size, 0);
    if (uploadedFiles.length + selectedFiles.length > 8 || stagedSize > 100 * 1024 * 1024) {
      setError('Attach up to 8 files and no more than 100 MB total.');
      return;
    }
    for (const file of selectedFiles) {
      const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
      if (!supported.has(file.type) || file.size > maxSize) {
        setError('Images must be JPEG, PNG, GIF or WebP up to 10 MB. Videos must be MP4, MOV or WebM up to 50 MB.');
        return;
      }
    }
    setUploading(true);
    setError('');
    try {
      for (const file of selectedFiles) {
        const grantResponse = await apiFetch('/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
        });
        if (!grantResponse.ok) throw new Error(await getError(grantResponse, 'Could not prepare an attachment.'));
        const upload = await grantResponse.json() as {
          grant: { uploadId: string; fileName: string; contentType: string };
          uploadUrl: string;
        };
        const uploadResponse = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
            'Content-Range': `bytes 0-${file.size - 1}/${file.size}`,
          },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error(`Could not upload ${file.name}.`);
        const driveFile = await uploadResponse.json() as { id: string };
        const completeResponse = await apiFetch(`/uploads/${encodeURIComponent(upload.grant.uploadId)}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: driveFile.id }),
        });
        if (!completeResponse.ok) throw new Error(await getError(completeResponse, `Could not verify ${file.name}.`));
        const completed = await completeResponse.json() as { attachment: BetaAttachment };
        const attachment = completed.attachment;
        setUploadedFiles((current) => [...current, attachment]);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) {
      setError('There are no active beta projects. Please contact your beta administrator.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch('/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ ...form, projectId, attachments: uploadedFiles.map((file) => file.uploadId) }),
      });
      if (!response.ok) throw new Error(await getError(response, 'Could not submit feedback.'));
      const data = await response.json() as { ticket: BetaTicket };
      setForm({
        subject: '',
        description: '',
        category: 'Bug Report',
        platform: '',
        appVersion: '',
        deviceModel: '',
        operatingSystem: '',
      });
      setUploadedFiles([]);
      setIdempotencyKey(crypto.randomUUID());
      await loadPortal();
      await loadTicket(data.ticket.ticketNumber);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !message.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch(
        `/tickets/${encodeURIComponent(selectedTicket.ticketNumber)}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        }
      );
      if (!response.ok) throw new Error(await getError(response, 'Could not send your reply.'));
      setMessage('');
      await loadTicket(selectedTicket.ticketNumber);
      await loadPortal();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Could not send your reply.');
    } finally {
      setSubmitting(false);
    }
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
        const response = await apiFetch(
          `/tickets/${encodeURIComponent(ticket.ticketNumber)}/attachments/${encodeURIComponent(attachment.uploadId)}`,
          { headers: { Range: `bytes=${start}-${end}` } }
        );
        if (!response.ok) throw new Error(await getError(response, 'Could not access this attachment.'));
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
      setError(attachmentError instanceof Error ? attachmentError.message : 'Could not access this attachment.');
    }
  };

  if (loading) {
    return <TesterShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}><main className="mx-auto max-w-2xl p-8 text-center text-sm text-[#76806B]">Loading your personal feedback page…</main></TesterShell>;
  }

  if (!tester) {
    return (
      <TesterShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
        <main className="mx-auto mt-12 max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center">
          <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-rose-600" />
          <h1 className="text-2xl">Tester link unavailable</h1>
          <p className="mt-2 text-sm text-[#76806B]">{error}</p>
        </main>
      </TesterShell>
    );
  }

  return (
    <TesterShell theme={theme} onToggleTheme={toggleTheme} onClickCapture={handleButtonSound}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#F2F3ED] px-3 py-1 text-xs text-[#69745E]">
              <MessageSquare className="h-3.5 w-3.5" /> Private beta tester portal
            </div>
            <h1 className="text-3xl">Welcome{tester.displayName ? `, ${tester.displayName}` : ''}</h1>
            <p className="mt-1 text-sm text-[#76806B]">Submit feedback and check all updates to your tickets here.</p>
          </div>
          <button type="button" onClick={() => void loadPortal()} className="inline-flex items-center gap-2 rounded-lg border border-[#E5EADF] bg-white px-3 py-2 text-sm">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </header>

        {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        {!tester.displayName ? (
          <section className="max-w-xl rounded-2xl border border-[#E5EADF] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl">Set up your tester profile</h2>
            <p className="mb-5 mt-2 text-sm leading-6 text-[#76806B]">Add your name once to personalize your feedback. It will be saved to this private link and used as the reporter on every ticket. No email or sign-in is required.</p>
            <form onSubmit={claimName} className="space-y-3">
              <label className="block text-xs font-medium">Your name
                <input required autoFocus maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={`${inputClass} mt-1.5`} />
              </label>
              <button disabled={submitting || !displayName.trim()} className={buttonClass}>{submitting ? 'Saving…' : 'Save my name'}</button>
            </form>
          </section>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-2xl border border-[#E5EADF] bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl"><Ticket className="h-5 w-5 text-[#7C8B5F]" /> Submit feedback</h2>
              {projects.length === 0 && <p role="status" className="mb-4 rounded-lg bg-[#F2F3ED] p-3 text-xs text-[#69745E]">No beta projects are active. Please contact your beta administrator.</p>}
              <form onSubmit={submitTicket} className="space-y-3.5">
                {tester.projectId ? (
                  <div className="rounded-lg bg-[#F2F3ED] px-3 py-2.5 text-xs">
                    <span className="text-[#76806B]">Project</span>
                    <div className="mt-1 font-medium">{projects.find((project) => project.id === tester.projectId)?.name || 'Assigned project'}</div>
                  </div>
                ) : (
                  <label className="block text-xs font-medium">App / project
                    <select required value={projectId} onChange={(event) => setProjectId(event.target.value)} className={`${inputClass} mt-1.5`}>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="block text-xs font-medium">Category
                  <select value={form.category} onChange={updateForm('category')} className={`${inputClass} mt-1.5`}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium">Subject
                  <input required minLength={3} maxLength={150} value={form.subject} onChange={updateForm('subject')} className={`${inputClass} mt-1.5`} placeholder="A short summary" />
                </label>
                <label className="block text-xs font-medium">What happened or what would you like to see?
                  <textarea required minLength={10} maxLength={5000} rows={5} value={form.description} onChange={updateForm('description')} className={`${inputClass} mt-1.5`} placeholder="Include steps to reproduce if you are reporting a bug." />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium">Platform
                    <input maxLength={80} value={form.platform} onChange={updateForm('platform')} className={`${inputClass} mt-1.5`} placeholder="Web, iOS, Android…" />
                  </label>
                  <label className="text-xs font-medium">App version
                    <input maxLength={80} value={form.appVersion} onChange={updateForm('appVersion')} className={`${inputClass} mt-1.5`} />
                  </label>
                  <label className="text-xs font-medium">Device
                    <input maxLength={120} value={form.deviceModel} onChange={updateForm('deviceModel')} className={`${inputClass} mt-1.5`} placeholder="Optional" />
                  </label>
                  <label className="text-xs font-medium">Operating system
                    <input maxLength={120} value={form.operatingSystem} onChange={updateForm('operatingSystem')} className={`${inputClass} mt-1.5`} placeholder="Optional" />
                  </label>
                </div>
                <div>
                  <label htmlFor="betadesk-attachments" className="mb-1.5 block text-xs font-medium">Screenshots or video (optional)</label>
                  <input id="betadesk-attachments" type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm" disabled={uploading || submitting || uploadedFiles.length >= 8} onChange={(event) => {
                    const selected = Array.from(event.currentTarget.files || []);
                    event.currentTarget.value = '';
                    void uploadFiles(selected);
                  }} className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-[#F2F3ED] file:px-3 file:py-1.5`} />
                  <p className="mt-1 text-[11px] text-[#8A9380]"><Upload className="mr-1 inline h-3 w-3" />Images up to 10 MB; videos up to 50 MB. Maximum 8 files / 100 MB per ticket.</p>
                  {uploadedFiles.length > 0 && <ul className="mt-2 space-y-1">
                    {uploadedFiles.map((file) => <li key={file.uploadId} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.fileName} · {(file.size / (1024 * 1024)).toFixed(1)} MB</span><button type="button" className="text-rose-700 hover:underline" onClick={() => {
                      setUploadedFiles((current) => current.filter((item) => item.uploadId !== file.uploadId));
                    }}>Remove</button></li>)}
                  </ul>}
                </div>
                <p className="text-xs text-[#8A9380]">Do not include passwords, payment information, or other sensitive details.</p>
                <button disabled={submitting || uploading || !projects.length} className={buttonClass}><Send className="h-4 w-4" /> {uploading ? 'Uploading…' : submitting ? 'Submitting…' : 'Submit feedback'}</button>
              </form>
            </section>

            <section className="rounded-2xl border border-[#E5EADF] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E5EADF] p-5">
                <div>
                  <h2 className="text-xl">Your tickets</h2>
                  <p className="mt-1 text-xs text-[#8A9380]">{tickets.length} ticket{tickets.length === 1 ? '' : 's'} linked to your profile</p>
                </div>
                <Clock className="h-5 w-5 text-[#7C8B5F]" />
              </div>
              {tickets.length === 0 ? (
                <div className="p-8 text-center">
                  <Ticket className="mx-auto mb-2 h-7 w-7 text-[#A7AE9B]" />
                  <p className="text-sm font-medium">No tickets yet</p>
                  <p className="mt-1 text-xs text-[#8A9380]">Your submissions and replies will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F0F1EB]">
                  {tickets.map((ticket) => (
                    <button key={ticket.ticketNumber} type="button" onClick={() => void loadTicket(ticket.ticketNumber)} className={`block w-full px-5 py-4 text-left transition hover:bg-[#FAFBF8] ${selectedTicket?.ticketNumber === ticket.ticketNumber ? 'bg-[#F7F8F3]' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] text-[#7C8B5F]">{ticket.ticketNumber} · {ticket.category}</div>
                          <div className="mt-1 truncate text-sm font-medium">{ticket.subject}</div>
                          <div className="mt-1 text-[11px] text-[#8A9380]">Updated {dateLabel(ticket.lastActivityAt)}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#F2F3ED] px-2 py-1 text-[10px] text-[#69745E]">{ticket.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedTicket && (
              <section className="rounded-2xl border border-[#E5EADF] bg-white shadow-sm lg:col-span-2">
                <header className="border-b border-[#E5EADF] p-5">
                  <button type="button" onClick={() => setSelectedTicket(null)} className="mb-3 inline-flex items-center gap-1 text-xs text-[#7C8B5F] hover:underline lg:hidden">
                    <ArrowLeft className="h-3.5 w-3.5" /> All tickets
                  </button>
                  <div className="text-xs text-[#7C8B5F]">{selectedTicket.ticketNumber} · {selectedTicket.category} · {selectedTicket.status}</div>
                  <h2 className="mt-1 text-2xl">{selectedTicket.subject}</h2>
                  <p className="mt-1 text-xs text-[#8A9380]">Created {dateLabel(selectedTicket.createdAt)}</p>
                </header>
                <div className="grid gap-5 p-5 md:grid-cols-2">
                  <article>
                    <h3 className="mb-2 text-sm font-medium">Your feedback</h3>
                    <p className="whitespace-pre-wrap rounded-lg bg-[#FAFBF8] p-3 text-sm leading-6">{selectedTicket.description}</p>
                    <div className="mt-3 text-xs text-[#8A9380]">
                      {[selectedTicket.platform, selectedTicket.appVersion, selectedTicket.deviceModel, selectedTicket.operatingSystem].filter(Boolean).join(' · ') || 'No device details provided'}
                    </div>
                    {selectedTicket.attachments?.length > 0 && (
                      <div className="mt-4">
                        <h3 className="mb-2 text-sm font-medium">Your attachments</h3>
                        <ul className="space-y-1">
                          {selectedTicket.attachments.map((attachment) => (
                            <li key={attachment.uploadId}>
                              <button type="button" className="w-full truncate rounded-lg border border-[#E5EADF] px-3 py-2 text-left text-xs hover:border-[#7C8B5F]" onClick={() => void openAttachment(selectedTicket, attachment)}>
                                {attachment.fileName} · {(attachment.size / (1024 * 1024)).toFixed(1)} MB
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><MessageSquare className="h-4 w-4 text-[#7C8B5F]" /> Replies</h3>
                    <div className="max-h-72 space-y-2 overflow-auto">
                      {comments.length === 0 ? <p className="text-xs text-[#8A9380]">No replies yet.</p> : comments.map((comment) => (
                        <article key={comment.id} className="rounded-lg border border-[#E5EADF] p-3">
                          <div className="flex justify-between gap-2 text-[11px]">
                            <span className="font-medium">{comment.authorType === 'admin' ? 'Beta support' : 'You'}</span>
                            <time className="text-[#8A9380]">{dateLabel(comment.createdAt)}</time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-5">{comment.message}</p>
                        </article>
                      ))}
                    </div>
                    {selectedTicket.status === 'Closed' ? (
                      <p className="mt-3 rounded-lg bg-[#F7F8F4] p-3 text-xs text-[#69745E]">This ticket is closed and can no longer receive replies.</p>
                    ) : (
                      <form onSubmit={sendReply} className="mt-3 space-y-2">
                        <textarea required maxLength={3000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} placeholder="Write a reply…" />
                        <button disabled={submitting || !message.trim()} className={buttonClass}><Send className="h-4 w-4" /> Send reply</button>
                      </form>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
        <p className="mt-6 text-xs text-[#8A9380]">Keep this personal link private. Anyone with it can view and reply to tickets on this profile.</p>
      </main>
    </TesterShell>
  );
};

export const TesterLinkRequired: React.FC = () => {
  const { theme, toggle: toggleTheme } = useBetaDeskTheme();
  return (
  <TesterShell theme={theme} onToggleTheme={toggleTheme}>
    <main className="mx-auto mt-12 max-w-lg rounded-2xl border border-[#E5EADF] bg-white p-8 text-center">
      <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-[#7C8B5F]" />
      <h1 className="text-2xl">Personal tester link required</h1>
      <p className="mt-2 text-sm leading-6 text-[#76806B]">Ask your beta administrator for your private feedback link. It gives you access to your personal profile and all of your tickets without an account or email address.</p>
    </main>
  </TesterShell>
  );
};
