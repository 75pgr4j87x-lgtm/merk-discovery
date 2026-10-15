import React from 'react';
import { X, ShieldCheck, Mail, Lock, FileText, CheckCircle2 } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn"
    >
      <div className="bg-white border border-[#E5EADF] rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-[#3F4A32]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#E5EADF] flex items-center justify-between bg-[#FAF6F1]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#E5EADF] flex items-center justify-center text-[#7C8B5F]">
              <ShieldCheck className="w-5 h-5 text-[#3F4A32]" aria-hidden="true" />
            </div>
            <div>
              <h2 id="privacy-policy-title" className="text-base font-heading font-normal text-[#3F4A32]">
                Privacy Notice & Data Protection Policy
              </h2>
              <p className="text-[11px] text-[#4A5736] font-body font-light">
                GDPR (EU/UK) & CCPA/CPRA (California) Compliance Framework
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Privacy Policy"
            className="p-2 rounded-full text-[#7C8B5F] hover:text-[#3F4A32] hover:bg-[#FAF6F1] transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="px-6 py-6 overflow-y-auto space-y-6 text-xs text-[#374151] leading-relaxed font-body font-light">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#4A5736] block mb-1">
              Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <p>
              Merakifos Creative Studio (&quot;Merakifos&quot;, &quot;we&quot;, &quot;us&quot;) is committed to protecting your personal information and respecting your privacy by design. This policy outlines how we collect, process, store, and safeguard your data during our digital discovery and design intake process.
            </p>
          </div>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              1. Data Controller
            </h3>
            <p>
              The data controller responsible for your personal data is <strong>Merakifos Creative Studio</strong> (Founder & Executive Principal: Keven Sarbah). Inquiries regarding privacy compliance can be directed to <a href="mailto:kelvensarbah@gmail.com" className="text-[#3F4A32] underline hover:text-[#7C8B5F]">kelvensarbah@gmail.com</a>.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              2. Data Minimization & Categories Collected
            </h3>
            <p className="mb-2">
              In accordance with the principle of data minimization (GDPR Art. 5(1)(c)), we collect only the exact data points strictly required to formulate your website architecture and creative proposal:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[#4B5563]">
              <li><strong>Contact Identifiers:</strong> Client name and professional email address.</li>
              <li><strong>Brand & Business Parameters:</strong> Company name, existing domain status, industry objectives, target audience, and aesthetic preferences.</li>
              <li><strong>Project Parameters:</strong> Preferred launch timeline, investment bracket, and palette selections.</li>
            </ul>
            <p className="mt-2 text-[#4A5736]">
              We do <strong>not</strong> collect or process sensitive categories of personal data (e.g. biometric data, medical information, racial or ethnic origin, or credit card numbers) through this discovery flow.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              3. Legal Basis for Processing (GDPR Article 6)
            </h3>
            <p>
              We process your personal data under the following lawful bases:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[#4B5563] mt-1">
              <li><strong>Contract Preparation (Art. 6(1)(b)):</strong> Processing is necessary to formulate preliminary project briefs, timelines, and commercial estimates at your explicit request prior to entering into a formal agreement.</li>
              <li><strong>Consent (Art. 6(1)(a)):</strong> When you opt-in to save drafts in your browser or receive digital copies of your approved brief via email.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              4. Data Retention & The &quot;Right to be Forgotten&quot; (GDPR Art. 17)
            </h3>
            <p>
              Intake submissions are retained only for the duration of active project discovery and collaboration (up to 12 months for commercial records). You retain the absolute legal right to request the complete deletion of your records (&quot;Right to Erasure&quot; / CCPA Deletion Request) at any time through our automated in-app deletion tool or by emailing us.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              5. CCPA &quot;Do Not Sell My Personal Information&quot; Notice
            </h3>
            <p>
              Merakifos does <strong>not sell, rent, or trade</strong> your personal information to any third parties or data brokers.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-[#3F4A32] mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
              6. Technical & Organizational Security Measures (OWASP Compliance)
            </h3>
            <p>
              Our application adheres to OWASP Top 10 security standards, incorporating strict transport layer security (HTTPS), input sanitization to eliminate Cross-Site Scripting (XSS) and CSV injection, role-based backend authorization, and isolated database access rules.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAF6F1] border-t border-[#E5EADF] flex justify-between items-center">
          <span className="text-[11px] text-[#4A5736] font-body">
            Official Merakifos Compliance Document
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs uppercase tracking-wider font-normal rounded-xl transition cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
