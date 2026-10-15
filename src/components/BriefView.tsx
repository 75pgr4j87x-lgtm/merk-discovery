import React from 'react';
import confetti from 'canvas-confetti';
import { DiscoveryAnswers, GoogleDocResult, GoogleFormResult } from '../types/questionnaire';
import { createGoogleDocBrief } from '../services/googleDocs';
import { createGoogleDiscoveryForm } from '../services/googleForms';
import { ConfirmationModal } from './ConfirmationModal';
import {
  FileText,
  ExternalLink,
  Copy,
  Check,
  Edit3,
  ArrowLeft,
  Share2,
  Calendar,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Globe2,
} from 'lucide-react';

interface BriefViewProps {
  answers: DiscoveryAnswers;
  briefMarkdown: string;
  onEditAnswers: () => void;
  onUpdateBrief: (text: string) => void;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

export const BriefView: React.FC<BriefViewProps> = ({
  answers,
  briefMarkdown,
  onEditAnswers,
  onUpdateBrief,
  isAuthenticated,
  onRequireAuth,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedText, setEditedText] = React.useState(briefMarkdown);
  const [copied, setCopied] = React.useState(false);

  // Google Doc creation state
  const [isDocModalOpen, setIsDocModalOpen] = React.useState(false);
  const [isCreatingDoc, setIsCreatingDoc] = React.useState(false);
  const [docResult, setDocResult] = React.useState<GoogleDocResult | null>(null);
  const [docError, setDocError] = React.useState<string | null>(null);

  // Google Form creation state
  const [isFormModalOpen, setIsFormModalOpen] = React.useState(false);
  const [isCreatingForm, setIsCreatingForm] = React.useState(false);
  const [formResult, setFormResult] = React.useState<GoogleFormResult | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Fire celebratory confetti on mount
  React.useEffect(() => {
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4F46E5', '#3B82F6', '#10B981', '#F59E0B'],
    });
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(briefMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([briefMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(answers.companyName || 'website').toLowerCase().replace(/\s+/g, '-')}-project-brief.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveDocConfirm = async () => {
    try {
      setDocError(null);
      setIsCreatingDoc(true);

      const title = `${answers.companyName || 'Client'} - Website Project Brief`;
      const res = await createGoogleDocBrief({
        title,
        briefText: briefMarkdown,
      });

      setDocResult({
        documentId: res.documentId,
        docUrl: res.docUrl,
        title: res.title,
        createdAt: new Date().toLocaleTimeString(),
      });
      setIsDocModalOpen(false);

      // Trigger mini confetti
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    } catch (err: any) {
      console.error('Failed to create doc:', err);
      setDocError(err.message || 'Error creating Google Document');
    } finally {
      setIsCreatingDoc(false);
    }
  };

  const handleSaveFormConfirm = async () => {
    try {
      setFormError(null);
      setIsCreatingForm(true);

      const title = `${answers.companyName || 'Client'} - Discovery Call Intake`;
      const res = await createGoogleDiscoveryForm(title);

      setFormResult({
        formId: res.formId,
        responderUri: res.responderUri,
        editUri: res.editUri,
        title: res.title,
        createdAt: new Date().toLocaleTimeString(),
      });
      setIsFormModalOpen(false);

      // Trigger mini confetti
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    } catch (err: any) {
      console.error('Failed to create form:', err);
      setFormError(err.message || 'Error creating Google Form');
    } finally {
      setIsCreatingForm(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 text-left space-y-6">
      {/* Top Banner & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onEditAnswers}
            className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 transition cursor-pointer mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Modify Discovery Answers</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight flex items-center gap-2.5">
            <span>Website Project Brief</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              Ready for Discovery Call
            </span>
          </h1>
          <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
            Prepared for <strong className="text-stone-800 dark:text-stone-200">{answers.companyName || 'New Client'}</strong> • Ready to sync with Google Workspace
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/80 transition cursor-pointer shadow-2xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied Brief' : 'Copy Text'}</span>
          </button>

          <button
            onClick={handleDownloadMd}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/80 transition cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .MD</span>
          </button>

          {/* Create Google Form Button */}
          <button
            onClick={() => {
              if (!isAuthenticated) {
                onRequireAuth();
              } else {
                setIsFormModalOpen(true);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
            <span>Create Google Form</span>
          </button>

          {/* Primary Action: Export to Google Doc */}
          <button
            onClick={() => {
              if (!isAuthenticated) {
                onRequireAuth();
              } else {
                setIsDocModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Export to Google Doc</span>
          </button>
        </div>
      </div>

      {/* Google Doc Success Card */}
      {docResult && (
        <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Google Doc Created in Drive
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                {docResult.title}
              </h4>
            </div>
          </div>

          <a
            href={docResult.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
          >
            <span>Open in Google Docs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Google Form Success Card */}
      {formResult && (
        <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  Google Form Created in Drive
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                {formResult.title}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={formResult.responderUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              <span>Share Form Link</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={formResult.editUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-stone-800 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 text-xs font-medium rounded-xl hover:bg-purple-50 transition"
            >
              <span>Edit Form</span>
            </a>
          </div>
        </div>
      )}

      {/* Quick Discovery KPI Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-stone-100/70 dark:bg-stone-900/70 rounded-2xl border border-stone-200/80 dark:border-stone-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Primary Goal
          </span>
          <span className="text-xs font-bold text-stone-900 dark:text-stone-100 capitalize block mt-1 truncate">
            {answers.primaryGoal}
          </span>
        </div>
        <div className="p-3.5 bg-stone-100/70 dark:bg-stone-900/70 rounded-2xl border border-stone-200/80 dark:border-stone-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Audience Focus
          </span>
          <span className="text-xs font-bold text-stone-900 dark:text-stone-100 capitalize block mt-1 truncate">
            {answers.targetAudience.replace('_', ' ')}
          </span>
        </div>
        <div className="p-3.5 bg-stone-100/70 dark:bg-stone-900/70 rounded-2xl border border-stone-200/80 dark:border-stone-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Budget Tier
          </span>
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 capitalize block mt-1 truncate">
            {answers.budgetTier} bracket
          </span>
        </div>
        <div className="p-3.5 bg-stone-100/70 dark:bg-stone-900/70 rounded-2xl border border-stone-200/80 dark:border-stone-800/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Launch Window
          </span>
          <span className="text-xs font-bold text-stone-900 dark:text-stone-100 capitalize block mt-1 truncate">
            {answers.targetLaunchWindow.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Main Document Preview Container */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 rounded-3xl p-6 sm:p-10 shadow-lg relative">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Generated Brief Document
            </span>
          </div>

          <button
            onClick={() => {
              if (isEditing) {
                onUpdateBrief(editedText);
              }
              setIsEditing(!isEditing);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Done Editing' : 'Edit Brief'}</span>
          </button>
        </div>

        {isEditing ? (
          <div>
            <textarea
              rows={24}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full font-mono text-xs sm:text-sm p-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditedText(briefMarkdown);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUpdateBrief(editedText);
                  setIsEditing(false);
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none text-stone-800 dark:text-stone-200 font-sans leading-relaxed text-sm whitespace-pre-wrap">
            {briefMarkdown}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Google Doc Creation (Workspace Destructive/Mutation Guard) */}
      <ConfirmationModal
        isOpen={isDocModalOpen}
        title="Save Project Brief to Google Docs"
        description="This will create a new, beautifully formatted document in your personal Google Drive containing this synthesized discovery brief."
        targetDetails={{
          type: 'Google Doc',
          fileName: `${answers.companyName || 'Client'} - Website Project Brief`,
          destination: 'Your Google Drive root folder',
        }}
        confirmLabel="Create Document"
        isLoading={isCreatingDoc}
        onConfirm={handleSaveDocConfirm}
        onCancel={() => setIsDocModalOpen(false)}
      />

      {/* Confirmation Modal for Google Form Creation */}
      <ConfirmationModal
        isOpen={isFormModalOpen}
        title="Generate Google Discovery Form"
        description="This will create a live Google Form in your personal Google Drive containing all 10 discovery questionnaire items, ready to send to clients."
        targetDetails={{
          type: 'Google Form',
          fileName: `${answers.companyName || 'Client'} - Discovery Call Intake`,
          destination: 'Your Google Drive root folder',
        }}
        confirmLabel="Create Form"
        isLoading={isCreatingForm}
        onConfirm={handleSaveFormConfirm}
        onCancel={() => setIsFormModalOpen(false)}
      />

      {docError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{docError}</span>
        </div>
      )}

      {formError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}
    </div>
  );
};
