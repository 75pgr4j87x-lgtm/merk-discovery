import React from 'react';
import { User } from 'firebase/auth';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { initAuth, auth, studioFetch } from '../../services/auth';
import { createGoogleDocBrief } from '../../services/googleDocs';
import {
  Table,
  Download,
  ExternalLink,
  RefreshCw,
  FileText,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  Lock,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  Inbox,
  AlertCircle,
  X,
  ChevronRight,
  LogOut,
  Calendar,
  Globe,
  DollarSign,
  Palette,
  Key,
  EyeOff,
  Shield,
  KanbanSquare,
} from 'lucide-react';
import { exportBriefAsPdf } from '../../utils/pdfGenerator';
import { cleanBriefDocument } from '../../services/briefGenerator';
import { ProjectWorkspace } from './ProjectWorkspace';

interface StoredSubmission {
  id: string;
  timestamp: string;
  approved: boolean;
  approvedAt?: string;
  clientName: string;
  clientEmail: string;
  companyName: string;
  businessAndClient?: string;
  brandVibe?: string[];
  visualColors?: string;
  selectedColors?: string[];
  existingAssets?: string[];
  coreObjectives?: string[];
  inspirationSites?: string;
  successOutcome?: string;
  timelineSelection?: string;
  customTimeline?: string;
  budgetSelection?: string;
  customBudget?: string;
  hasDomain?: boolean;
  domainName?: string;
  needDomainHelp?: boolean;
  websiteStatus?: string;
  businessSummary?: string;
  primaryGoal?: string;
  targetAudience?: string;
  corePainPoint?: string;
  aestheticVibe?: string;
  selectedFeatures?: string[];
  budgetTier?: string;
  targetLaunchWindow?: string;
  brief: string;
}

interface OutboxEntry {
  id: string;
  submissionId: string;
  recipient: string;
  subject: string;
  sentAt: string;
  status: 'sent' | 'recorded' | 'failed';
  companyName: string;
  clientName: string;
  clientEmail: string;
  summary: string;
  htmlBody: string;
  error?: string;
}

const DEFAULT_OWNER_EMAIL = 'kelvensarbah@gmail.com';

async function downloadStudioFile(path: string, filename: string) {
  const response = await studioFetch(path);
  if (!response.ok) throw new Error('Could not download the requested file.');

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export const StudioPortalApp: React.FC = () => {
  // Authentication & Gate State: Restricted strictly to Keven Sarbah
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  // Data State
  const [submissions, setSubmissions] = React.useState<StoredSubmission[]>([]);
  const [outbox, setOutbox] = React.useState<OutboxEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'approved' | 'pending'>('all');

  // Modals / Overlays
  const [viewingBriefSub, setViewingBriefSub] = React.useState<StoredSubmission | null>(null);
  const [viewingAnswersSub, setViewingAnswersSub] = React.useState<StoredSubmission | null>(null);
  const [isOutboxOpen, setIsOutboxOpen] = React.useState(false);
  const [previewEmail, setPreviewEmail] = React.useState<OutboxEntry | null>(null);
  const [projectWorkspaceId, setProjectWorkspaceId] = React.useState<string | null>(null);

  // Action status
  const [sendingEmailId, setSendingEmailId] = React.useState<string | null>(null);
  const [emailSuccessMsg, setEmailSuccessMsg] = React.useState<string | null>(null);
  const [copyToast, setCopyToast] = React.useState(false);
  const [syncingDocId, setSyncingDocId] = React.useState<string | null>(null);

  // Initialize Auth - Strictly verifies founder email identity
  React.useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        if (currentUser) {
          if (currentUser.email?.toLowerCase() === DEFAULT_OWNER_EMAIL && currentUser.emailVerified) {
            setUser(currentUser);
            setIsAuthenticated(true);
          } else {
            // Unauthorized login attempt blocked immediately
            setUser(null);
            setIsAuthenticated(false);
            auth.signOut().catch(() => {});
          }
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      },
      () => {
        setUser(null);
        setIsAuthenticated(false);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Fetch Submissions and Outbox
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [subsRes, outboxRes] = await Promise.all([
        studioFetch('/api/submissions'),
        studioFetch('/api/outbox'),
      ]);
      if (subsRes.ok) {
        const subsData = await subsRes.json();
        setSubmissions(subsData);
      }
      if (outboxRes.ok) {
        const outboxData = await outboxRes.json();
        setOutbox(outboxData);
      }
    } catch (e) {
      console.error('Failed to load studio data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  const handleSignOut = () => {
    setIsAuthenticated(false);
    auth.signOut().catch(() => {});
  };

  const handleDownload = async (path: string, filename: string) => {
    try {
      await downloadStudioFile(path, filename);
    } catch (error) {
      console.error('Studio download failed:', error);
      alert('Could not download the requested file. Please sign in again and retry.');
    }
  };

  // Dispatch Brief Copy to Keven
  const handleSendBriefCopy = async (sub: StoredSubmission, customRecipient?: string) => {
    setSendingEmailId(sub.id);
    setEmailSuccessMsg(null);
    try {
      const res = await studioFetch('/api/send-brief-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: sub.id,
          recipientEmail: customRecipient || DEFAULT_OWNER_EMAIL,
          customNote: 'Dispatched from Merakifos Studio OS',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEmailSuccessMsg(`Brief copy sent to ${data.recipient || DEFAULT_OWNER_EMAIL}`);
        // Refresh outbox
        const outboxRes = await studioFetch('/api/outbox');
        if (outboxRes.ok) {
          setOutbox(await outboxRes.json());
        }
        setTimeout(() => setEmailSuccessMsg(null), 5000);
      } else {
        alert('Failed to send brief copy email.');
      }
    } catch (e) {
      console.error(e);
      alert('Error dispatching email.');
    } finally {
      setSendingEmailId(null);
    }
  };

  // Export to Google Doc
  const handleExportGoogleDoc = async (sub: StoredSubmission) => {
    if (!user) {
      alert('Connect your Google account in the top bar to export directly into your Google Drive.');
      return;
    }
    setSyncingDocId(sub.id);
    try {
      const res = await createGoogleDocBrief({
        title: `MERAKIFOS • ${sub.companyName || 'Project'} Brief`,
        briefText: sub.brief,
      });
      window.open(res.docUrl, '_blank');
    } catch (err: any) {
      alert(err.message || 'Error exporting to Google Doc');
    } finally {
      setSyncingDocId(null);
    }
  };

  // Copy Brief text
  const handleCopyBrief = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2500);
  };

  // Filter Submissions
  const filteredSubmissions = submissions.filter((sub) => {
    const matchesFilter =
      statusFilter === 'all'
        ? true
        : statusFilter === 'approved'
        ? sub.approved
        : !sub.approved;

    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      (sub.companyName || '').toLowerCase().includes(term) ||
      (sub.clientName || '').toLowerCase().includes(term) ||
      (sub.clientEmail || '').toLowerCase().includes(term) ||
      (sub.brief || '').toLowerCase().includes(term) ||
      (sub.primaryGoal || '').toLowerCase().includes(term);

    return matchesFilter && matchesSearch;
  });

  const totalApproved = submissions.filter((s) => s.approved).length;
  const totalPending = submissions.filter((s) => !s.approved).length;

  // -------------------------------------------------------------
  // RENDER: Lock Screen if not authenticated
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex flex-col justify-center items-center px-4 font-sans text-[#3F4A32]">
        <div className="max-w-md w-full bg-white border border-[#E5EADF] rounded-3xl p-8 sm:p-10 shadow-xl text-center relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-[#7C8B5F]/10 blur-2xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-[#D9A441]/15 blur-2xl pointer-events-none" />

          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FAF6F1] border border-[#E5EADF] text-[#3F4A32] mb-6 shadow-2xs">
            <Lock className="w-6 h-6 text-[#7C8B5F]" />
          </div>

          <div className="flex items-center justify-center gap-2 mb-1.5">
            <span className="font-heading font-normal text-xs tracking-[0.25em] uppercase text-[#3F4A32]">
              MERAKIFOS
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
            <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
              STUDIO OS
            </span>
          </div>

          <h1 className="text-2xl font-heading font-normal text-[#3F4A32] mb-2">
            Founder Operating Portal
          </h1>
          <p className="text-xs text-[#7C8B5F] font-body font-light mb-8 max-w-xs mx-auto">
            Restricted access for Keven Sarbah. Review client intakes, auto-sync Excel workbooks, and manage project briefs.
          </p>

          <div className="flex justify-center">
            <GoogleSignInButton user={user} onAuthChange={setUser} />
          </div>

          <div className="mt-8 pt-4 border-t border-stone-100 flex items-center justify-between text-[10px] text-[#7C8B5F]/70 font-body font-light">
            <span>Notification Target: {DEFAULT_OWNER_EMAIL}</span>
            <a
              href="/"
              className="text-[#3F4A32] hover:underline"
            >
              Return to Intake Flow
            </a>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Full Studio OS Application
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#FAF6F1] text-[#3F4A32] font-sans flex flex-col selection:bg-[#7C8B5F]/20 selection:text-[#3F4A32]">
      {/* Studio Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF6F1]/90 backdrop-blur-md border-b border-[#E5EADF] px-4 sm:px-8 py-3.5 transition">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-heading font-normal text-xs tracking-[0.25em] uppercase text-[#3F4A32]">
                MERAKIFOS
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              <span className="text-[11px] tracking-widest uppercase font-body font-light text-[#7C8B5F]">
                STUDIO OS
              </span>
            </div>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] bg-white border border-[#E5EADF] text-[#7C8B5F] font-body font-light">
              Founder: Keven Sarbah
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Outbox Badge */}
            <button
              onClick={() => setIsOutboxOpen(true)}
              className="px-3 py-1.5 rounded-full bg-white hover:bg-[#FAF6F1] border border-[#E5EADF] hover:border-[#7C8B5F] text-xs font-body font-light text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Inbox className="w-3.5 h-3.5 text-[#7C8B5F]" />
              <span className="hidden md:inline">Dispatched Briefs:</span>
              <span className="font-medium text-[#3F4A32]">{outbox.length}</span>
            </button>

            {/* Direct Link to Client Experience */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-full bg-white hover:bg-[#FAF6F1] border border-[#E5EADF] hover:border-[#7C8B5F] text-xs font-body font-light text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Preview client intake questionnaire in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#7C8B5F]" />
              <span className="hidden sm:inline">Client Intake Form</span>
            </a>

            {/* Google Drive / Auth Button */}
            <GoogleSignInButton user={user} onAuthChange={setUser} />

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              title="Lock Studio Portal"
              className="p-2 rounded-full text-[#7C8B5F] hover:text-[#3F4A32] hover:bg-white border border-transparent hover:border-[#E5EADF] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Banner Alert if email was just dispatched */}
        {emailSuccessMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-center justify-between text-xs font-body font-light animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{emailSuccessMsg}</span>
            </div>
            <button
              onClick={() => setEmailSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Studio Command Header & KPI Cards */}
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[#7C8B5F] font-body font-light mb-1">
                Client Intelligence & Excel Database
              </div>
              <h1 className="text-3xl font-heading font-normal text-[#3F4A32]">
                Responses & Briefs Hub
              </h1>
              <p className="text-xs text-[#7C8B5F] font-body font-light mt-1">
                All client responses are automatically appended to your master Excel sheet and copies sent to{' '}
                <span className="text-[#3F4A32] font-normal underline">{DEFAULT_OWNER_EMAIL}</span>.
              </p>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Master Excel (.xlsx) Download */}
              <button
                type="button"
                onClick={() => handleDownload('/api/submissions/excel', 'merakifos_client_responses.xlsx')}
                className="px-4 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs font-body font-normal rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#D9A441]" />
                <span>Download Master Excel (.xlsx)</span>
              </button>

              {/* Master CSV Download */}
              <button
                type="button"
                onClick={() => handleDownload('/api/submissions/csv', 'merakifos_discovery_submissions.csv')}
                className="px-4 py-2.5 bg-white hover:bg-[#FAF6F1] border border-[#E5EADF] hover:border-[#7C8B5F] text-[#3F4A32] text-xs font-body font-light rounded-xl transition flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#7C8B5F]" />
                <span>Download CSV</span>
              </button>

              {/* Refresh Button */}
              <button
                onClick={fetchData}
                disabled={isLoading}
                className="p-2.5 bg-white hover:bg-[#FAF6F1] border border-[#E5EADF] rounded-xl text-[#7C8B5F] hover:text-[#3F4A32] transition cursor-pointer shadow-2xs disabled:opacity-50"
                title="Refresh submissions"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E5EADF] rounded-2xl p-4 shadow-2xs text-left">
              <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                Total Inquiries
              </span>
              <div className="text-2xl font-heading font-normal text-[#3F4A32] mt-1">
                {submissions.length}
              </div>
              <div className="text-[10px] text-[#7C8B5F] mt-1 font-body font-light">
                Logged in master database
              </div>
            </div>

            <div className="bg-white border border-[#E5EADF] rounded-2xl p-4 shadow-2xs text-left">
              <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                Approved Project Briefs
              </span>
              <div className="text-2xl font-heading font-normal text-[#15803D] mt-1 flex items-center gap-2">
                <span>{totalApproved}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-[10px] text-[#7C8B5F] mt-1 font-body font-light">
                Ready for discovery call
              </div>
            </div>

            <div className="bg-white border border-[#E5EADF] rounded-2xl p-4 shadow-2xs text-left">
              <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                Pending Client Review
              </span>
              <div className="text-2xl font-heading font-normal text-[#B45309] mt-1 flex items-center gap-2">
                <span>{totalPending}</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-[10px] text-[#7C8B5F] mt-1 font-body font-light">
                Drafts currently in intake
              </div>
            </div>

            <div className="bg-white border border-[#E5EADF] rounded-2xl p-4 shadow-2xs text-left">
              <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                Dispatched Briefs
              </span>
              <div className="text-2xl font-heading font-normal text-[#3F4A32] mt-1 flex items-center gap-2">
                <span>{outbox.length}</span>
                <Mail className="w-4 h-4 text-[#7C8B5F]" />
              </div>
              <div className="text-[10px] text-[#7C8B5F] mt-1 font-body font-light truncate" title={DEFAULT_OWNER_EMAIL}>
                Delivered to {DEFAULT_OWNER_EMAIL}
              </div>
            </div>
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="bg-white border border-[#E5EADF] rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-[#7C8B5F] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by company, client name, email, or brief keyword..."
              className="w-full pl-10 pr-4 py-2 bg-[#FAF6F1] border border-[#E5EADF] focus:border-[#3F4A32] rounded-xl text-xs text-[#3F4A32] outline-none transition font-body font-light"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light mr-1">
              Filter:
            </span>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-light transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#3F4A32] text-[#FAF6F1]'
                  : 'bg-[#FAF6F1] text-[#7C8B5F] hover:text-[#3F4A32]'
              }`}
            >
              All ({submissions.length})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-light transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'approved'
                  ? 'bg-[#3F4A32] text-[#FAF6F1]'
                  : 'bg-[#FAF6F1] text-[#7C8B5F] hover:text-[#3F4A32]'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-[#7C8B5F]" />
              <span>Approved ({totalApproved})</span>
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-light transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-[#3F4A32] text-[#FAF6F1]'
                  : 'bg-[#FAF6F1] text-[#7C8B5F] hover:text-[#3F4A32]'
              }`}
            >
              <Clock className="w-3 h-3 text-amber-600" />
              <span>Pending ({totalPending})</span>
            </button>
          </div>
        </section>

        {/* Submissions Table / Cards */}
        <section className="bg-white border border-[#E5EADF] rounded-3xl shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-[#E5EADF] flex items-center justify-between">
            <h2 className="text-base font-heading font-normal text-[#3F4A32]">
              Client Submissions ({filteredSubmissions.length})
            </h2>
            <span className="text-[11px] text-[#7C8B5F] font-body font-light">
              Live synchronized with <span className="font-mono text-[#3F4A32]">merakifos_client_responses.xlsx</span>
            </span>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="py-20 text-center text-[#7C8B5F] font-body font-light text-xs">
              {isLoading ? 'Loading submissions from Excel database...' : 'No client submissions match your criteria.'}
            </div>
          ) : (
            <div className="divide-y divide-[#E5EADF]">
              {filteredSubmissions.map((sub) => {
                const colors = sub.selectedColors || [];
                const formattedDate = sub.timestamp
                  ? new Date(sub.timestamp).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recent';

                return (
                  <div
                    key={sub.id}
                    className="p-5 sm:p-6 hover:bg-[#FAF6F1]/50 transition flex flex-col lg:flex-row lg:items-center justify-between gap-6 text-left"
                  >
                    {/* Left details */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-base font-heading font-normal text-[#3F4A32]">
                          {sub.companyName || 'Untitled Brand'}
                        </span>
                        {sub.approved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Approved by Client
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                            <Clock className="w-3 h-3 text-amber-600" /> Pending Approval
                          </span>
                        )}
                        <span className="text-[11px] text-[#7C8B5F] font-body font-light">
                          {formattedDate}
                        </span>
                      </div>

                      {/* Client Info & Badges */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7C8B5F] font-body font-light">
                        <span className="text-[#3F4A32] font-normal">
                          {sub.clientName || 'Anonymous Client'}
                        </span>
                        {sub.clientEmail && (
                          <a
                            href={`mailto:${sub.clientEmail}`}
                            className="text-[#7C8B5F] hover:text-[#3F4A32] underline"
                          >
                            {sub.clientEmail}
                          </a>
                        )}
                        <span>•</span>
                        <span>Budget: <strong className="text-[#3F4A32] font-normal">{sub.budgetSelection || sub.budgetTier || 'Custom'}</strong></span>
                        <span>•</span>
                        <span>Timeline: <strong className="text-[#3F4A32] font-normal">{sub.timelineSelection || sub.targetLaunchWindow || 'Flexible'}</strong></span>
                      </div>

                      {/* Palette chips & offering */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {colors.length > 0 && (
                          <div className="flex items-center gap-1 mr-2" title={`Palette: ${colors.join(', ')}`}>
                            {colors.map((c, i) => (
                              <span
                                key={i}
                                className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        )}
                        {sub.domainName && (
                          <span className="px-2 py-0.5 bg-[#FAF6F1] border border-[#E5EADF] text-[#3F4A32] rounded text-[10px] font-mono">
                            {sub.domainName}
                          </span>
                        )}
                        {sub.primaryGoal && (
                          <span className="px-2 py-0.5 bg-[#FAF6F1] border border-[#E5EADF] text-[#7C8B5F] rounded text-[10px] uppercase tracking-wider font-light">
                            Goal: {sub.primaryGoal}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right action buttons */}
                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                      <button
                        onClick={() => setProjectWorkspaceId(sub.id)}
                        className="px-3 py-2 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] rounded-xl text-xs font-body font-normal transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Open the project workflow and invoice"
                      >
                        <KanbanSquare className="w-3.5 h-3.5 text-[#D9A441]" />
                        <span>Project</span>
                      </button>
                      {/* View Brief Button */}
                      <button
                        onClick={() => setViewingBriefSub(sub)}
                        className="px-3 py-2 bg-[#FAF6F1] hover:bg-stone-100 text-[#3F4A32] border border-[#E5EADF] hover:border-[#7C8B5F] rounded-xl text-xs font-body font-light transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="View synthesized brief"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#7C8B5F]" />
                        <span>View Brief</span>
                      </button>

                      {/* Send Copy to Me Button */}
                      <button
                        onClick={() => handleSendBriefCopy(sub)}
                        disabled={sendingEmailId === sub.id}
                        className="px-3 py-2 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] rounded-xl text-xs font-body font-normal transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                        title={`Send copy of this brief to ${DEFAULT_OWNER_EMAIL}`}
                      >
                        <Mail className="w-3.5 h-3.5 text-[#D9A441]" />
                        <span>{sendingEmailId === sub.id ? 'Sending...' : 'Email Copy to Me'}</span>
                      </button>

                      {/* Download Single Client Excel */}
                      <button
                        type="button"
                        onClick={() => handleDownload(`/api/submissions/${sub.id}/excel`, `merakifos_${sub.companyName || 'client'}_brief.xlsx`)}
                        className="px-3 py-2 bg-white hover:bg-[#FAF6F1] text-[#3F4A32] border border-[#E5EADF] hover:border-[#7C8B5F] rounded-xl text-xs font-body font-light transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Download individual Excel spreadsheet for this client"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-[#7C8B5F]" />
                        <span className="hidden sm:inline">Excel</span>
                      </button>

                      {/* View Full Questionnaire Answers */}
                      <button
                        onClick={() => setViewingAnswersSub(sub)}
                        className="px-3 py-2 bg-white hover:bg-[#FAF6F1] text-[#7C8B5F] hover:text-[#3F4A32] border border-[#E5EADF] rounded-xl text-xs font-body font-light transition cursor-pointer"
                        title="View raw answers"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* Export to Google Doc */}
                      <button
                        onClick={() => handleExportGoogleDoc(sub)}
                        disabled={syncingDocId === sub.id}
                        className="p-2 bg-white hover:bg-[#FAF6F1] text-[#7C8B5F] hover:text-[#3F4A32] border border-[#E5EADF] rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                        title="Create Google Doc in your Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ----------------------------------------------------------- */}
      {/* MODAL: Full Project Brief Viewer & Copying */}
      {/* ----------------------------------------------------------- */}
      {viewingBriefSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-[#E5EADF] rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[85vh] flex flex-col text-left animate-scaleIn">
            <button
              onClick={() => setViewingBriefSub(null)}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-900 p-1.5 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E5EADF] gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-normal text-xs tracking-widest uppercase text-[#3F4A32]">
                    MERAKIFOS
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
                  <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                    {viewingBriefSub.approved ? 'Approved Project Brief' : 'Draft Brief'}
                  </span>
                </div>
                <h2 className="text-xl font-heading font-normal text-[#3F4A32] mt-1">
                  {viewingBriefSub.companyName || 'Brand'} Project Brief
                </h2>
                <div className="text-xs text-[#7C8B5F] font-body font-light">
                  Client: {viewingBriefSub.clientName || 'Client'} ({viewingBriefSub.clientEmail || 'No email'}) • {viewingBriefSub.budgetSelection || viewingBriefSub.budgetTier} • {viewingBriefSub.timelineSelection || viewingBriefSub.targetLaunchWindow}
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyBrief(viewingBriefSub.brief)}
                  className="px-3 py-1.5 bg-[#FAF6F1] hover:bg-stone-100 text-[#3F4A32] text-xs font-body font-light rounded-full border border-[#E5EADF] flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copyToast ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#7C8B5F]" />
                      <span>Copy Brief</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    const cleaned = cleanBriefDocument(viewingBriefSub.brief, viewingBriefSub.companyName || 'Brand');
                    exportBriefAsPdf(viewingBriefSub as any, cleaned, viewingBriefSub.approvedAt);
                  }}
                  className="px-3 py-1.5 bg-[#FAF6F1] hover:bg-stone-100 text-[#3F4A32] text-xs font-body font-light rounded-full border border-[#E5EADF] flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#7C8B5F]" />
                  <span>Download PDF</span>
                </button>

                <button
                  onClick={() => handleSendBriefCopy(viewingBriefSub)}
                  disabled={sendingEmailId === viewingBriefSub.id}
                  className="px-3.5 py-1.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs font-body font-normal rounded-full flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 text-[#D9A441]" />
                  <span>Email Copy to Me</span>
                </button>
              </div>
            </div>

            {/* Brief Content Box */}
            <div className="flex-1 overflow-y-auto my-4 p-5 bg-[#FAF6F1]/50 border border-[#E5EADF] rounded-2xl font-serif text-sm leading-relaxed text-[#27272A] whitespace-pre-wrap select-text">
              {viewingBriefSub.brief || 'No synthesized brief generated yet.'}
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-[#7C8B5F] font-body font-light">
              <span>Word Count: {(viewingBriefSub.brief || '').split(/\s+/).filter(Boolean).length} words</span>
              <span>Logged in Master Excel Sheet</span>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* MODAL: Full Questionnaire Answers Inspector */}
      {/* ----------------------------------------------------------- */}
      {viewingAnswersSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-[#E5EADF] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[85vh] flex flex-col text-left">
            <button
              onClick={() => setViewingAnswersSub(null)}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-900 p-1.5 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="pb-4 border-b border-[#E5EADF]">
              <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                Discovery Questionnaire Record
              </span>
              <h2 className="text-xl font-heading font-normal text-[#3F4A32] mt-0.5">
                {viewingAnswersSub.companyName || 'Brand'} Answers
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-4 text-xs font-body font-light pr-2">
              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 0: Identity & Contact</strong>
                <div>Client Name: {viewingAnswersSub.clientName || 'N/A'}</div>
                <div>Client Email: {viewingAnswersSub.clientEmail || 'N/A'}</div>
                <div>Company Name: {viewingAnswersSub.companyName || 'N/A'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 1: Domain & Online Presence</strong>
                <div>Domain: {viewingAnswersSub.hasDomain ? (viewingAnswersSub.domainName || 'Owns domain') : (viewingAnswersSub.needDomainHelp ? 'Needs Help Buying' : 'Will Purchase')}</div>
                <div>Website Status: {viewingAnswersSub.websiteStatus || 'N/A'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 2: Business & Offering</strong>
                <div>{viewingAnswersSub.businessAndClient || viewingAnswersSub.businessSummary || 'None provided'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 3: Brand Vibe & Aesthetic</strong>
                <div>Vibes: {(viewingAnswersSub.brandVibe || []).join(', ') || viewingAnswersSub.aestheticVibe || 'None'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 4: Color Palette (1 to 3 shades)</strong>
                <div className="flex items-center gap-2 mt-1">
                  {(viewingAnswersSub.selectedColors || []).map((hex, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-[#E5EADF] font-mono text-[10px]">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: hex }} />
                      {hex}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 5: Existing Assets & Identity</strong>
                <div>{(viewingAnswersSub.existingAssets || []).join(', ') || 'No existing assets'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 6: Core Objectives</strong>
                <div>{(viewingAnswersSub.coreObjectives || []).join(', ') || 'None selected'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 7: Inspiration & References</strong>
                <div>Sites / URLs: {viewingAnswersSub.inspirationSites || 'None provided'}</div>
              </div>

              <div className="p-3 bg-[#FAF6F1] rounded-xl border border-[#E5EADF]">
                <strong className="block text-[#3F4A32] font-medium mb-1">Step 8: Budget, Timeline & Success</strong>
                <div>Timeline Selection: {viewingAnswersSub.timelineSelection || viewingAnswersSub.targetLaunchWindow || 'N/A'}</div>
                {viewingAnswersSub.customTimeline && <div>Custom Timeline: {viewingAnswersSub.customTimeline}</div>}
                <div>Budget Selection: {viewingAnswersSub.budgetSelection || viewingAnswersSub.budgetTier || 'N/A'}</div>
                {viewingAnswersSub.customBudget && <div>Custom Budget: {viewingAnswersSub.customBudget}</div>}
                <div>Success Definition: {viewingAnswersSub.successOutcome || 'None provided'}</div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setViewingAnswersSub(null)}
                className="px-5 py-2 bg-[#3F4A32] text-[#FAF6F1] rounded-xl text-xs font-body font-normal cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* MODAL: Dispatched Briefs Outbox Log */}
      {/* ----------------------------------------------------------- */}
      {isOutboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-[#E5EADF] rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[85vh] flex flex-col text-left">
            <button
              onClick={() => {
                setIsOutboxOpen(false);
                setPreviewEmail(null);
              }}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-900 p-1.5 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-between pb-4 border-b border-[#E5EADF]">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#7C8B5F] font-body font-light">
                  Email Audit Log
                </span>
                <h2 className="text-xl font-heading font-normal text-[#3F4A32] mt-0.5">
                  Briefs Dispatched to Founder ({outbox.length})
                </h2>
                <div className="text-xs text-[#7C8B5F] font-body font-light">
                  Recipient target: <strong className="text-[#3F4A32] font-normal">{DEFAULT_OWNER_EMAIL}</strong>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto my-4 border border-[#E5EADF] rounded-2xl">
              {outbox.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#7C8B5F] font-body font-light">
                  No copies of briefs dispatched yet. Whenever a client approves a brief, a copy is automatically recorded here.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse font-body font-light">
                  <thead className="bg-[#FAF6F1] border-b border-[#E5EADF] text-[#7C8B5F] uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Dispatched At</th>
                      <th className="p-3">Company / Client</th>
                      <th className="p-3">Recipient</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EADF] text-[#3F4A32]">
                    {outbox.map((mail) => (
                      <tr key={mail.id} className="hover:bg-[#FAF6F1]/50 transition">
                        <td className="p-3 text-[#7C8B5F] whitespace-nowrap">
                          {new Date(mail.sentAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-3">
                          <strong className="font-medium">{mail.companyName}</strong>
                          <div className="text-[11px] text-[#7C8B5F]">{mail.clientName}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-[#7C8B5F]">
                          {mail.recipient}
                        </td>
                        <td className="p-3 max-w-xs truncate" title={mail.subject}>
                          {mail.subject}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 font-medium">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {mail.status === 'sent' ? 'Sent (SMTP)' : 'Dispatched'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setPreviewEmail(mail)}
                            className="px-2.5 py-1 text-[11px] bg-white border border-[#E5EADF] hover:border-[#7C8B5F] rounded-lg transition cursor-pointer"
                          >
                            View HTML
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Email Preview Drawer */}
            {previewEmail && (
              <div className="mt-4 p-4 border border-[#E5EADF] rounded-2xl bg-[#FAF6F1]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#3F4A32]">
                    Email Preview: {previewEmail.subject}
                  </span>
                  <button
                    onClick={() => setPreviewEmail(null)}
                    className="text-stone-400 hover:text-stone-700 text-xs"
                  >
                    Close Preview
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto bg-white p-4 rounded-xl border border-[#E5EADF]">
                  <iframe
                    title="Email Preview"
                    srcDoc={previewEmail.htmlBody}
                    className="w-full h-80 border-0"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-between items-center text-xs text-[#7C8B5F] font-body font-light">
              <span>Emails are recorded and delivered to Keven Sarbah's inbox.</span>
              <button
                onClick={() => setIsOutboxOpen(false)}
                className="px-4 py-1.5 bg-[#3F4A32] text-[#FAF6F1] rounded-xl text-xs cursor-pointer font-normal"
              >
                Close Outbox
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Understated Minimalist Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 flex items-center justify-between text-[11px] text-[#7C8B5F] border-t border-[#E5EADF]">
        <div className="tracking-widest uppercase font-light flex items-center gap-2">
          <span>© {new Date().getFullYear()} MERAKIFOS</span>
          <span className="w-1 h-1 rounded-full bg-[#D9A441]" />
          <span>STUDIO OPERATING SYSTEM</span>
        </div>
        <div>
          <span>Private Founder View • Keven Sarbah ({DEFAULT_OWNER_EMAIL})</span>
        </div>
      </footer>
      {projectWorkspaceId && (
        <ProjectWorkspace
          submissionId={projectWorkspaceId}
          onClose={() => setProjectWorkspaceId(null)}
        />
      )}
    </div>
  );
};
