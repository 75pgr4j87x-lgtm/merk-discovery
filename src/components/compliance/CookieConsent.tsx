import React from 'react';
import { Shield, Cookie, Check, X, Sliders, ChevronDown, ChevronUp } from 'lucide-react';

export interface CookiePreferences {
  necessary: boolean; // Always true
  preferences: boolean; // Local storage of questionnaire draft
  analytics: boolean; // Performance telemetry
  timestamp: string;
}

const STORAGE_KEY = 'merakifos_cookie_consent';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = React.useState(false);
  const [showCustomize, setShowCustomize] = React.useState(false);
  const [preferences, setPreferences] = React.useState<CookiePreferences>({
    necessary: true,
    preferences: true,
    analytics: false,
    timestamp: '',
  });

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // Wait 800ms so it doesn't jarringly block the initial page paint
        const timer = setTimeout(() => setIsVisible(true), 800);
        return () => clearTimeout(timer);
      } else {
        const parsed = JSON.parse(stored);
        setPreferences(parsed);
      }
    } catch {
      // In case of storage access restrictions
      setIsVisible(true);
    }
  }, []);

  // Listen for custom trigger from footer "Cookie Settings"
  React.useEffect(() => {
    const handleReopen = () => {
      setIsVisible(true);
      setShowCustomize(true);
    };
    window.addEventListener('open_cookie_preferences', handleReopen);
    return () => window.removeEventListener('open_cookie_preferences', handleReopen);
  }, []);

  const saveConsent = (prefs: CookiePreferences) => {
    const toSave = { ...prefs, timestamp: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('Unable to persist cookie consent:', e);
    }
    setPreferences(toSave);
    setIsVisible(false);
    setShowCustomize(false);
  };

  const handleAcceptAll = () => {
    saveConsent({
      necessary: true,
      preferences: true,
      analytics: true,
      timestamp: new Date().toISOString(),
    });
  };

  const handleRejectNonEssential = () => {
    saveConsent({
      necessary: true,
      preferences: false,
      analytics: false,
      timestamp: new Date().toISOString(),
    });
  };

  const handleSaveCustom = () => {
    saveConsent(preferences);
  };

  if (!isVisible) return null;

  return (
    <aside
      role="region"
      aria-label="Cookie and Privacy Consent"
      className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-6 bg-gradient-to-t from-black/20 to-transparent pointer-events-none animate-fadeIn"
    >
      <div className="max-w-3xl mx-auto bg-white border border-[#E5EADF] rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl pointer-events-auto text-[#3F4A32]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6F1] border border-[#E5EADF] flex items-center justify-center text-[#7C8B5F] flex-shrink-0 mt-0.5">
              <Shield className="w-5 h-5 text-[#3F4A32]" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-medium text-[#3F4A32] flex items-center gap-2">
                <span>Privacy & Essential Storage Notice</span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FAF6F1] border border-[#E5EADF] text-[#4A5736] font-body">
                  GDPR & CCPA Compliant
                </span>
              </h2>
              <p className="text-xs text-[#4A5736] font-body font-light mt-1 max-w-xl leading-relaxed">
                We use strictly necessary storage to securely process your discovery answers and respect your privacy by design. Non-essential storage is disabled by default until you grant explicit consent.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setShowCustomize(!showCustomize)}
              className="px-3.5 py-2 text-xs font-body font-normal text-[#4A5736] hover:text-[#3F4A32] hover:bg-[#FAF6F1] rounded-xl transition flex items-center gap-1.5 border border-transparent hover:border-[#E5EADF] focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none"
              aria-expanded={showCustomize}
              aria-controls="cookie-customization-panel"
            >
              <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Customize</span>
              {showCustomize ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              onClick={handleRejectNonEssential}
              className="px-4 py-2 text-xs font-body font-normal text-[#3F4A32] bg-[#FAF6F1] hover:bg-[#F3EFE9] border border-[#E5EADF] rounded-xl transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
            >
              Essential Only
            </button>

            <button
              onClick={handleAcceptAll}
              className="px-4 py-2 text-xs font-body font-normal text-[#FAF6F1] bg-[#3F4A32] hover:bg-[#343D29] rounded-xl transition shadow-xs focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
            >
              Accept All
            </button>
          </div>
        </div>

        {/* Granular Customization Panel */}
        {showCustomize && (
          <div
            id="cookie-customization-panel"
            className="mt-5 pt-5 border-t border-[#E5EADF] space-y-3.5 animate-fadeIn"
          >
            <div className="text-xs font-heading font-normal text-[#3F4A32] uppercase tracking-wider">
              Storage Categories & Preferences
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Category 1: Strictly Necessary */}
              <div className="p-3.5 rounded-xl bg-[#FAF6F1] border border-[#E5EADF] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-[#3F4A32]">Strictly Necessary</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white text-[#4A5736] border border-[#E5EADF]">
                      Always Active
                    </span>
                  </div>
                  <p className="text-[11px] text-[#4A5736] leading-relaxed font-light">
                    Required for basic CSRF security, form transmission, and session encryption.
                  </p>
                </div>
              </div>

              {/* Category 2: Draft Preferences */}
              <div className="p-3.5 rounded-xl bg-white border border-[#E5EADF] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-[#3F4A32]">Draft Recovery</span>
                    <input
                      type="checkbox"
                      id="pref-storage-checkbox"
                      checked={preferences.preferences}
                      onChange={(e) =>
                        setPreferences({ ...preferences, preferences: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#3F4A32] rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3F4A32]"
                      aria-label="Allow saving questionnaire draft locally"
                    />
                  </div>
                  <label htmlFor="pref-storage-checkbox" className="text-[11px] text-[#4A5736] leading-relaxed font-light cursor-pointer">
                    Saves your answers in your browser so you do not lose progress if you refresh.
                  </label>
                </div>
              </div>

              {/* Category 3: Analytics */}
              <div className="p-3.5 rounded-xl bg-white border border-[#E5EADF] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-[#3F4A32]">Performance Insights</span>
                    <input
                      type="checkbox"
                      id="pref-analytics-checkbox"
                      checked={preferences.analytics}
                      onChange={(e) =>
                        setPreferences({ ...preferences, analytics: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#3F4A32] rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3F4A32]"
                      aria-label="Allow anonymous performance metrics"
                    />
                  </div>
                  <label htmlFor="pref-analytics-checkbox" className="text-[11px] text-[#4A5736] leading-relaxed font-light cursor-pointer">
                    Allows anonymous telemetry to optimize page load speeds and interface rendering.
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveCustom}
                className="px-4 py-2 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs font-body font-normal rounded-xl transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
