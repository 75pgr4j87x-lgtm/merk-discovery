import React from 'react';
import { X, FileText, Scale, CheckCircle2, Shield } from 'lucide-react';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-of-service-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn"
    >
      <div className="bg-white border border-[#E5EADF] rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-[#3F4A32]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E5EADF] flex items-center justify-between bg-[#FAF6F1]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#E5EADF] flex items-center justify-center text-[#7C8B5F]">
              <Scale className="w-5 h-5 text-[#3F4A32]" aria-hidden="true" />
            </div>
            <div>
              <h2 id="terms-of-service-title" className="text-base font-heading font-normal text-[#3F4A32]">
                Terms of Service & Discovery Engagement
              </h2>
              <p className="text-[11px] text-[#4A5736] font-body font-light">
                Intellectual Property, Proposal Scope & Creative Provenance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Terms of Service"
            className="p-2 rounded-full text-[#7C8B5F] hover:text-[#3F4A32] hover:bg-[#FAF6F1] transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="px-6 py-6 overflow-y-auto space-y-6 text-xs text-[#374151] leading-relaxed font-body font-light">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#4A5736] block mb-1">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <p>
              Please read these Terms of Service carefully before utilizing the Merakifos digital discovery flow. By submitting your discovery responses and approving project briefs, you agree to the conditions established herein.
            </p>
          </div>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              1. Nature of Discovery Intake
            </h3>
            <p>
              This questionnaire serves as a preliminary architectural discovery process to synthesize project briefs, clarify brand aesthetic directions, and formulate estimated investment ranges. Completing or approving this brief does not constitute an executed contract for web development until a formal Master Services Agreement (MSA) or statement of work is countersigned.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              2. Intellectual Property & Ownership
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-[#4B5563]">
              <li>
                <strong>Client Materials:</strong> You retain sole and exclusive ownership of all logos, trademarks, proprietary text, trade secrets, and brand assets submitted through this interface.
              </li>
              <li>
                <strong>Studio Provenance:</strong> The underlying software, interface design, interactive discovery framework, and editorial brief generation system are the intellectual property of Merakifos Creative Studio.
              </li>
              <li>
                <strong>Code Provenance:</strong> Merakifos builds bespoke web presences with clean, original code architectures, strictly avoiding restricted copyleft licenses or unlicensed third-party assets.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              3. Confidentiality
            </h3>
            <p>
              All concepts, unreleased product launches, financial parameters, and business models submitted by the client are treated by Merakifos as confidential and privileged information. We do not disclose client plans to competitors or third parties.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              4. Accuracy of Estimates & Timeline
            </h3>
            <p>
              Any timeline targets or investment ranges displayed during discovery represent good-faith estimates based on client inputs. Final pricing and production milestones are finalized during official scoping sessions.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              5. Limitation of Liability
            </h3>
            <p>
              To the fullest extent permitted by applicable law, Merakifos shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from the use of this exploratory tool.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAF6F1] border-t border-[#E5EADF] flex justify-between items-center">
          <span className="text-[11px] text-[#4A5736] font-body">
            Merakifos Standard Operating Terms
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs uppercase tracking-wider font-normal rounded-xl transition cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
