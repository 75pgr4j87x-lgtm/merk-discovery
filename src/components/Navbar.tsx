import React from 'react';
import { User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PRESET_TEMPLATES } from '../data/discoveryQuestions';
import { DiscoveryAnswers } from '../types/questionnaire';
import { Sparkles, Clock, FilePlus2, Compass } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  onAuthChange: (user: User | null) => void;
  onApplyPreset: (answers: DiscoveryAnswers) => void;
  onReset: () => void;
  currentStep: number;
  totalSteps: number;
  viewMode: 'questionnaire' | 'brief';
  onCreateFormQuick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onAuthChange,
  onApplyPreset,
  onReset,
  currentStep,
  totalSteps,
  viewMode,
  onCreateFormQuick,
}) => {
  const [showPresetsMenu, setShowPresetsMenu] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/80 dark:bg-stone-950/80 border-b border-stone-200/80 dark:border-stone-800/80 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2.5 text-left group transition cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-stone-900 dark:text-stone-50 group-hover:text-indigo-600 transition-colors">
                DiscoveryFlow
              </span>
              <span className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-md border border-indigo-200/50 dark:border-indigo-800/50">
                Workspace Sync
              </span>
            </div>
          </button>
        </div>

        {/* Center: Live Tracker or Mode info */}
        <div className="hidden md:flex items-center gap-2">
          {viewMode === 'questionnaire' ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-stone-100/80 dark:bg-stone-900/80 rounded-full border border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 dark:text-stone-400">
              <Clock className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
              <span>Step {currentStep + 1} of {totalSteps}</span>
              <span className="text-stone-300 dark:text-stone-700">•</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                {Math.max(1, Math.round((totalSteps - currentStep) * 0.4))} min left
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Project Brief Generated</span>
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Quick Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPresetsMenu(!showPresetsMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-900 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-lg transition border border-stone-200 dark:border-stone-800 cursor-pointer"
              title="Test-drive with realistic sample company data"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Load Sample</span>
            </button>

            {showPresetsMenu && (
              <div
                className="absolute right-0 mt-2 w-72 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl p-2 z-50 text-left animate-in fade-in zoom-in-95"
                onMouseLeave={() => setShowPresetsMenu(false)}
              >
                <div className="px-2.5 py-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  Select Quick Sample Profile
                </div>
                {PRESET_TEMPLATES.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      onApplyPreset(preset.answers);
                      setShowPresetsMenu(false);
                    }}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/80 transition flex flex-col cursor-pointer group"
                  >
                    <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 group-hover:text-indigo-600 transition-colors">
                      {preset.name}
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-1 mt-0.5">
                      {preset.tagline}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create Google Form Shortcut */}
          {onCreateFormQuick && (
            <button
              onClick={onCreateFormQuick}
              title="Generate a Google Form directly from this questionnaire"
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 rounded-lg transition cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Create Google Form</span>
            </button>
          )}

          {/* Google Sign In Component */}
          <GoogleSignInButton user={user} onAuthChange={onAuthChange} />
        </div>
      </div>
    </header>
  );
};
