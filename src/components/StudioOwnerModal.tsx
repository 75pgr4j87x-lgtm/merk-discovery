import React from 'react';
import { User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { createGoogleDocBrief } from '../services/googleDocs';
import { X, Table, Download, ExternalLink, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';

interface StudioOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onAuthChange: (u: User | null) => void;
}

interface SubmissionRecord {
  id: string;
  timestamp: string;
  approved: boolean;
  clientName: string;
  clientEmail: string;
  companyName: string;
  hasDomain: boolean;
  domainName: string;
  needDomainHelp: boolean;
  websiteStatus: string;
  primaryGoal: string;
  budgetTier: string;
  targetLaunchWindow: string;
  selectedColors?: string[];
  visualColors?: string;
  brief: string;
}

export const StudioOwnerModal: React.FC<StudioOwnerModalProps> = ({
  isOpen,
  onClose,
  user,
  onAuthChange,
}) => {
  const [submissions, setSubmissions] = React.useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [syncedDocUrl, setSyncedDocUrl] = React.useState<string | null>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/submissions');
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      fetchSubmissions();
    }
  }, [isOpen]);

  const handleCreateGoogleDoc = async (sub: SubmissionRecord) => {
    if (!user) {
      alert('Please connect your Google account to create the Google Doc in your Drive.');
      return;
    }
    setSyncingId(sub.id);
    try {
      const res = await createGoogleDocBrief({
        title: `MERAKIFOS • ${sub.companyName} Project Brief`,
        briefText: sub.brief,
      });
      setSyncedDocUrl(res.docUrl);
      window.open(res.docUrl, '_blank');
    } catch (err: any) {
      alert(err.message || 'Error creating Google Doc');
    } finally {
      setSyncingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white border border-stone-200 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[85vh] flex flex-col text-left">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-stone-400 hover:text-stone-900 p-1.5 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-stone-200 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-normal text-xs tracking-widest uppercase text-[#3F4A32]">
                MERAKIFOS
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-[#FAF6F1] text-[#7C8B5F] border border-[#7C8B5F]/30 font-body font-light uppercase tracking-wider">
                OWNER PORTAL
              </span>
            </div>
            <h2 className="text-xl font-heading font-normal text-[#3F4A32] mt-1">
              Client Responses & Drive Sync
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/api/submissions/csv"
              download
              className="px-3.5 py-1.5 border border-[#E5EADF] hover:border-[#7C8B5F] text-[#3F4A32] text-xs font-body font-light rounded-full transition flex items-center gap-1.5 cursor-pointer bg-white hover:bg-[#FAF6F1]"
            >
              <Download className="w-3.5 h-3.5 text-[#7C8B5F]" />
              <span>Download CSV</span>
            </a>

            <GoogleSignInButton user={user} onAuthChange={onAuthChange} />
          </div>
        </div>

        {/* Responses Table */}
        <div className="flex-1 overflow-y-auto my-4 border border-stone-200 rounded-2xl">
          {submissions.length === 0 ? (
            <div className="py-16 text-center text-xs text-stone-400 font-body font-light">
              {loading ? 'Loading submissions...' : 'No client responses submitted yet.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse font-body font-light">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-light uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Company & Client</th>
                  <th className="p-3">Domain Status</th>
                  <th className="p-3">Primary Goal</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-stone-50/60 transition">
                    <td className="p-3 text-stone-400 whitespace-nowrap font-body font-light">
                      {new Date(sub.timestamp).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-stone-900">
                      <div className="font-normal flex items-center gap-2">
                        <span>{sub.companyName}</span>
                        {sub.selectedColors && sub.selectedColors.length > 0 && (
                          <div className="flex items-center gap-1" title={`Palette: ${sub.selectedColors.join(', ')}`}>
                            {sub.selectedColors.map((hex, i) => (
                              <span
                                key={i}
                                className="w-2.5 h-2.5 rounded-full border border-black/20 shadow-2xs inline-block"
                                style={{ backgroundColor: hex }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400 font-light">
                        {sub.clientName} {sub.clientEmail ? `• ${sub.clientEmail}` : ''}
                      </div>
                    </td>
                    <td className="p-3 text-stone-600 font-light">
                      {sub.hasDomain ? (
                        <span className="text-[#3F4A32]">{sub.domainName || 'Owns domain'}</span>
                      ) : sub.needDomainHelp ? (
                        <span className="text-[#D9A441]">Requested Help</span>
                      ) : (
                        <span className="text-stone-400">Self purchase</span>
                      )}
                    </td>
                    <td className="p-3 capitalize font-light">{sub.primaryGoal}</td>
                    <td className="p-3">
                      {sub.approved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#3F4A32] font-light">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#7C8B5F]" /> Approved
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-400 font-light">Pending</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleCreateGoogleDoc(sub)}
                        disabled={syncingId === sub.id}
                        className="px-2.5 py-1 text-[11px] font-body font-light rounded border border-[#E5EADF] hover:border-[#7C8B5F] hover:text-[#7C8B5F] text-[#3F4A32] transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <FileText className="w-3 h-3" />
                        <span>{syncingId === sub.id ? 'Syncing...' : 'Export Doc'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="pt-2 flex items-center justify-between text-xs text-stone-400">
          <span>All client responses are automatically appended to your studio log.</span>
          <button
            onClick={fetchSubmissions}
            className="flex items-center gap-1 text-stone-600 hover:text-stone-900"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
};
