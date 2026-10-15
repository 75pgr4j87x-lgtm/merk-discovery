import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DiscoveryAnswers } from '../types/questionnaire';
import {
  Globe,
  Briefcase,
  Users,
  Palette,
  Layers,
  Calendar,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  Target,
  ShoppingBag,
  Award,
  CalendarCheck,
  Layout,
  Smartphone,
  Monitor,
  Flame,
  CheckCircle2,
  Code2,
  ShieldCheck,
  MessageSquare,
  Sparkle,
} from 'lucide-react';

interface QuestionnaireFlowProps {
  answers: DiscoveryAnswers;
  onChange: (updated: DiscoveryAnswers) => void;
  onSubmit: () => void;
  isGenerating?: boolean;
}

const STAGES = [
  { id: 'brand', title: 'Brand & Context', icon: Globe, time: '30s' },
  { id: 'purpose', title: 'Goals & Primary KPI', icon: Target, time: '30s' },
  { id: 'audience', title: 'Audience & UX', icon: Users, time: '25s' },
  { id: 'aesthetic', title: 'Aesthetic & Vibe', icon: Palette, time: '30s' },
  { id: 'features', title: 'Features & Stack', icon: Layers, time: '30s' },
  { id: 'timeline', title: 'Scope & Investment', icon: Calendar, time: '25s' },
];

export const QuestionnaireFlow: React.FC<QuestionnaireFlowProps> = ({
  answers,
  onChange,
  onSubmit,
  isGenerating = false,
}) => {
  const [currentStage, setCurrentStage] = React.useState(0);

  const update = <K extends keyof DiscoveryAnswers>(key: K, value: DiscoveryAnswers[K]) => {
    onChange({ ...answers, [key]: value });
  };

  const toggleArrayItem = (key: 'keyActions' | 'visualKeywords' | 'selectedFeatures' | 'thirdPartyIntegrations', item: string) => {
    const list = answers[key] || [];
    if (list.includes(item)) {
      update(key, list.filter((i) => i !== item));
    } else {
      update(key, [...list, item]);
    }
  };

  const handleNext = () => {
    if (currentStage < STAGES.length - 1) {
      setCurrentStage((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onSubmit();
    }
  };

  const handlePrev = () => {
    if (currentStage > 0) {
      setCurrentStage((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Keyboard navigation listener (Enter to proceed)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStage, answers]);

  const progressPct = Math.round(((currentStage + 1) / STAGES.length) * 100);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      {/* Top Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 text-xs sm:text-sm font-medium text-stone-600 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-900 dark:text-stone-100">
              Stage {currentStage + 1} of {STAGES.length}: {STAGES[currentStage].title}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-stone-100 dark:bg-stone-800 text-stone-500 font-normal">
              ~{STAGES[currentStage].time}
            </span>
          </div>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            {progressPct}% Completed
          </span>
        </div>

        {/* Multi-step Track Bar */}
        <div className="w-full h-2.5 bg-stone-200/70 dark:bg-stone-800/80 rounded-full overflow-hidden flex gap-1 p-0.5">
          {STAGES.map((s, idx) => (
            <div
              key={s.id}
              onClick={() => setCurrentStage(idx)}
              className={`flex-1 h-full rounded-full transition-all duration-300 cursor-pointer ${
                idx < currentStage
                  ? 'bg-indigo-600 dark:bg-indigo-500'
                  : idx === currentStage
                  ? 'bg-indigo-500 dark:bg-indigo-400 animate-pulse'
                  : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Stage Navigation Pills */}
        <div className="hidden sm:flex items-center justify-between mt-3 gap-2">
          {STAGES.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === currentStage;
            const isDone = idx < currentStage;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStage(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isActive
                    ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500/30 font-semibold'
                    : isDone
                    ? 'text-emerald-700 dark:text-emerald-400 hover:bg-stone-100 dark:hover:bg-stone-800/60'
                    : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Interactive Stage Container */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStage}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.22 }}
          className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 rounded-3xl p-6 sm:p-10 shadow-xl shadow-stone-200/30 dark:shadow-none"
        >
          {/* STAGE 1: Brand & Context */}
          {currentStage === 0 && (
            <div className="space-y-8 text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-2">
                  <Globe className="w-3.5 h-3.5" /> Project Baseline
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  Who is this website being built for?
                </h2>
                <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
                  Tell us who you are and where the brand stands today.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Company / Brand Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={answers.companyName}
                    onChange={(e) => update('companyName', e.target.value)}
                    placeholder="e.g. Lumina Technologies, Archon Studio"
                    className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Client / Founder Name
                  </label>
                  <input
                    type="text"
                    value={answers.clientName}
                    onChange={(e) => update('clientName', e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Website Project Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'new',
                      label: 'Brand New Website',
                      desc: 'Starting from blank canvas. Zero legacy baggage.',
                    },
                    {
                      id: 'redesign',
                      label: 'Complete Redesign',
                      desc: 'Existing site needs a fresh look, modern UX & speed.',
                    },
                    {
                      id: 'replatform',
                      label: 'Migration / Re-platform',
                      desc: 'Moving to a modern CMS/stack with feature expansion.',
                    },
                  ].map((item) => (
                    <div
                      key={item.id}
                      onClick={() => update('websiteStatus', item.id as any)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        answers.websiteStatus === item.id
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-stone-50/30 dark:bg-stone-800/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                          {item.label}
                        </span>
                        {answers.websiteStatus === item.id && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Do you already own a domain name?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => update('hasDomain', true)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      answers.hasDomain
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30'
                        : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 bg-stone-50/30 dark:bg-stone-800/20'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-sm text-stone-900 dark:text-stone-100 block">
                        Yes, I already own a domain
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        Domain registered with registrar
                      </span>
                    </div>
                    {answers.hasDomain && (
                      <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  <div
                    onClick={() => update('hasDomain', false)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      !answers.hasDomain
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30'
                        : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 bg-stone-50/30 dark:bg-stone-800/20'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-sm text-stone-900 dark:text-stone-100 block">
                        No, I do not have a domain yet
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        Need to register or select one
                      </span>
                    </div>
                    {!answers.hasDomain && (
                      <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Conditional Logic: If hasDomain === true, ask for domain name */}
              {answers.hasDomain ? (
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    What is your registered domain name?
                  </label>
                  <input
                    type="text"
                    value={answers.domainName || ''}
                    onChange={(e) => {
                      update('domainName', e.target.value);
                      update('existingUrl', e.target.value.startsWith('http') ? e.target.value : `https://${e.target.value}`);
                    }}
                    placeholder="e.g. acmestudio.com or mycompany.io"
                    className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                  />
                </div>
              ) : (
                /* Conditional Logic: If hasDomain === false, ask if they need help choosing one */
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Would you like help choosing and securing the right domain name?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => update('needDomainHelp', true)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        answers.needDomainHelp
                          ? 'border-purple-600 bg-purple-50/60 dark:bg-purple-950/40 ring-1 ring-purple-500'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs text-stone-900 dark:text-stone-100 block">
                          Yes, please help choose/register one
                        </span>
                        <span className="text-[11px] text-stone-500">
                          Include domain discovery in brief
                        </span>
                      </div>
                      {answers.needDomainHelp && <Check className="w-4 h-4 text-purple-600" />}
                    </div>

                    <div
                      onClick={() => update('needDomainHelp', false)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        !answers.needDomainHelp
                          ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs text-stone-900 dark:text-stone-100 block">
                          No, I will purchase it myself
                        </span>
                        <span className="text-[11px] text-stone-500">
                          We will handle domain setup independently
                        </span>
                      </div>
                      {!answers.needDomainHelp && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  What does your company do? (1–2 sentences)
                </label>
                <textarea
                  rows={2}
                  value={answers.businessSummary}
                  onChange={(e) => update('businessSummary', e.target.value)}
                  placeholder="e.g. We provide AI-powered billing automation for subscription SaaS businesses with 50+ employees."
                  className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                />
              </div>
            </div>
          )}

          {/* STAGE 2: Goals & Primary KPI */}
          {currentStage === 1 && (
            <div className="space-y-8 text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-2">
                  <Target className="w-3.5 h-3.5" /> Core Purpose
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  What is the #1 job this website must do?
                </h2>
                <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
                  Every high-performing site is optimized around one clear primary conversion mechanism.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {[
                  {
                    id: 'leads',
                    title: 'Generate Inbound Leads',
                    icon: MessageSquare,
                    desc: 'Forms, consultation inquiries & high-intent sales calls',
                  },
                  {
                    id: 'ecommerce',
                    title: 'Direct eCommerce Sales',
                    icon: ShoppingBag,
                    desc: 'Product browsing, cart checkout & recurring orders',
                  },
                  {
                    id: 'authority',
                    title: 'Authority & Credibility',
                    icon: Award,
                    desc: 'Impress enterprise clients, press & venture capital investors',
                  },
                  {
                    id: 'booking',
                    title: 'Direct Appointment Booking',
                    icon: CalendarCheck,
                    desc: 'Calendar scheduling for services, clinics or consultants',
                  },
                  {
                    id: 'portfolio',
                    title: 'Showcase Creative Work',
                    icon: Layout,
                    desc: 'Visual case studies, client results & creative pedigree',
                  },
                  {
                    id: 'community',
                    title: 'Community or Portal Hub',
                    icon: Users,
                    desc: 'Member logins, knowledge base & collaborative tools',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = answers.primaryGoal === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => update('primaryGoal', item.id as any)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30 shadow-xs'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-stone-50/20 dark:bg-stone-800/10'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <div className="mt-3">
                        <span className="font-bold text-sm text-stone-900 dark:text-stone-100 block">
                          {item.title}
                        </span>
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Key Visitor Actions (Select all that apply)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Book Discovery Call',
                    'Request Custom Quote',
                    'Start Free Trial',
                    'Buy Product Online',
                    'Download Whitepaper / Catalog',
                    'Submit Contact Form',
                    'Schedule In-Person Consultation',
                    'Join Email Newsletter',
                  ].map((action) => {
                    const isChecked = answers.keyActions.includes(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => toggleArrayItem('keyActions', action)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                        {action}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  What is a 10/10 win 90 days after launch?
                </label>
                <input
                  type="text"
                  value={answers.successMetric}
                  onChange={(e) => update('successMetric', e.target.value)}
                  placeholder="e.g. Attract 15 qualified enterprise leads per month and drop bounce rate to <35%."
                  className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                />
              </div>
            </div>
          )}

          {/* STAGE 3: Audience & UX */}
          {currentStage === 2 && (
            <div className="space-y-8 text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-2">
                  <Users className="w-3.5 h-3.5" /> Audience & Mindset
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  Who is the ideal visitor we must win over?
                </h2>
                <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
                  Understanding audience expectations determines layout, typography, and friction points.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Primary Customer Segment
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'b2b_executives',
                      title: 'B2B Executives & Directors',
                      sub: 'High data density, ROI proof, speed to value',
                    },
                    {
                      id: 'consumers',
                      title: 'Everyday Consumers (DTC)',
                      sub: 'Mobile-first, emotional resonance, visual polish',
                    },
                    {
                      id: 'small_business',
                      title: 'Small Business & Founders',
                      sub: 'Clear pricing, transparent features, easy start',
                    },
                    {
                      id: 'luxury_clients',
                      title: 'High-Net-Worth / Luxury',
                      sub: 'Discreet aesthetics, exclusivity, understated elegance',
                    },
                    {
                      id: 'general_public',
                      title: 'Broad Community & Public',
                      sub: 'High accessibility, straightforward navigation',
                    },
                  ].map((seg) => {
                    const isSelected = answers.targetAudience === seg.id;
                    return (
                      <div
                        key={seg.id}
                        onClick={() => update('targetAudience', seg.id as any)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-stone-50/20 dark:bg-stone-800/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                            {seg.title}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
                          {seg.sub}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  What is their #1 pain point or frustration today?
                </label>
                <textarea
                  rows={2}
                  value={answers.corePainPoint}
                  onChange={(e) => update('corePainPoint', e.target.value)}
                  placeholder="e.g. They struggle to understand why we are 3x faster than traditional agencies."
                  className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Device Experience Focus
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'mobile_first',
                      label: 'Mobile-First Priority',
                      desc: '70%+ traffic on smartphones (e.g. social commerce, local services)',
                      icon: Smartphone,
                    },
                    {
                      id: 'balanced',
                      label: 'Balanced Responsive (50/50)',
                      desc: 'Uniform experience across desktop laptops, tablets and phones',
                      icon: Layout,
                    },
                    {
                      id: 'desktop_focused',
                      label: 'Desktop-Dense Focus',
                      desc: 'B2B enterprise buyers evaluating on dual office monitors',
                      icon: Monitor,
                    },
                  ].map((dev) => {
                    const Icon = dev.icon;
                    const isSelected = answers.primaryDevice === dev.id;
                    return (
                      <div
                        key={dev.id}
                        onClick={() => update('primaryDevice', dev.id as any)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-stone-500'}`} />
                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                            {dev.label}
                          </span>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                            {dev.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STAGE 4: Aesthetic & Vibe */}
          {currentStage === 3 && (
            <div className="space-y-8 text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-2">
                  <Palette className="w-3.5 h-3.5" /> Creative Direction
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  Which visual mood fits your brand vision?
                </h2>
                <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
                  Choose the aesthetic universe that reflects how you want the world to perceive you.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {[
                  {
                    id: 'minimal_clean',
                    title: 'Clean & Minimalist',
                    subtitle: 'Apple / Stripe aesthetic',
                    palette: ['#FFFFFF', '#F4F4F5', '#09090B', '#3B82F6'],
                    tags: ['Spacious', 'Precision', 'High Trust'],
                  },
                  {
                    id: 'bold_tech',
                    title: 'Dark Mode & High-Tech',
                    subtitle: 'Linear / Raycast vibe',
                    palette: ['#0A0A0C', '#18181B', '#6366F1', '#A855F7'],
                    tags: ['Futuristic', 'Neon Glow', 'Sleek'],
                  },
                  {
                    id: 'warm_editorial',
                    title: 'Warm & Organic Editorial',
                    subtitle: 'Kinfolk / Aesop styling',
                    palette: ['#F7F4EB', '#D7C4A5', '#2E2822', '#705335'],
                    tags: ['Serif Fonts', 'Tactile', 'Human'],
                  },
                  {
                    id: 'luxury_refined',
                    title: 'Quiet Luxury & Architecture',
                    subtitle: 'Architectural Digest / Celine',
                    palette: ['#121212', '#E5E5E5', '#C5A880', '#262626'],
                    tags: ['Understated', 'High Ticket', 'Couture'],
                  },
                  {
                    id: 'playful_vibrant',
                    title: 'Playful & High-Energy',
                    subtitle: 'Figma / Duolingo energy',
                    palette: ['#FFFBEB', '#F59E0B', '#10B981', '#EC4899'],
                    tags: ['Fun Icons', 'Bold Colors', 'Friendly'],
                  },
                  {
                    id: 'corporate_trust',
                    title: 'Corporate & Established',
                    subtitle: 'Institutional Blue & Slate',
                    palette: ['#FFFFFF', '#0F172A', '#1E40AF', '#64748B'],
                    tags: ['Enterprise', 'Security', 'Reliable'],
                  },
                ].map((item) => {
                  const isSelected = answers.aestheticVibe === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => update('aestheticVibe', item.id as any)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/40 ring-2 ring-indigo-500/40 shadow-md'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                      }`}
                    >
                      <div>
                        {/* Swatches preview */}
                        <div className="flex items-center gap-1.5 mb-3">
                          {item.palette.map((color, cIdx) => (
                            <div
                              key={cIdx}
                              className="w-5 h-5 rounded-full border border-black/10 dark:border-white/10 shadow-2xs"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <span className="font-bold text-sm text-stone-900 dark:text-stone-100 block">
                          {item.title}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400 block mt-0.5">
                          {item.subtitle}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-3">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Brand Identity Readiness
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'ready',
                      title: 'Ready to Go',
                      desc: 'Vector logo, color hex codes & typography fonts ready.',
                    },
                    {
                      id: 'in_progress',
                      title: 'Work In Progress',
                      desc: 'We have a logo but need palette refinement and fonts.',
                    },
                    {
                      id: 'needs_creation',
                      title: 'Need New Branding',
                      desc: 'We need full branding sprint alongside the website.',
                    },
                  ].map((status) => {
                    const isSelected = answers.brandIdentityStatus === status.id;
                    return (
                      <div
                        key={status.id}
                        onClick={() => update('brandIdentityStatus', status.id as any)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                        }`}
                      >
                        <span className="font-bold text-xs text-stone-900 dark:text-stone-100 block">
                          {status.title}
                        </span>
                        <span className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 block">
                          {status.desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Websites You Admire (Inspirations or Competitors)
                </label>
                <input
                  type="text"
                  value={answers.admirationUrls || ''}
                  onChange={(e) => update('admirationUrls', e.target.value)}
                  placeholder="e.g. stripe.com, linear.app, aesop.com"
                  className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                />
              </div>
            </div>
          )}

          {/* STAGE 5: Features & Capabilities */}
          {currentStage === 4 && (
            <div className="space-y-8 text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-2">
                  <Layers className="w-3.5 h-3.5" /> Technical Capabilities
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  Which features will the new site require?
                </h2>
                <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
                  Toggle all interactive modules you anticipate needing for the launch.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    name: 'Custom CMS for Blog & Case Studies',
                    desc: 'Easy non-technical editing for articles, project galleries & news',
                  },
                  {
                    name: 'Interactive Calendar Booking',
                    desc: 'Direct calendar integration (Calendly, Cal.com, Google Calendar)',
                  },
                  {
                    name: 'E-Commerce & Stripe Checkout',
                    desc: 'Product catalog, digital downloads, secure payment gateway',
                  },
                  {
                    name: 'Interactive Calculator / Quote Builder',
                    desc: 'Dynamic sliders where users compute pricing or ROI savings',
                  },
                  {
                    name: 'Client Portal or Member Login',
                    desc: 'Protected dashboard behind authentication for registered clients',
                  },
                  {
                    name: 'CRM & Marketing Webhooks',
                    desc: 'Automatic sync to HubSpot, Salesforce, Klaviyo or Mailchimp',
                  },
                  {
                    name: 'Micro-animations & 3D Interactive Polish',
                    desc: 'Smooth scroll effects, interactive hover shaders & high-end physics',
                  },
                  {
                    name: 'Multi-language / Internationalization',
                    desc: 'Localized copy and currency switching for global markets',
                  },
                ].map((feat) => {
                  const isChecked = answers.selectedFeatures.includes(feat.name);
                  return (
                    <div
                      key={feat.name}
                      onClick={() => toggleArrayItem('selectedFeatures', feat.name)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500/40'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-sm text-stone-900 dark:text-stone-100 block">
                          {feat.name}
                        </span>
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                          {feat.desc}
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-indigo-600 text-white'
                            : 'border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Existing Tools & Third-Party Platforms to Connect
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'HubSpot',
                    'Calendly',
                    'Google Analytics 4',
                    'Stripe',
                    'Shopify',
                    'Mailchimp',
                    'Slack Alerts',
                    'Zapier / Make',
                  ].map((tool) => {
                    const isChecked = answers.thirdPartyIntegrations.includes(tool);
                    return (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => toggleArrayItem('thirdPartyIntegrations', tool)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-indigo-600 text-white'
                            : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                        {tool}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STAGE 6: Scope, Investment & Timeline */}
          {currentStage === 5 && (
            <div className="space-y-8 text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 mb-2">
                  <Calendar className="w-3.5 h-3.5" /> Scope & Milestones
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-50 tracking-tight">
                  Sizing, budget & launch timeline
                </h2>
                <p className="text-stone-600 dark:text-stone-400 text-sm mt-1">
                  Helps calculate estimated development hours and milestone planning for your discovery brief.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Estimated Page Scope
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'landing_page', label: 'Single Landing Page', pages: '1 Page' },
                    { id: 'compact_5', label: 'Core Site', pages: '4–6 Pages' },
                    { id: 'standard_10', label: 'Growth Platform', pages: '7–12 Pages' },
                    { id: 'large_20_plus', label: 'Extensive Site', pages: '15+ Pages' },
                  ].map((s) => {
                    const isSelected = answers.pageCountScope === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => update('pageCountScope', s.id as any)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                        }`}
                      >
                        <span className="font-extrabold text-xs text-stone-900 dark:text-stone-100 block">
                          {s.pages}
                        </span>
                        <span className="text-[11px] text-stone-500 dark:text-stone-400 block mt-0.5">
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Target Investment Tier
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      id: 'starter',
                      tier: '$2,500 – $5,000',
                      desc: 'Sprint Build',
                      bullets: 'Fast turnaround, lean scope',
                    },
                    {
                      id: 'growth',
                      tier: '$5,000 – $12,000',
                      desc: 'Custom Production',
                      bullets: 'Bespoke design & integrations',
                    },
                    {
                      id: 'scale',
                      tier: '$12,000 – $25,000',
                      desc: 'Premium Platform',
                      bullets: 'Complex interactive features',
                    },
                    {
                      id: 'enterprise',
                      tier: '$25,000+',
                      desc: 'Enterprise System',
                      bullets: 'Custom architecture & portals',
                    },
                  ].map((b) => {
                    const isSelected = answers.budgetTier === b.id;
                    return (
                      <div
                        key={b.id}
                        onClick={() => update('budgetTier', b.id as any)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/40 shadow-xs'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                        }`}
                      >
                        <div>
                          <span className="font-extrabold text-sm text-stone-900 dark:text-stone-100 block">
                            {b.tier}
                          </span>
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block mt-0.5">
                            {b.desc}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-2">
                          {b.bullets}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Copywriting Status
                  </label>
                  <select
                    value={answers.copywritingStatus}
                    onChange={(e) => update('copywritingStatus', e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="finalized">Copy is 100% written and approved</option>
                    <option value="drafted">Rough draft ready, needs professional polish</option>
                    <option value="need_copywriter">We need a full copywriting package from scratch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                    Target Launch Window
                  </label>
                  <select
                    value={answers.targetLaunchWindow}
                    onChange={(e) => update('targetLaunchWindow', e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="urgent_month">Urgent: 2–4 Weeks Fast-Track</option>
                    <option value="standard_2months">Standard: 6–8 Weeks Production</option>
                    <option value="flexible_quarter">Flexible: 8–12 Weeks Comprehensive</option>
                    <option value="undecided">Flexible / Recommended by discovery</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2">
                  Special Notes or Constraints for Discovery Call
                </label>
                <textarea
                  rows={2}
                  value={answers.additionalNotes || ''}
                  onChange={(e) => update('additionalNotes', e.target.value)}
                  placeholder="e.g. Needs to load under 1.2s on mobile, must integrate with existing HubSpot deals pipeline."
                  className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm font-medium"
                />
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="mt-10 pt-6 border-t border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStage === 0 || isGenerating}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                currentStage === 0
                  ? 'opacity-0 pointer-events-none'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-[11px] text-stone-400">
                Press Ctrl+Enter to advance
              </span>

              {currentStage < STAGES.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Synthesizing Project Brief...
                    </span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Synthesize Project Brief</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
