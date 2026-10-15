import React from 'react';
import { X, Trash2, CheckCircle2, AlertCircle, ShieldAlert, Lock } from 'lucide-react';
import { sanitizeEmail, sanitizePlainText } from '../../utils/sanitizer';

interface DataDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export const DataDeletionModal: React.FC<DataDeletionModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
}) => {
  const [emailInput, setEmailInput] = React.useState(defaultEmail);
  const [reason, setReason] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (defaultEmail) {
      setEmailInput(defaultEmail);
    }
  }, [defaultEmail]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { isValid, email: cleanEmail } = sanitizeEmail(emailInput);
    if (!isValid) {
      setStatus('error');
      setMessage('Please enter a valid email address associated with your discovery submission.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/gdpr/delete-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail: cleanEmail,
          reason: sanitizePlainText(reason, 300),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
        setMessage(
          `Your data deletion request has been fulfilled. ${data.deletedCount} matching record(s) and associated spreadsheet rows have been permanently erased from active Merakifos records in accordance with GDPR Article 17.`
        );
      } else {
        setStatus('error');
        setMessage(data.message || 'No matching active records found for this email address.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error connecting to deletion service. Please reach out to kelvensarbah@gmail.com directly.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdpr-deletion-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn"
    >
      <div className="bg-white border border-[#E5EADF] rounded-3xl max-w-lg w-full flex flex-col shadow-2xl overflow-hidden text-[#3F4A32]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E5EADF] flex items-center justify-between bg-[#FAF6F1]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Trash2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="gdpr-deletion-title" className="text-base font-heading font-normal text-[#3F4A32]">
                Right to be Forgotten (Data Deletion)
              </h2>
              <p className="text-[11px] text-[#4A5736] font-body font-light">
                GDPR Article 17 & CCPA Deletion Compliance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Data Deletion Form"
            className="p-2 rounded-full text-[#7C8B5F] hover:text-[#3F4A32] hover:bg-[#FAF6F1] transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {status === 'success' ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-heading font-normal text-[#3F4A32]">
                Data Erasure Completed
              </h3>
              <p className="text-xs text-[#4A5736] leading-relaxed font-body font-light max-w-sm mx-auto">
                {message}
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs uppercase tracking-wider font-normal rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-[#4B5563] leading-relaxed font-body font-light">
                Under European GDPR (Art. 17) and California CCPA regulations, you have the legal right to request the permanent erasure of any discovery questionnaire answers, contact info, and draft records submitted to Merakifos.
              </p>

              <div>
                <label
                  htmlFor="deletion-email-input"
                  className="block text-[11px] uppercase tracking-wider text-[#4A5736] font-medium mb-1.5"
                >
                  Associated Client Email *
                </label>
                <input
                  id="deletion-email-input"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="your.email@company.com"
                  required
                  className="w-full px-4 py-2.5 bg-[#FAF6F1] border border-[#E5EADF] focus:border-[#3F4A32] rounded-xl text-xs text-[#3F4A32] outline-none transition font-body font-light"
                />
              </div>

              <div>
                <label
                  htmlFor="deletion-reason-input"
                  className="block text-[11px] uppercase tracking-wider text-[#4A5736] font-medium mb-1.5"
                >
                  Optional Reason / Notes
                </label>
                <textarea
                  id="deletion-reason-input"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Project canceled or testing the flow"
                  className="w-full px-4 py-2.5 bg-[#FAF6F1] border border-[#E5EADF] focus:border-[#3F4A32] rounded-xl text-xs text-[#3F4A32] outline-none transition font-body font-light resize-none"
                />
              </div>

              {status === 'error' && (
                <div
                  role="alert"
                  className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-body font-light flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{message}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-body font-light text-[#4A5736] hover:text-[#3F4A32] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs uppercase tracking-wider font-normal rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{status === 'loading' ? 'Processing...' : 'Permanently Delete My Data'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
