import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DiscoveryAnswers } from '../types/questionnaire';
import { ArrowLeft, Check, Download, CheckCircle2, Volume2, VolumeX, Edit3, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { exportBriefAsPdf } from '../utils/pdfGenerator';
import { cleanBriefDocument } from '../services/briefGenerator';
import { soundTrack } from '../utils/soundtrack';
import { ColorPalettePicker } from './ColorPalettePicker';
import { PrivacyPolicyModal } from './compliance/PrivacyPolicyModal';
import { TermsOfServiceModal } from './compliance/TermsOfServiceModal';
import { DataDeletionModal } from './compliance/DataDeletionModal';

interface MerakifosDiscoveryProps {
  answers: DiscoveryAnswers;
  onChange: React.Dispatch<React.SetStateAction<DiscoveryAnswers>>;
  onCompleteAndSynthesize: (latestAnswers?: DiscoveryAnswers) => Promise<string>;
  onSaveToSpreadsheet: (
    answers: DiscoveryAnswers,
    brief: string,
    approved: boolean,
    submissionId?: string
  ) => Promise<{ success: boolean; id?: string } | void>;
}

// Intake Step Sequence: Brand Identity first, then the 8 context questions, then Review
type QuestionStepId =
  | 'q0_brand_identity'
  | 'q1_business_client'
  | 'q2_brand_vibe'
  | 'q3_visual_colors'
  | 'q4_existing_assets'
  | 'q5_core_objectives'
  | 'q6_inspiration_sites'
  | 'q7_success_outcome'
  | 'q8_timing_budget'
  | 'review_approval';

// Option definitions for multi-selects and compounds
const Q2_OPTIONS = [
  'This is pure luxury and exclusivity.',
  'It feels warm, grounded, and deeply personal.',
  'Sleek, modern, and effortless to navigate.',
  'Romantic, artistic, and cinematic.',
  'Bold, fun, and brimming with personality.',
];

const Q4_OPTIONS = [
  'I have an official logo I love and want to keep',
  'I have professional photos or videos ready to showcase',
  'I have written out my service packages and \'About\' story',
  'I have glowing reviews and quotes from past clients',
  'Honestly? Almost nothing yet. I’d love Merakifos to build the look from scratch',
];

const Q5_OPTIONS = [
  'Showing off the work: A stunning, visual gallery that does justice to what I actually create',
  'Stop the email ping-pong: Letting clients book discovery calls straight into my calendar',
  'Pre-qualifying leads: A short, custom inquiry form so I know their budget and date before we chat',
  'Getting paid seamlessly: Letting clients pay deposits, retainers, or packages online',
  'A private client home: A clean space where booked clients can view their timeline, files, or checklist',
  'Fast connection: Letting visitors message me directly via WhatsApp or Instagram in one tap',
];

const TIMELINE_PRESETS = [
  'As soon as humanly possible (next 4–6 weeks)',
  'In the next 2 to 3 months',
  'I’m flexible / quality-driven—let’s take the time to build it right',
];

const BUDGET_PRESETS = [
  'Less than $1000',
  '$1,000 – $3,000',
  '$3,000 – $6,000',
  '$6000 - $12,000',
  '$12,000+',
];

export const MerakifosDiscovery: React.FC<MerakifosDiscoveryProps> = ({
  answers,
  onChange,
  onCompleteAndSynthesize,
  onSaveToSpreadsheet,
}) => {
  const [currentStep, setCurrentStep] = React.useState<QuestionStepId>('q0_brand_identity');
  const [history, setHistory] = React.useState<QuestionStepId[]>(['q0_brand_identity']);
  const [isSynthesizing, setIsSynthesizing] = React.useState(false);
  const [synthesizedBrief, setSynthesizedBrief] = React.useState<string>('');
  const [isApproved, setIsApproved] = React.useState(false);
  const [approvedTimestamp, setApprovedTimestamp] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAudioMuted, setIsAudioMuted] = React.useState(soundTrack.getIsMuted());

  // Client Brief Editing State
  const [isEditingBrief, setIsEditingBrief] = React.useState(false);
  const [editedBriefText, setEditedBriefText] = React.useState('');
  const [originalBriefText, setOriginalBriefText] = React.useState('');
  const [isBriefModified, setIsBriefModified] = React.useState(false);
  const [saveNotification, setSaveNotification] = React.useState<string | null>(null);
  const [currentSubmissionId, setCurrentSubmissionId] = React.useState<string | undefined>(undefined);

  // Regulatory Compliance & Privacy Modals State (GDPR / CCPA)
  const [isPrivacyOpen, setIsPrivacyOpen] = React.useState(false);
  const [isTermsOpen, setIsTermsOpen] = React.useState(false);
  const [isDataDeletionOpen, setIsDataDeletionOpen] = React.useState(false);

  // Initialize and manage calm ambient meditative soundtrack
  React.useEffect(() => {
    soundTrack.initAutoPlayOnFirstInteraction();
  }, []);

  React.useEffect(() => {
    if (currentStep === 'review_approval') {
      // Flow completed: smoothly fade out the background soundtrack
      soundTrack.stopAmbientMusic(3.0);
    } else {
      if (!soundTrack.getIsMuted()) {
        soundTrack.startAmbientMusic();
      }
    }
  }, [currentStep]);

  const toggleAudio = () => {
    const nextMuted = soundTrack.toggleMute();
    setIsAudioMuted(nextMuted);
    if (!nextMuted) {
      soundTrack.playSoftDrop(1.2);
    }
  };

  // Local state for rock-solid input & selection (nothing preselected by default)
  const [brandNameInput, setBrandNameInput] = React.useState(answers.companyName || '');
  const [clientNameInput, setClientNameInput] = React.useState(answers.clientName || '');
  const [clientEmailInput, setClientEmailInput] = React.useState(answers.clientEmail || '');

  const [q1Text, setQ1Text] = React.useState(answers.businessAndClient || answers.businessSummary || '');
  const [q2Selected, setQ2Selected] = React.useState<string[]>(answers.brandVibe || []);
  const [q3Text, setQ3Text] = React.useState(answers.visualColors || '');
  const [q3Colors, setQ3Colors] = React.useState<string[]>(answers.selectedColors || []);
  const [q4Selected, setQ4Selected] = React.useState<string[]>(answers.existingAssets || []);
  const [q5Selected, setQ5Selected] = React.useState<string[]>(answers.coreObjectives || []);
  const [q6Text, setQ6Text] = React.useState(answers.inspirationSites || answers.admirationUrls || '');
  const [q7Text, setQ7Text] = React.useState(answers.successOutcome || answers.successMetric || '');

  const [selectedTimeline, setSelectedTimeline] = React.useState<string>(answers.timelineSelection || '');
  const [customTimelineText, setCustomTimelineText] = React.useState<string>(answers.customTimeline || '');
  const [selectedBudget, setSelectedBudget] = React.useState<string>(answers.budgetSelection || '');
  const [customBudgetText, setCustomBudgetText] = React.useState<string>(answers.customBudget || '');

  // Synchronize when external presets or answers change
  React.useEffect(() => {
    if (answers.companyName) setBrandNameInput(answers.companyName);
    if (answers.clientName) setClientNameInput(answers.clientName);
    if (answers.clientEmail) setClientEmailInput(answers.clientEmail);
    if (answers.businessAndClient) setQ1Text(answers.businessAndClient);
    if (answers.brandVibe) setQ2Selected(answers.brandVibe);
    if (answers.visualColors) setQ3Text(answers.visualColors);
    if (answers.selectedColors) setQ3Colors(answers.selectedColors);
    if (answers.existingAssets) setQ4Selected(answers.existingAssets);
    if (answers.coreObjectives) setQ5Selected(answers.coreObjectives);
    if (answers.inspirationSites) setQ6Text(answers.inspirationSites);
    if (answers.successOutcome) setQ7Text(answers.successOutcome);
    if (answers.timelineSelection) setSelectedTimeline(answers.timelineSelection);
    if (answers.customTimeline) setCustomTimelineText(answers.customTimeline);
    if (answers.budgetSelection) setSelectedBudget(answers.budgetSelection);
    if (answers.customBudget) setCustomBudgetText(answers.customBudget);
  }, [answers]);

  const update = <K extends keyof DiscoveryAnswers>(key: K, val: DiscoveryAnswers[K]) => {
    onChange((prev) => ({ ...prev, [key]: val }));
  };

  const updateMultiple = (partial: Partial<DiscoveryAnswers>) => {
    onChange((prev) => ({ ...prev, ...partial }));
  };

  // Step numbering calculation
  const getStepNumber = (): { current: number; total: number } => {
    const total = 9;
    switch (currentStep) {
      case 'q0_brand_identity':
        return { current: 1, total };
      case 'q1_business_client':
        return { current: 2, total };
      case 'q2_brand_vibe':
        return { current: 3, total };
      case 'q3_visual_colors':
        return { current: 4, total };
      case 'q4_existing_assets':
        return { current: 5, total };
      case 'q5_core_objectives':
        return { current: 6, total };
      case 'q6_inspiration_sites':
        return { current: 7, total };
      case 'q7_success_outcome':
        return { current: 8, total };
      case 'q8_timing_budget':
        return { current: 9, total };
      case 'review_approval':
        return { current: 9, total };
      default:
        return { current: 1, total };
    }
  };

  const { current: stepNum, total: totalSteps } = getStepNumber();

  // Navigation handlers
  const goTo = (next: QuestionStepId) => {
    setHistory((prev) => [...prev, next]);
    setCurrentStep(next);
  };

  const goBack = () => {
    soundTrack.playSoftDrop(0.9);
    if (history.length > 1) {
      const nextHistory = [...history];
      nextHistory.pop();
      const prev = nextHistory[nextHistory.length - 1];
      setHistory(nextHistory);
      setCurrentStep(prev);
    }
  };

  // Keyboard shortcut listener for Enter
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (currentStep === 'q0_brand_identity' && brandNameInput.trim()) {
          handleQ0Submit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, brandNameInput, clientNameInput, clientEmailInput]);

  // Step 0: Brand or Company Name Submit
  const handleQ0Submit = () => {
    if (!brandNameInput.trim()) return;
    soundTrack.playSoftDrop(1.15);
    updateMultiple({
      companyName: brandNameInput.trim(),
      clientName: clientNameInput.trim() || answers.clientName || 'Partner',
      clientEmail: clientEmailInput.trim() || answers.clientEmail || '',
    });
    goTo('q1_business_client');
  };

  // Step 1 Submit
  const handleQ1Submit = () => {
    if (!q1Text.trim()) return;
    soundTrack.playSoftDrop(1.15);
    updateMultiple({
      businessAndClient: q1Text.trim(),
      businessSummary: q1Text.trim(),
      companyName: brandNameInput.trim() || answers.companyName || 'Brand',
      clientName: clientNameInput.trim() || answers.clientName || 'Partner',
      clientEmail: clientEmailInput.trim() || answers.clientEmail || '',
    });
    goTo('q2_brand_vibe');
  };

  // Step 2: Multi-select checkbox (up to 3)
  const toggleQ2Vibe = (option: string) => {
    soundTrack.playSoftDrop(1.0);
    setQ2Selected((prev) => {
      let updated: string[];
      if (prev.includes(option)) {
        updated = prev.filter((item) => item !== option);
      } else {
        if (prev.length >= 3) {
          // Max 3
          return prev;
        }
        updated = [...prev, option];
      }
      onChange((prevAnswers) => ({
        ...prevAnswers,
        brandVibe: updated,
      }));
      return updated;
    });
  };

  const handleQ2Submit = () => {
    if (q2Selected.length === 0) return;
    soundTrack.playSoftDrop(1.15);
    update('brandVibe', q2Selected);
    goTo('q3_visual_colors');
  };

  // Step 3 (Question 4 in flow): Colors & Visual Taste
  const handleColorsChange = (colors: string[]) => {
    setQ3Colors(colors);
    const note = q3Text.trim();
    const formatted = colors.length > 0
      ? `Palette: ${colors.join(', ')}${note ? `. Note: ${note}` : ''}`
      : note;
    updateMultiple({
      selectedColors: colors,
      visualColors: formatted,
    });
  };

  const handleQ3Submit = () => {
    if (q3Colors.length === 0) return;
    soundTrack.playSoftDrop(1.15);
    const note = q3Text.trim();
    const formatted = q3Colors.length > 0
      ? `Palette: ${q3Colors.join(', ')}${note ? `. Note: ${note}` : ''}`
      : note;
    updateMultiple({
      selectedColors: q3Colors,
      visualColors: formatted,
    });
    goTo('q4_existing_assets');
  };

  // Step 4: Multi-select checkbox
  const toggleQ4Asset = (option: string) => {
    soundTrack.playSoftDrop(1.0);
    setQ4Selected((prev) => {
      const updated = prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option];

      onChange((prevAnswers) => ({
        ...prevAnswers,
        existingAssets: updated,
      }));
      return updated;
    });
  };

  const handleQ4Submit = () => {
    soundTrack.playSoftDrop(1.15);
    update('existingAssets', q4Selected);
    goTo('q5_core_objectives');
  };

  // Step 5: Multi-select checkbox
  const toggleQ5Objective = (option: string) => {
    soundTrack.playSoftDrop(1.0);
    setQ5Selected((prev) => {
      const updated = prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option];

      onChange((prevAnswers) => ({
        ...prevAnswers,
        coreObjectives: updated,
      }));
      return updated;
    });
  };

  const handleQ5Submit = () => {
    soundTrack.playSoftDrop(1.15);
    update('coreObjectives', q5Selected);
    goTo('q6_inspiration_sites');
  };

  // Step 6 Submit
  const handleQ6Submit = () => {
    soundTrack.playSoftDrop(1.15);
    update('inspirationSites', q6Text.trim());
    goTo('q7_success_outcome');
  };

  // Step 7 Submit
  const handleQ7Submit = () => {
    soundTrack.playSoftDrop(1.15);
    update('successOutcome', q7Text.trim());
    goTo('q8_timing_budget');
  };

  // Step 8 Finish & Synthesize
  const handleQ8Finish = async () => {
    soundTrack.playSoftDrop(1.25);
    const finalAnswers: DiscoveryAnswers = {
      ...answers,
      companyName: brandNameInput.trim() || answers.companyName || 'Brand',
      clientName: clientNameInput.trim() || answers.clientName || 'Partner',
      clientEmail: clientEmailInput.trim() || answers.clientEmail || '',
      businessAndClient: q1Text.trim() || answers.businessAndClient,
      businessSummary: q1Text.trim() || answers.businessSummary,
      brandVibe: q2Selected.length > 0 ? q2Selected : answers.brandVibe,
      selectedColors: q3Colors.length > 0 ? q3Colors : answers.selectedColors,
      visualColors: q3Colors.length > 0
        ? `Palette: ${q3Colors.join(', ')}${q3Text.trim() ? `. Note: ${q3Text.trim()}` : ''}`
        : (q3Text.trim() || answers.visualColors),
      existingAssets: q4Selected.length > 0 ? q4Selected : answers.existingAssets,
      coreObjectives: q5Selected.length > 0 ? q5Selected : answers.coreObjectives,
      inspirationSites: q6Text.trim() || answers.inspirationSites,
      successOutcome: q7Text.trim() || answers.successOutcome,
      timelineSelection: selectedTimeline.trim() || answers.timelineSelection,
      customTimeline: customTimelineText.trim() || answers.customTimeline,
      budgetSelection: selectedBudget.trim() || answers.budgetSelection,
      customBudget: customBudgetText.trim() || answers.customBudget,
    };

    updateMultiple(finalAnswers);

    goTo('review_approval');
    setIsSynthesizing(true);
    try {
      const generated = await onCompleteAndSynthesize(finalAnswers);
      const cleaned = cleanBriefDocument(generated, finalAnswers.companyName || 'Brand');
      setSynthesizedBrief(cleaned);
      setEditedBriefText(cleaned);
      setOriginalBriefText(cleaned);
      setIsBriefModified(false);
      const res = await onSaveToSpreadsheet(finalAnswers, cleaned, false, currentSubmissionId);
      if (res && typeof res === 'object' && 'id' in res && res.id) {
        setCurrentSubmissionId(res.id);
      }
    } catch (e) {
      console.error('Failed to synthesize:', e);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Brief Edit Handlers
  const handleStartEdit = () => {
    setEditedBriefText(synthesizedBrief);
    setIsEditingBrief(true);
    soundTrack.playSoftDrop(1.05);
  };

  const handleSaveEdit = async () => {
    const trimmed = editedBriefText.trim();
    setSynthesizedBrief(trimmed);
    const isMod = trimmed !== originalBriefText;
    setIsBriefModified(isMod);
    setIsEditingBrief(false);
    setSaveNotification('Your changes have been saved to the brief');
    soundTrack.playSoftDrop(1.15);

    // Save draft update to spreadsheet / database
    try {
      const res = await onSaveToSpreadsheet(answers, trimmed, false, currentSubmissionId);
      if (res && typeof res === 'object' && 'id' in res && res.id) {
        setCurrentSubmissionId(res.id);
      }
    } catch (_) {}

    setTimeout(() => setSaveNotification(null), 4000);
  };

  const handleCancelEdit = () => {
    setEditedBriefText(synthesizedBrief);
    setIsEditingBrief(false);
    soundTrack.playSoftDrop(0.95);
  };

  const handleResetOriginal = () => {
    setEditedBriefText(originalBriefText);
    setSynthesizedBrief(originalBriefText);
    setIsBriefModified(false);
    setIsEditingBrief(false);
    setSaveNotification('Reset to original draft');
    soundTrack.playSoftDrop(1.0);
    setTimeout(() => setSaveNotification(null), 3000);
  };

  // Approval: Finalizes the edited brief and sends it to the studio founder
  const handleApprove = async () => {
    setIsSaving(true);
    const timeStr = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    setIsApproved(true);
    setApprovedTimestamp(timeStr);
    setIsEditingBrief(false);
    soundTrack.playSoftDrop(1.25);

    try {
      const brandName = brandNameInput.trim() || answers.companyName || 'Brand';
      const briefToFinalize = isEditingBrief ? editedBriefText.trim() : synthesizedBrief;
      const cleaned = cleanBriefDocument(briefToFinalize, brandName);
      setSynthesizedBrief(cleaned);
      const res = await onSaveToSpreadsheet(answers, cleaned, true, currentSubmissionId);
      if (res && typeof res === 'object' && 'id' in res && res.id) {
        setCurrentSubmissionId(res.id);
      }
    } catch (e) {
      console.warn('Saved locally');
    } finally {
      setIsSaving(false);
    }

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#7C8B5F', '#3F4A32', '#D9A441', '#FAF6F1', '#B8C5A0'],
    });
  };

  // PDF Export
  const handleDownloadPdf = () => {
    const brandName = brandNameInput.trim() || answers.companyName || 'Brand';
    const cleaned = cleanBriefDocument(synthesizedBrief, brandName);
    exportBriefAsPdf(answers, cleaned, approvedTimestamp || undefined);
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1] text-[#3F4A32] flex flex-col justify-between selection:bg-[#7C8B5F]/20 font-sans antialiased relative">
      {/* WCAG 2.1 AA Compliant Skip Link */}
      <a
        href="#main-discovery-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-[#3F4A32] focus:text-[#FAF6F1] focus:rounded-xl focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#D9A441] text-xs uppercase tracking-wider font-medium"
      >
        Skip to main content
      </a>

      {/* Brand Header */}
      <header role="banner" className="w-full max-w-3xl mx-auto px-6 pt-10 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-heading font-normal text-xs tracking-[0.28em] uppercase text-[#3F4A32]">
            MERAKIFOS
          </span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D9A441]" aria-hidden="true" />
          <span className="text-[11px] tracking-widest text-[#4A5736] uppercase font-body font-light">
            LET'S TALK
          </span>
        </div>

        <div className="flex items-center gap-3.5">
          {/* Subtle Ambient Sound Toggle */}
          <button
            onClick={toggleAudio}
            type="button"
            aria-label={isAudioMuted ? 'Unmute calm meditative ambient music' : 'Mute calm meditative ambient music'}
            className="flex items-center gap-1.5 text-[11px] font-body font-light text-[#4A5736] hover:text-[#3F4A32] transition cursor-pointer px-2.5 py-1 rounded-full hover:bg-white/80 border border-[#E5EADF]/80 shadow-2xs select-none focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none"
          >
            {isAudioMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 opacity-60" aria-hidden="true" />
                <span className="hidden sm:inline">Music Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-[#4A5736]" aria-hidden="true" />
                <span className="hidden sm:inline">Calm soundtrack</span>
              </>
            )}
          </button>

          {currentStep !== 'review_approval' && (
            <div className="text-[11px] tracking-widest text-[#4A5736] font-body font-light">
              <span className="text-[#3F4A32] font-normal">{String(stepNum).padStart(2, '0')}</span> / {String(totalSteps).padStart(2, '0')}
            </div>
          )}
        </div>
      </header>

      {/* Progress Bar with WCAG ARIA Role */}
      {currentStep !== 'review_approval' && (
        <div className="w-full max-w-3xl mx-auto px-6 mb-10">
          <div
            role="progressbar"
            aria-valuenow={Math.round((stepNum / totalSteps) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Discovery Questionnaire Progress"
            className="w-full h-[2px] bg-[#E5EADF] overflow-hidden rounded-full"
          >
            <motion.div
              className="h-full bg-[#3F4A32]"
              initial={{ width: 0 }}
              animate={{ width: `${(stepNum / totalSteps) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Main Focus Area - One Question at a Time */}
      <main id="main-discovery-content" role="main" className="flex-1 w-full max-w-2xl mx-auto px-6 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {/* QUESTION 0: BRAND OR COMPANY NAME (VERY FIRST QUESTION) */}
          {currentStep === 'q0_brand_identity' && (
            <motion.div
              key="q0_brand_identity"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              {/* Intro Copy Banner */}
              <div className="p-4.5 rounded-2xl bg-white border border-[#E5EADF] shadow-2xs space-y-1">
                <span className="text-[10px] tracking-widest uppercase text-[#7C8B5F] font-body font-medium">
                  A Little Context Before We Talk
                </span>
                <p className="text-xs text-[#7C8B5F] font-body font-light leading-relaxed">
                  Grab a cup of coffee. This takes about two minutes, and it helps us dive straight into bringing your vision to life.
                </p>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  What is the name of your brand or company?
                </h1>
                <p className="text-sm text-[#7C8B5F] mt-2 font-body font-light">
                  The name people know you by, or the project you're getting ready to introduce to the world.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <input
                    type="text"
                    autoFocus
                    required
                    value={brandNameInput}
                    onChange={(e) => setBrandNameInput(e.target.value)}
                    placeholder="e.g., Studio McGee, Aura Botanica, PrismFlow"
                    className="w-full pb-3 pt-1 text-lg sm:text-xl font-body font-light text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition"
                  />
                </div>

                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#7C8B5F] mb-1 font-body font-light">
                      Your name (optional)
                    </label>
                    <input
                      type="text"
                      value={clientNameInput}
                      onChange={(e) => setClientNameInput(e.target.value)}
                      placeholder="e.g., Sarah Jenkins"
                      className="w-full pb-2 pt-1 text-xs text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition font-body font-light"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#7C8B5F] mb-1 font-body font-light">
                      Your email (optional)
                    </label>
                    <input
                      type="email"
                      value={clientEmailInput}
                      onChange={(e) => setClientEmailInput(e.target.value)}
                      placeholder="e.g., hello@yourbrand.com"
                      className="w-full pb-2 pt-1 text-xs text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition font-body font-light"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex items-center justify-between">
                <span className="text-[11px] text-[#7C8B5F]/70 tracking-wider font-body font-light">
                  Press Enter ↵ to continue
                </span>
                <button
                  onClick={handleQ0Submit}
                  disabled={!brandNameInput.trim()}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition disabled:opacity-30 cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 1: businessAndClient */}
          {currentStep === 'q1_business_client' && (
            <motion.div
              key="q1_business_client"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  In your own words, what do you do, and who is your favorite kind of client to work with?
                </h1>
                <p className="text-sm sm:text-base text-[#7C8B5F] mt-2 font-body font-light">
                  Just tell us like you were explaining it to a friend over lunch.
                </p>
              </div>

              <div className="space-y-4">
                <textarea
                  rows={1}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  autoFocus
                  required
                  value={q1Text}
                  onChange={(e) => {
                    setQ1Text(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder="e.g., I design intimate coastal weddings for couples who care deeply about good food, candid moments, and zero stress."
                  className="w-full pb-2 pt-1 text-lg sm:text-xl font-body font-light text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition resize-none leading-relaxed overflow-hidden block"
                />
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ1Submit}
                  disabled={!q1Text.trim()}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition disabled:opacity-30 cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 2: brandVibe (Multi-select up to 3) */}
          {currentStep === 'q2_brand_vibe' && (
            <motion.div
              key="q2_brand_vibe"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] tracking-widest text-[#7C8B5F] uppercase font-body font-light">
                    Multi-select ({q2Selected.length}/3 selected)
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  When someone lands on your new site or app, what’s the feeling you want them to get in the first five seconds?
                </h1>
                <p className="text-sm text-[#7C8B5F] mt-2 font-body font-light">
                  Pick the 2 or 3 words that hit home for you.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {Q2_OPTIONS.map((opt) => {
                  const isChecked = q2Selected.includes(opt);
                  const isAtLimit = !isChecked && q2Selected.length >= 3;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={isAtLimit}
                      onClick={() => toggleQ2Vibe(opt)}
                      className={`w-full p-4.5 rounded-2xl border transition-all text-left flex items-center justify-between cursor-pointer group font-body select-none ${
                        isChecked
                          ? 'border-[#7C8B5F] bg-white shadow-xs ring-1 ring-[#7C8B5F]/30'
                          : isAtLimit
                          ? 'border-[#E5EADF]/60 bg-[#FAF6F1]/50 opacity-40 cursor-not-allowed'
                          : 'border-[#E5EADF] hover:border-[#7C8B5F]/60 hover:bg-white/60 bg-[#FAF6F1]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 pr-2">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition shrink-0 ${
                            isChecked
                              ? 'bg-[#7C8B5F] text-[#FAF6F1]'
                              : 'border border-[#CCD6C0] bg-transparent group-hover:border-[#7C8B5F]'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </div>
                        <span
                          className={`text-sm block font-body transition ${
                            isChecked ? 'font-medium text-[#3F4A32]' : 'font-normal text-[#3F4A32]'
                          }`}
                        >
                          {opt}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ2Submit}
                  disabled={q2Selected.length === 0}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition disabled:opacity-30 cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 4 (q3_visual_colors): Brand Shades & Palette */}
          {currentStep === 'q3_visual_colors' && (
            <motion.div
              key="q3_visual_colors"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-7 text-left"
            >
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] tracking-widest text-[#7C8B5F] uppercase font-body font-light">
                    Color Palette (Choose 1 to 3 shades)
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  Let's talk colors and visual taste. What shades feel like "you," and are there any you can't stand?
                </h1>
                <p className="text-sm sm:text-base text-[#7C8B5F] mt-2 font-body font-light">
                  Choose at least 1 color (and up to 3) for your brand's core palette. You can pick from our curated studio tones, enter a custom hex, or open the color wheel.
                </p>
              </div>

              {/* Color Palette Picker with 1 to 3 slots */}
              <ColorPalettePicker
                selectedColors={q3Colors}
                onChange={handleColorsChange}
                minColors={1}
                maxColors={3}
              />

              {/* Optional Nuances, Shades to avoid, or Inspiration links */}
              <div className="pt-2 space-y-1.5">
                <label className="text-xs font-medium text-[#3F4A32] block font-body">
                  Additional color notes, shades you can't stand, or moodboard links (Optional)
                </label>
                <textarea
                  rows={1}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  value={q3Text}
                  onChange={(e) => {
                    setQ3Text(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                    const note = e.target.value.trim();
                    const formatted = q3Colors.length > 0
                      ? `Palette: ${q3Colors.join(', ')}${note ? `. Note: ${note}` : ''}`
                      : note;
                    update('visualColors', formatted);
                  }}
                  placeholder="e.g., Avoid harsh neons or neon lime. Love brushed brass, natural linen, or paste a Pinterest board link."
                  className="w-full pb-1 pt-0.5 text-base sm:text-lg font-body font-light text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition resize-none leading-normal overflow-hidden block"
                />
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ3Submit}
                  disabled={q3Colors.length < 1}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40 flex items-center gap-2"
                >
                  <span>Continue</span>
                  {q3Colors.length >= 1 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 4: existingAssets (Multi-select) */}
          {currentStep === 'q4_existing_assets' && (
            <motion.div
              key="q4_existing_assets"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] tracking-widest text-[#7C8B5F] uppercase font-body font-light">
                    Multiple Choice (Choose all that apply)
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  What visual pieces do you already have in your toolkit?
                </h1>
                <p className="text-sm text-[#7C8B5F] mt-2 font-body font-light">
                  Be completely honest. There’s zero judgment whether you have a full hard drive or a blank slate.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {Q4_OPTIONS.map((opt) => {
                  const isChecked = q4Selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleQ4Asset(opt)}
                      className={`w-full p-4.5 rounded-2xl border transition-all text-left flex items-center justify-between cursor-pointer group font-body select-none ${
                        isChecked
                          ? 'border-[#7C8B5F] bg-white shadow-xs ring-1 ring-[#7C8B5F]/30'
                          : 'border-[#E5EADF] hover:border-[#7C8B5F]/60 hover:bg-white/60 bg-[#FAF6F1]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 pr-2">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition shrink-0 ${
                            isChecked
                              ? 'bg-[#7C8B5F] text-[#FAF6F1]'
                              : 'border border-[#CCD6C0] bg-transparent group-hover:border-[#7C8B5F]'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </div>
                        <span
                          className={`text-sm block font-body transition ${
                            isChecked ? 'font-medium text-[#3F4A32]' : 'font-normal text-[#3F4A32]'
                          }`}
                        >
                          {opt}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ4Submit}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 5: coreObjectives (Multi-select) */}
          {currentStep === 'q5_core_objectives' && (
            <motion.div
              key="q5_core_objectives"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] tracking-widest text-[#7C8B5F] uppercase font-body font-light">
                    Multiple Choice
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  If this new platform could take one big headache off your plate every week, what would it handle?
                </h1>
                <p className="text-sm text-[#7C8B5F] mt-2 font-body font-light">
                  Think about the repetitive things you spend too much time doing manually right now.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {Q5_OPTIONS.map((opt) => {
                  const isChecked = q5Selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleQ5Objective(opt)}
                      className={`w-full p-4.5 rounded-2xl border transition-all text-left flex items-start justify-between cursor-pointer group font-body select-none ${
                        isChecked
                          ? 'border-[#7C8B5F] bg-white shadow-xs ring-1 ring-[#7C8B5F]/30'
                          : 'border-[#E5EADF] hover:border-[#7C8B5F]/60 hover:bg-white/60 bg-[#FAF6F1]'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 pr-2">
                        <div
                          className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center transition shrink-0 ${
                            isChecked
                              ? 'bg-[#7C8B5F] text-[#FAF6F1]'
                              : 'border border-[#CCD6C0] bg-transparent group-hover:border-[#7C8B5F]'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </div>
                        <span
                          className={`text-sm block font-body transition leading-relaxed ${
                            isChecked ? 'font-medium text-[#3F4A32]' : 'font-normal text-[#3F4A32]'
                          }`}
                        >
                          {opt}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ5Submit}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 6: inspirationSites */}
          {currentStep === 'q6_inspiration_sites' && (
            <motion.div
              key="q6_inspiration_sites"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  Is there a website or app you secretly admire?
                </h1>
                <p className="text-sm sm:text-base text-[#7C8B5F] mt-2 font-body font-light">
                  Inside or outside your industry—whose vibe or seamless flow makes you think, "I wish mine felt like this"?
                </p>
              </div>

              <div>
                <textarea
                  rows={1}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  autoFocus
                  value={q6Text}
                  onChange={(e) => {
                    setQ6Text(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder="e.g., studio-mcgee.com for the editorial aesthetic, or airbnb for how easy it is to book."
                  className="w-full pb-2 pt-1 text-lg sm:text-xl font-body font-light text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition resize-none leading-relaxed overflow-hidden block"
                />
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ6Submit}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 7: successOutcome */}
          {currentStep === 'q7_success_outcome' && (
            <motion.div
              key="q7_success_outcome"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  Fast forward six months after launch. What would make you say, "Hiring Merakifos was the best decision I made this year"?
                </h1>
              </div>

              <div>
                <textarea
                  rows={1}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  autoFocus
                  value={q7Text}
                  onChange={(e) => {
                    setQ7Text(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder="e.g., Booking clients at double my current rate without having to justify my prices on calls."
                  className="w-full pb-2 pt-1 text-lg sm:text-xl font-body font-light text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition resize-none leading-relaxed overflow-hidden block"
                />
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ7Submit}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* QUESTION 8: timingAndBudget (Compound Field: Radio/Preset + Optional Custom Input) */}
          {currentStep === 'q8_timing_budget' && (
            <motion.div
              key="q8_timing_budget"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="space-y-8 text-left"
            >
              <div>
                <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] leading-snug">
                  Lastly, let’s talk timing and budget.
                </h1>
                <p className="text-sm text-[#7C8B5F] mt-2 font-body font-light">
                  There are no wrong answers here—this just helps us propose creative solutions that genuinely fit your real-world comfort zone without wasting your time.
                </p>
              </div>

              {/* Sub-question A: Timing */}
              <div className="space-y-3.5 p-5 rounded-2xl bg-white border border-[#E5EADF] shadow-2xs">
                <span className="text-xs font-medium text-[#3F4A32] block font-body">
                  When would you love to see this live and out in the world?
                </span>

                <div className="space-y-2">
                  {TIMELINE_PRESETS.map((tOpt) => (
                    <button
                      key={tOpt}
                      type="button"
                      onClick={() => {
                        setSelectedTimeline(tOpt);
                        update('timelineSelection', tOpt);
                        soundTrack.playSoftDrop(1.05);
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer font-body text-xs ${
                        selectedTimeline === tOpt
                          ? 'border-[#7C8B5F] bg-[#FAF6F1] text-[#3F4A32] font-medium shadow-2xs ring-1 ring-[#7C8B5F]/30'
                          : 'border-[#E5EADF] text-[#3F4A32] hover:border-[#7C8B5F]/50 bg-white'
                      }`}
                    >
                      <span>{tOpt}</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          selectedTimeline === tOpt
                            ? 'border-[#7C8B5F] bg-[#7C8B5F]'
                            : 'border-[#CCD6C0]'
                        }`}
                      >
                        {selectedTimeline === tOpt && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="pt-1">
                  <input
                    type="text"
                    value={customTimelineText}
                    onChange={(e) => {
                      setCustomTimelineText(e.target.value);
                      update('customTimeline', e.target.value);
                    }}
                    placeholder="Or tell us your ideal date: e.g., Before bridal season kicks off in April"
                    className="w-full pb-2 pt-1 text-xs text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition font-body font-light"
                  />
                </div>
              </div>

              {/* Sub-question B: Budget */}
              <div className="space-y-3.5 p-5 rounded-2xl bg-white border border-[#E5EADF] shadow-2xs">
                <span className="text-xs font-medium text-[#3F4A32] block font-body">
                  What investment range feels comfortable for this project?
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BUDGET_PRESETS.map((bOpt) => (
                    <button
                      key={bOpt}
                      type="button"
                      onClick={() => {
                        setSelectedBudget(bOpt);
                        update('budgetSelection', bOpt);
                        soundTrack.playSoftDrop(1.05);
                      }}
                      className={`p-3 rounded-xl border text-center transition cursor-pointer font-body text-xs ${
                        selectedBudget === bOpt
                          ? 'border-[#7C8B5F] bg-[#3F4A32] text-[#FAF6F1] font-medium shadow-2xs'
                          : 'border-[#E5EADF] text-[#3F4A32] hover:border-[#7C8B5F]/50 bg-white font-light'
                      }`}
                    >
                      {bOpt}
                    </button>
                  ))}
                </div>

                <div className="pt-1">
                  <input
                    type="text"
                    value={customBudgetText}
                    onChange={(e) => {
                      setCustomBudgetText(e.target.value);
                      update('customBudget', e.target.value);
                    }}
                    placeholder="Or share your specific budget / ballpark: e.g., We have a firm budget of around $8,500"
                    className="w-full pb-2 pt-1 text-xs text-[#3F4A32] placeholder:text-[#3F4A32]/35 border-b border-[#E5EADF] focus:border-[#7C8B5F] outline-none bg-transparent transition font-body font-light"
                  />
                </div>
              </div>

              <div className="pt-6 flex items-center justify-between">
                <button
                  onClick={goBack}
                  className="text-xs text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1.5 transition cursor-pointer font-body font-light"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleQ8Finish}
                  className="px-6 py-2.5 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition cursor-pointer shadow-xs border border-transparent hover:border-[#7C8B5F]/40"
                >
                  Review Project Summary
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP: CLIENT REVIEW & APPROVAL SCREEN */}
          {currentStep === 'review_approval' && (
            <motion.div
              key="review_approval"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 text-left py-4"
            >
              {/* Header Title: Quietly confident, not salesy */}
              <div className="border-b border-[#E5EADF] pb-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] tracking-widest uppercase text-[#7C8B5F] font-body font-light block">
                      MERAKIFOS • SUMMARY
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-tight text-[#3F4A32] mt-1">
                      Here's what we heard.
                    </h1>
                  </div>

                  {isApproved && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#7C8B5F]/40 rounded-full text-xs font-body font-normal text-[#3F4A32] shadow-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#7C8B5F]" />
                      <span>Approved — let's make this happen</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-[#7C8B5F] mt-2 font-body font-light">
                  Take a quiet look through. If this feels right, you can approve it and download a copy for yourself.
                </p>
              </div>

              {isSynthesizing ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-7 h-7 border-2 border-[#7C8B5F] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-[#7C8B5F] font-body font-light tracking-wide">
                    Putting your project summary together...
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* One-Page Document Card with Warm Sage Green Top Accent */}
                  <div className="p-8 sm:p-12 rounded-2xl border-t-2 border-t-[#7C8B5F] border-x border-b border-[#E5EADF] bg-white shadow-xs text-left">
                    {/* Document Letterhead Header */}
                    <div className="border-b border-[#E5EADF] pb-6 mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-normal text-xs tracking-[0.25em] uppercase text-[#3F4A32]">
                            MERAKIFOS
                          </span>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
                          <span className="text-[11px] tracking-wider text-[#7C8B5F] uppercase font-body font-light">
                            PROJECT BLUEPRINT
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-heading font-normal text-[#3F4A32] mt-2 tracking-tight">
                          Website Project Summary & Blueprint
                        </h2>
                      </div>

                      <div className="flex flex-col sm:items-end gap-2">
                        <div className="text-left sm:text-right font-body font-light text-xs text-[#7C8B5F] space-y-0.5">
                          <div>
                            <strong className="font-medium text-[#3F4A32]">Client:</strong>{' '}
                            {brandNameInput.trim() || answers.companyName || 'Brand'}
                          </div>
                          <div>
                            <strong className="font-medium text-[#3F4A32]">Date:</strong>{' '}
                            {new Date().toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </div>
                          {answers.selectedColors && answers.selectedColors.length > 0 && (
                            <div className="flex items-center gap-1.5 pt-0.5 justify-start sm:justify-end">
                              <span className="text-[11px] font-medium text-[#3F4A32]">Palette:</span>
                              <div className="flex items-center gap-1">
                                {answers.selectedColors.map((hex, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono border border-black/10 bg-[#FAF6F1]"
                                    title={hex}
                                  >
                                    <span
                                      className="w-2.5 h-2.5 rounded-full border border-black/20 shadow-2xs"
                                      style={{ backgroundColor: hex }}
                                    />
                                    <span>{hex}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {!isApproved && (
                          <div className="flex items-center gap-2 pt-1">
                            {isBriefModified && !isEditingBrief && (
                              <span className="text-[10px] uppercase tracking-wider font-body font-normal text-[#7C8B5F] bg-[#7C8B5F]/10 border border-[#7C8B5F]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <Check className="w-3 h-3 text-[#7C8B5F]" />
                                <span>Customized by you</span>
                              </span>
                            )}

                            {!isEditingBrief ? (
                              <button
                                onClick={handleStartEdit}
                                type="button"
                                className="flex items-center gap-1.5 text-xs font-body font-normal text-[#3F4A32] bg-[#FAF6F1] hover:bg-stone-100 border border-[#E5EADF] px-3.5 py-1.5 rounded-full transition cursor-pointer shadow-2xs hover:border-[#7C8B5F]/40"
                                title="Edit the brief wording and sections"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[#7C8B5F]" />
                                <span>Edit Brief</span>
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* EDIT MODE: Dedicated Client Document Editor */}
                    {isEditingBrief ? (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-[#FAF6F1] border border-[#E5EADF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-body">
                          <div className="flex items-start sm:items-center gap-2 text-[#3F4A32]/90">
                            <Edit3 className="w-4 h-4 text-[#7C8B5F] shrink-0 mt-0.5 sm:mt-0" />
                            <span className="font-light">
                              Feel free to edit any statements, refine goals, or add personal notes before approving.
                            </span>
                          </div>

                          {originalBriefText && originalBriefText !== editedBriefText && (
                            <button
                              type="button"
                              onClick={handleResetOriginal}
                              className="text-[11px] text-[#7C8B5F] hover:text-[#3F4A32] flex items-center gap-1 underline underline-offset-2 shrink-0 cursor-pointer font-light"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset to initial draft</span>
                            </button>
                          )}
                        </div>

                        <div className="relative">
                          <textarea
                            value={editedBriefText}
                            onChange={(e) => setEditedBriefText(e.target.value)}
                            rows={16}
                            className="w-full p-4 sm:p-6 rounded-xl border border-[#7C8B5F]/40 focus:border-[#3F4A32] focus:ring-1 focus:ring-[#3F4A32]/20 outline-none font-body font-light text-xs sm:text-sm text-[#3F4A32] leading-relaxed bg-[#FAF6F1]/50 resize-y shadow-inner"
                            placeholder="Edit your project summary details here..."
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <span className="text-[11px] text-[#7C8B5F] font-light">
                            * Your saved edits will be delivered directly to the Merakifos team upon approval and included in your PDF.
                          </span>

                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-4 py-2 rounded-full border border-stone-200 text-xs text-[#7C8B5F] hover:text-[#3F4A32] hover:bg-stone-50 transition cursor-pointer font-light"
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="px-5 py-2 rounded-full bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs font-normal transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-[#7C8B5F]" />
                              <span>Save Changes</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Saved Toast Notification */}
                        {saveNotification && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3 mb-4 rounded-xl bg-emerald-50/90 border border-emerald-200/80 text-emerald-900 text-xs flex items-center justify-between gap-2 shadow-2xs"
                          >
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="font-light">{saveNotification}</span>
                            </div>
                            <span className="text-[11px] text-emerald-700/80 font-light">Ready to approve</span>
                          </motion.div>
                        )}

                        {/* Document Body: Clean, publication-grade sections */}
                        <div className="text-xs sm:text-sm leading-relaxed text-[#3F4A32] font-body font-light space-y-7">
                          {synthesizedBrief ? (
                            cleanBriefDocument(synthesizedBrief, brandNameInput.trim() || answers.companyName || 'Brand')
                              .split('\n\n')
                              .map((paragraph, pIdx) => {
                                const trimmed = paragraph.trim();
                                if (!trimmed || /^[-*_~=]{2,}$/.test(trimmed)) return null;

                                const isHeading =
                                  trimmed.startsWith('1.') ||
                                  trimmed.startsWith('2.') ||
                                  trimmed.startsWith('3.') ||
                                  trimmed.startsWith('4.') ||
                                  trimmed.startsWith('5.') ||
                                  trimmed.startsWith('#');

                                const renderInline = (str: string) => {
                                  const cleanStr = str.replace(/\*\*\*/g, '').replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');
                                  const parts = cleanStr.split(/(\*\*.*?\*\*|__.*?__)/g);
                                  return parts.map((part, i) => {
                                    if (
                                      (part.startsWith('**') && part.endsWith('**')) ||
                                      (part.startsWith('__') && part.endsWith('__'))
                                    ) {
                                      return (
                                        <strong key={i} className="font-medium text-[#3F4A32]">
                                          {part.slice(2, -2)}
                                        </strong>
                                      );
                                    }
                                    return <span key={i}>{part}</span>;
                                  });
                                };

                                if (isHeading) {
                                  const [headingTitle, ...restLines] = trimmed.split('\n');
                                  const cleanHeading = headingTitle.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();

                                  return (
                                    <div key={pIdx} className="space-y-3 pt-3 first:pt-0">
                                      <h3 className="font-heading font-normal text-xs sm:text-sm tracking-wide text-[#3F4A32] uppercase flex items-center gap-2.5">
                                        <span className="inline-block w-1.5 h-3.5 bg-[#7C8B5F] rounded-full" />
                                        <span>{cleanHeading}</span>
                                      </h3>
                                      {restLines.length > 0 && (
                                        <div className="text-[#3F4A32]/95 pl-4 space-y-2 font-body font-light leading-relaxed">
                                          {restLines.map((line, lIdx) => {
                                            const lineTrim = line.trim();
                                            if (!lineTrim || /^[-*_~=]{2,}$/.test(lineTrim)) return null;

                                            const isBullet =
                                              lineTrim.startsWith('•') ||
                                              lineTrim.startsWith('-') ||
                                              lineTrim.startsWith('*');
                                            const cleanLineText = lineTrim.replace(/^[•\-\*]\s*/, '').trim();

                                            if (isBullet) {
                                              return (
                                                <div key={lIdx} className="flex items-start gap-2.5 pl-0.5 py-0.5">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C8B5F] mt-2 shrink-0" />
                                                  <span className="leading-relaxed flex-1">
                                                    {renderInline(cleanLineText)}
                                                  </span>
                                                </div>
                                              );
                                            }

                                            return (
                                              <p key={lIdx} className="leading-relaxed">
                                                {renderInline(lineTrim)}
                                              </p>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                return (
                                  <p key={pIdx} className="text-[#3F4A32]/95 whitespace-pre-wrap leading-relaxed font-body font-light">
                                    {renderInline(trimmed)}
                                  </p>
                                );
                              })
                          ) : (
                            <p className="text-[#7C8B5F] italic font-body font-light">Putting together your summary...</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Document Sign-off / Approval Section (Low pressure, reassuring) */}
                    <div className="mt-10 pt-6 border-t border-[#E5EADF] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-body font-light text-[#7C8B5F]">
                      <div>
                        {isApproved ? (
                          <div className="flex items-center gap-2 text-[#3F4A32] font-medium">
                            <CheckCircle2 className="w-4 h-4 text-[#7C8B5F]" />
                            <span>
                              Approved by {brandNameInput.trim() || answers.companyName || 'Brand'} on {approvedTimestamp}
                            </span>
                          </div>
                        ) : (
                          <span>
                            A small, low risk way to start • Your accounts stay yours.
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#7C8B5F] font-body font-light tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441]" />
                        <span>MERAKIFOS • LOOK LIKE YOU</span>
                      </div>
                    </div>
                  </div>

                  {/* Client Action Bar */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-[#7C8B5F] font-body font-light">
                      {isApproved ? (
                        <span className="text-[#3F4A32] flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-[#7C8B5F]" />
                          <span>Your approved summary has been saved and a copy delivered to the Merakifos Studio team.</span>
                        </span>
                      ) : isEditingBrief ? (
                        'You are currently editing your brief. Click "Save Changes" when ready.'
                      ) : isBriefModified ? (
                        'Your customized changes are saved. Click "Approve Project Summary" to send the final brief.'
                      ) : (
                        'Review this summary. You can edit any details or approve when ready.'
                      )}
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      {!isApproved ? (
                        <>
                          {!isEditingBrief ? (
                            <>
                              <button
                                onClick={handleStartEdit}
                                type="button"
                                className="w-full sm:w-auto px-5 py-3 bg-[#FAF6F1] hover:bg-stone-100 text-[#3F4A32] text-xs tracking-wider uppercase font-body font-normal rounded-full transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs border border-[#E5EADF] hover:border-[#7C8B5F]/40"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[#7C8B5F]" />
                                <span>Edit Brief</span>
                              </button>

                              <button
                                onClick={handleApprove}
                                disabled={isSaving}
                                className="w-full sm:w-auto px-7 py-3 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 border border-transparent hover:border-[#7C8B5F]/50"
                              >
                                <Check className="w-3.5 h-3.5 text-[#7C8B5F]" />
                                <span>
                                  {isSaving ? 'Submitting...' : 'Approve & Send to Studio'}
                                </span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={handleCancelEdit}
                                type="button"
                                className="w-full sm:w-auto px-5 py-3 border border-stone-200 text-[#7C8B5F] hover:text-[#3F4A32] text-xs tracking-wider uppercase font-body font-normal rounded-full transition cursor-pointer"
                              >
                                Cancel Edit
                              </button>

                              <button
                                onClick={handleSaveEdit}
                                type="button"
                                className="w-full sm:w-auto px-6 py-3 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5 text-[#7C8B5F]" />
                                <span>Save Changes</span>
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2.5 w-full sm:w-auto">
                          <button
                            onClick={handleStartEdit}
                            type="button"
                            className="w-full sm:w-auto px-5 py-3 bg-[#FAF6F1] hover:bg-stone-100 text-[#3F4A32] text-xs tracking-wider uppercase font-body font-normal rounded-full transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs border border-[#E5EADF] hover:border-[#7C8B5F]/40"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#7C8B5F]" />
                            <span>Revise Brief</span>
                          </button>

                          <button
                            onClick={handleDownloadPdf}
                            className="w-full sm:w-auto px-7 py-3 bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs tracking-wider uppercase font-body font-normal rounded-full transition flex items-center justify-center gap-2.5 cursor-pointer shadow-xs border border-[#7C8B5F]/40 hover:border-[#7C8B5F]"
                          >
                            <Download className="w-3.5 h-3.5 text-[#7C8B5F]" />
                            <span>Download PDF Copy</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Accessible, Compliance-Grade Footer (WCAG 2.1 AA / GDPR / CCPA) */}
      <footer role="contentinfo" className="w-full max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#4A5736] font-body font-light">
        <div className="tracking-widest uppercase flex items-center gap-2">
          <span>© {new Date().getFullYear()} MERAKIFOS</span>
          <span className="w-1 h-1 rounded-full bg-[#D9A441]" aria-hidden="true" />
          <span>LOOK LIKE YOU</span>
        </div>
        <nav aria-label="Legal & Privacy Compliance Navigation" className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            onClick={() => setIsPrivacyOpen(true)}
            className="hover:text-[#3F4A32] underline hover:no-underline transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
          >
            Privacy Notice
          </button>
          <span className="text-[#E5EADF]" aria-hidden="true">•</span>
          <button
            onClick={() => setIsTermsOpen(true)}
            className="hover:text-[#3F4A32] underline hover:no-underline transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
          >
            Terms of Service
          </button>
          <span className="text-[#E5EADF]" aria-hidden="true">•</span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_cookie_preferences'))}
            className="hover:text-[#3F4A32] underline hover:no-underline transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
          >
            Cookie Preferences
          </button>
          <span className="text-[#E5EADF]" aria-hidden="true">•</span>
          <button
            onClick={() => setIsDataDeletionOpen(true)}
            className="hover:text-rose-700 underline hover:no-underline transition focus-visible:ring-2 focus-visible:ring-[#3F4A32] focus-visible:outline-none cursor-pointer"
            title="Request permanent erasure of your discovery data under GDPR Article 17"
          >
            Data Rights (GDPR)
          </button>
        </nav>
      </footer>

      {/* Compliance & Regulatory Modals */}
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <TermsOfServiceModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <DataDeletionModal
        isOpen={isDataDeletionOpen}
        onClose={() => setIsDataDeletionOpen(false)}
        defaultEmail={answers.clientEmail}
      />
    </div>
  );
};
