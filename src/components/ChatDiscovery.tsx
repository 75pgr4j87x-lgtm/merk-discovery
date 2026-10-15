import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DiscoveryAnswers, ChatMessage } from '../types/questionnaire';
import {
  Sparkles,
  Send,
  Check,
  CheckCircle2,
  Globe,
  HelpCircle,
  Target,
  Users,
  Palette,
  Layers,
  Calendar,
  ArrowRight,
  RotateCcw,
  Bot,
  User as UserIcon,
  ShoppingBag,
  Award,
  CalendarCheck,
  Layout,
  MessageSquare,
  Shield,
  Smartphone,
  Monitor,
  Flame,
  FileText,
  DollarSign,
  ChevronRight,
} from 'lucide-react';

interface ChatDiscoveryProps {
  answers: DiscoveryAnswers;
  onChange: (updated: DiscoveryAnswers) => void;
  onSubmit: () => void;
  isGenerating?: boolean;
}

// Logical conversational milestones for the visual progress indicator
type StepId =
  | 'welcome_identity'
  | 'domain_ask'
  | 'domain_has_name'
  | 'domain_need_help'
  | 'status_pitch'
  | 'primary_goal'
  | 'audience_pain'
  | 'aesthetic_tone'
  | 'features_stack'
  | 'budget_timeline'
  | 'ready_to_synthesize';

export const ChatDiscovery: React.FC<ChatDiscoveryProps> = ({
  answers,
  onChange,
  onSubmit,
  isGenerating = false,
}) => {
  const [currentStep, setCurrentStep] = React.useState<StepId>('welcome_identity');
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = React.useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  // Form input local drafts for currently active step
  const [tempCompany, setTempCompany] = React.useState(answers.companyName || '');
  const [tempClient, setTempClient] = React.useState(answers.clientName || '');
  const [tempDomain, setTempDomain] = React.useState(answers.domainName || '');
  const [tempPitch, setTempPitch] = React.useState(answers.businessSummary || '');
  const [tempPain, setTempPain] = React.useState(answers.corePainPoint || '');
  const [tempNotes, setTempNotes] = React.useState(answers.additionalNotes || '');

  // Keep local drafts synchronized when preset is applied
  React.useEffect(() => {
    setTempCompany(answers.companyName || '');
    setTempClient(answers.clientName || '');
    setTempDomain(answers.domainName || '');
    setTempPitch(answers.businessSummary || '');
    setTempPain(answers.corePainPoint || '');
    setTempNotes(answers.additionalNotes || '');
  }, [answers]);

  // Compute conversational progress mapping
  const PROGRESS_MAP: Record<StepId, { stepNumber: number; total: number; title: string; phase: string }> = {
    welcome_identity: { stepNumber: 1, total: 8, title: 'Company & Contact', phase: 'Stage 1 • Identity' },
    domain_ask: { stepNumber: 2, total: 8, title: 'Domain Verification', phase: 'Stage 2 • Web Address' },
    domain_has_name: { stepNumber: 2, total: 8, title: 'Domain Name', phase: 'Stage 2 • Web Address' },
    domain_need_help: { stepNumber: 2, total: 8, title: 'Domain Selection', phase: 'Stage 2 • Web Address' },
    status_pitch: { stepNumber: 3, total: 8, title: 'Project Status & Pitch', phase: 'Stage 3 • Context' },
    primary_goal: { stepNumber: 4, total: 8, title: 'Primary Goal & KPIs', phase: 'Stage 4 • Objectives' },
    audience_pain: { stepNumber: 5, total: 8, title: 'Target Audience & UX', phase: 'Stage 5 • Audience' },
    aesthetic_tone: { stepNumber: 6, total: 8, title: 'Visual Tone & Vibe', phase: 'Stage 6 • Aesthetics' },
    features_stack: { stepNumber: 7, total: 8, title: 'Interactive Features', phase: 'Stage 7 • Features' },
    budget_timeline: { stepNumber: 8, total: 8, title: 'Budget & Timeline', phase: 'Stage 8 • Investment' },
    ready_to_synthesize: { stepNumber: 8, total: 8, title: 'Ready to Synthesize', phase: 'Complete • Synthesis' },
  };

  const progressInfo = PROGRESS_MAP[currentStep] || PROGRESS_MAP.welcome_identity;
  const progressPct = Math.round((progressInfo.stepNumber / progressInfo.total) * 100);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTo({
          top: chatScrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 80);
  };

  // Add bot message with realistic typing cadence
  const postBotMessage = (text: string, nextStep: StepId) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'bot',
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          stepId: nextStep,
        },
      ]);
      setIsTyping(false);
      setCurrentStep(nextStep);
      scrollToBottom();
    }, 450);
  };

  // Add user message
  const postUserMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        sender: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    scrollToBottom();
  };

  // Initial greeting on load
  React.useEffect(() => {
    if (messages.length === 0) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages([
          {
            id: 'init-1',
            sender: 'bot',
            text: `Hello! 👋 I'm Aura, your Digital Discovery Lead. I'll guide you through a quick 2–3 minute interactive discovery session to map your new website requirements. The responses will be summarized directly into a Google Doc project brief!\n\nTo begin, what's your company or brand name, and your name?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            stepId: 'welcome_identity',
          },
        ]);
        setIsTyping(false);
      }, 350);
    }
  }, []);

  // Update answers helper
  const updateAnswers = <K extends keyof DiscoveryAnswers>(key: K, val: DiscoveryAnswers[K]) => {
    onChange({ ...answers, [key]: val });
  };

  // Toggle multi-select array items
  const toggleArrayItem = (key: 'keyActions' | 'visualKeywords' | 'selectedFeatures' | 'thirdPartyIntegrations', item: string) => {
    const list = answers[key] || [];
    if (list.includes(item)) {
      updateAnswers(key, list.filter((i) => i !== item));
    } else {
      updateAnswers(key, [...list, item]);
    }
  };

  // HANDLERS FOR EACH STEP
  const handleIdentitySubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const comp = tempCompany.trim() || 'Our Company';
    const client = tempClient.trim() || 'Project Lead';
    updateAnswers('companyName', comp);
    updateAnswers('clientName', client);

    postUserMessage(`${comp} (Contact: ${client})`);
    postBotMessage(
      `Wonderful to meet you, ${client}! Let's check on your web address:\n\nDo you already have a domain name registered for ${comp} (like ${comp.toLowerCase().replace(/\s+/g, '')}.com)?`,
      'domain_ask'
    );
  };

  // Conditional Logic Handler for Domain Question
  const handleDomainChoice = (hasDomain: boolean) => {
    updateAnswers('hasDomain', hasDomain);
    if (hasDomain) {
      postUserMessage('Yes, I already have a registered domain name');
      postBotMessage(
        'Great! What is your registered domain name or website URL?',
        'domain_has_name'
      );
    } else {
      postUserMessage("No, I don't have a domain name yet");
      postBotMessage(
        "No problem at all! Securing the right domain is a critical step. Would you like our team to help you research, select, and acquire the right domain for your project?",
        'domain_need_help'
      );
    }
  };

  const handleDomainNameSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const dName = tempDomain.trim() || 'Not specified';
    updateAnswers('domainName', dName);
    updateAnswers('existingUrl', dName.startsWith('http') ? dName : `https://${dName}`);

    postUserMessage(`Domain: ${dName}`);
    postBotMessage(
      `Got it, we will plan the architecture around ${dName}!\n\nIs this website a brand-new build from scratch or a complete redesign of an existing site? Also, give me a 1-sentence elevator pitch of what your business does:`,
      'status_pitch'
    );
  };

  const handleDomainHelpChoice = (needHelp: boolean) => {
    updateAnswers('needDomainHelp', needHelp);
    if (needHelp) {
      postUserMessage('Yes, please help choose and register a domain');
    } else {
      postUserMessage("No, we will handle domain registration ourselves");
    }

    postBotMessage(
      `Understood! We have noted your domain strategy.\n\nNow, is this a brand-new website build from scratch or a redesign of an existing site? And what does your business do in 1-2 sentences?`,
      'status_pitch'
    );
  };

  const handleStatusPitchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pitch = tempPitch.trim() || 'Delivering high quality products & services.';
    updateAnswers('businessSummary', pitch);

    const statusLabel =
      answers.websiteStatus === 'new'
        ? 'Brand New Build'
        : answers.websiteStatus === 'redesign'
        ? 'Complete Redesign'
        : 'Migration / Re-platform';

    postUserMessage(`${statusLabel} — "${pitch}"`);
    postBotMessage(
      `Clear strategic focus. Next up: What is the #1 job this website must accomplish for your business? Every great site is optimized around a primary conversion metric:`,
      'primary_goal'
    );
  };

  const handlePrimaryGoalSubmit = () => {
    const goalLabels: Record<string, string> = {
      leads: 'Generate Inbound Leads & Consultations',
      ecommerce: 'Direct Product Sales & eCommerce Checkout',
      authority: 'Elevate Brand Authority & Attract Investors',
      booking: 'Direct Calendar & Appointment Booking',
      portfolio: 'Showcase Creative Portfolio & Case Studies',
      community: 'Community Hub & Portal Logins',
    };

    postUserMessage(`Primary Goal: ${goalLabels[answers.primaryGoal] || answers.primaryGoal}`);
    postBotMessage(
      `Excellent choice. Who is your primary target audience, and what is the biggest frustration or pain point they experience before finding you?`,
      'audience_pain'
    );
  };

  const handleAudiencePainSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pain = tempPain.trim() || 'They need quick proof and frictionless interaction.';
    updateAnswers('corePainPoint', pain);

    const audLabels: Record<string, string> = {
      b2b_executives: 'B2B Executives & Decision Makers',
      consumers: 'Everyday Consumers (DTC)',
      small_business: 'Small Business Owners & Freelancers',
      luxury_clients: 'High-Net-Worth / Luxury Clientele',
      general_public: 'Broad Community & General Public',
    };

    postUserMessage(`Audience: ${audLabels[answers.targetAudience]} — Pain: "${pain}"`);
    postBotMessage(
      `Design and tone dictate first impressions. Which aesthetic mood best matches how you want visitors to perceive your brand?`,
      'aesthetic_tone'
    );
  };

  const handleAestheticSubmit = () => {
    const aestheticLabels: Record<string, string> = {
      minimal_clean: 'Clean & Minimalist (Apple/Stripe)',
      bold_tech: 'Dark Mode & High-Tech (Linear/Raycast)',
      warm_editorial: 'Warm & Organic Editorial (Aesop/Kinfolk)',
      luxury_refined: 'Quiet Luxury & Architecture (Celine/Blackstone)',
      playful_vibrant: 'Playful & High-Energy (Duolingo/Figma)',
      corporate_trust: 'Corporate & Established (Institutional)',
    };

    postUserMessage(`Aesthetic Vibe: ${aestheticLabels[answers.aestheticVibe]}`);
    postBotMessage(
      `Love this visual direction! Now let's review functionality: Which interactive features and modules will your site need at launch?`,
      'features_stack'
    );
  };

  const handleFeaturesSubmit = () => {
    postUserMessage(`Features selected: ${answers.selectedFeatures.length} core modules`);
    postBotMessage(
      `We're almost at the finish line! Lastly: What is your target investment tier and desired launch window?`,
      'budget_timeline'
    );
  };

  const handleBudgetTimelineSubmit = () => {
    const budgetLabels: Record<string, string> = {
      starter: '$2,500 – $5,000 (Sprint Build)',
      growth: '$5,000 – $12,000 (Custom Production)',
      scale: '$12,000 – $25,000 (Premium Platform)',
      enterprise: '$25,000+ (Enterprise System)',
    };

    const timeLabels: Record<string, string> = {
      urgent_month: 'Urgent: 2–4 Weeks Fast-Track',
      standard_2months: 'Standard: 6–8 Weeks Production',
      flexible_quarter: 'Flexible: 8–12 Weeks Comprehensive',
      undecided: 'Flexible / Discovery recommendations',
    };

    postUserMessage(`Budget: ${budgetLabels[answers.budgetTier]} • Timeline: ${timeLabels[answers.targetLaunchWindow]}`);
    postBotMessage(
      `Fantastic! All discovery inputs are complete. I have all the context required to synthesize your authoritative Website Project Brief & Scope Blueprint.\n\nClick the button below to generate your Google Doc brief! 🚀`,
      'ready_to_synthesize'
    );
  };

  const handleResetChat = () => {
    setCurrentStep('welcome_identity');
    setMessages([
      {
        id: 'reset-1',
        sender: 'bot',
        text: `Chat restarted! Let's build your website project brief. What is your company/brand name, and who is the contact lead?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stepId: 'welcome_identity',
      },
    ]);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 sm:py-6">
      {/* Dynamic Visual Progress Indicator (Prominent Top Card) */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 rounded-2xl p-4 shadow-sm mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
              {progressInfo.stepNumber}/{progressInfo.total}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  Step {progressInfo.stepNumber} of {progressInfo.total}: {progressInfo.title}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  {progressInfo.phase}
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Interactive discovery chatbot for Google Doc project brief
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {progressPct}% Completed
            </span>
            <button
              onClick={handleResetChat}
              title="Restart Discovery Chat"
              className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Visual Progress Track */}
        <div className="w-full h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Chat Conversation Card */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 rounded-3xl shadow-xl overflow-hidden flex flex-col h-[650px] sm:h-[700px]">
        {/* Chat Header Bar */}
        <div className="px-5 py-3.5 bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-stone-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
                  Aura
                </span>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.2 rounded">
                  Design Strategist
                </span>
              </div>
              <span className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Discovery intake session active
              </span>
            </div>
          </div>

          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-stone-400 block font-mono">
              Target Time: 2–3 min
            </span>
          </div>
        </div>

        {/* Message Stream Area */}
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-stone-50/30 dark:bg-stone-950/30"
        >
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex items-start gap-2.5 ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white font-medium rounded-br-xs shadow-xs'
                    : 'bg-white dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 text-stone-800 dark:text-stone-100 rounded-bl-xs shadow-xs'
                }`}
              >
                {msg.text}
                <div
                  className={`text-[10px] mt-1 text-right ${
                    msg.sender === 'user' ? 'text-indigo-200' : 'text-stone-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center shrink-0 mt-0.5">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-2 text-stone-400 text-xs pl-10">
              <div className="flex items-center gap-1 bg-white dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 px-3 py-2 rounded-2xl rounded-bl-xs shadow-2xs">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
              </div>
              <span className="text-[11px] font-medium text-stone-500">Aura is typing...</span>
            </div>
          )}
        </div>

        {/* Interactive Response Widget Tray (Bottom of Chat) */}
        <div className="border-t border-stone-200/90 dark:border-stone-800/90 bg-white dark:bg-stone-900 p-4 sm:p-5">
          {/* STEP 1: WELCOME & IDENTITY */}
          {currentStep === 'welcome_identity' && (
            <form onSubmit={handleIdentitySubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={tempCompany}
                  onChange={(e) => setTempCompany(e.target.value)}
                  placeholder="Company / Brand Name (e.g. Acme Studio)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <input
                  type="text"
                  required
                  value={tempClient}
                  onChange={(e) => setTempClient(e.target.value)}
                  placeholder="Your Name (e.g. Jordan Smith)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Continue to Domain Verification</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* STEP 2: CONDITIONAL LOGIC - DO YOU HAVE A DOMAIN NAME? */}
          {currentStep === 'domain_ask' && (
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                Do you already own a domain name?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDomainChoice(true)}
                  className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/60 text-left transition cursor-pointer flex items-center justify-between group"
                >
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-indigo-900 dark:text-indigo-200 block">
                      Yes, I have a domain name
                    </span>
                    <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400 block mt-0.5">
                      Already registered via GoDaddy, Namecheap, etc.
                    </span>
                  </div>
                  <Globe className="w-4 h-4 text-indigo-600 group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDomainChoice(false)}
                  className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition cursor-pointer flex items-center justify-between group"
                >
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100 block">
                      No, not yet
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 block mt-0.5">
                      Need help choosing or registering one
                    </span>
                  </div>
                  <HelpCircle className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3A (CONDITIONAL BRANCH YES): ASK FOR DOMAIN NAME */}
          {currentStep === 'domain_has_name' && (
            <form onSubmit={handleDomainNameSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-1.5">
                  Enter your registered domain name:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={tempDomain}
                    onChange={(e) => setTempDomain(e.target.value)}
                    placeholder="e.g. acmestudio.com or mybrand.io"
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs shrink-0"
                  >
                    Save Domain
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3B (CONDITIONAL BRANCH NO): ASK IF THEY NEED HELP CHOOSING */}
          {currentStep === 'domain_need_help' && (
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                Do you need help choosing and registering a domain?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDomainHelpChoice(true)}
                  className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/40 hover:bg-purple-100 text-left transition cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-purple-900 dark:text-purple-200 block">
                      Yes, please help choose/register one
                    </span>
                    <span className="text-[11px] text-purple-700/80 dark:text-purple-300 block mt-0.5">
                      Include domain consultation in brief
                    </span>
                  </div>
                  <Sparkles className="w-4 h-4 text-purple-600" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDomainHelpChoice(false)}
                  className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/50 hover:bg-stone-100 text-left transition cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100 block">
                      No, I will buy it myself
                    </span>
                    <span className="text-[11px] text-stone-500 block mt-0.5">
                      We will provide domain credentials later
                    </span>
                  </div>
                  <Check className="w-4 h-4 text-stone-400" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: STATUS & ELEVATOR PITCH */}
          {currentStep === 'status_pitch' && (
            <form onSubmit={handleStatusPitchSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'new', label: 'Brand New Build' },
                  { id: 'redesign', label: 'Complete Redesign' },
                  { id: 'replatform', label: 'Platform Migration' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => updateAnswers('websiteStatus', st.id as any)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer text-center ${
                      answers.websiteStatus === st.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                required
                value={tempPitch}
                onChange={(e) => setTempPitch(e.target.value)}
                placeholder="What does your company do in 1-2 sentences? (e.g. We provide AI compliance software for fintechs)"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Continue to Core Objectives
              </button>
            </form>
          )}

          {/* STEP 5: PRIMARY GOAL & KPIS */}
          {currentStep === 'primary_goal' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                {[
                  { id: 'leads', title: 'Inbound Leads', icon: MessageSquare },
                  { id: 'ecommerce', title: 'eCommerce Sales', icon: ShoppingBag },
                  { id: 'authority', title: 'Authority & Trust', icon: Award },
                  { id: 'booking', title: 'Book Appointments', icon: CalendarCheck },
                  { id: 'portfolio', title: 'Showcase Work', icon: Layout },
                  { id: 'community', title: 'Member Portal', icon: Users },
                ].map((g) => {
                  const Icon = g.icon;
                  const isSel = answers.primaryGoal === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => updateAnswers('primaryGoal', g.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                        isSel
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500 font-bold'
                          : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${isSel ? 'text-indigo-600' : 'text-stone-500'}`} />
                        <span className="text-xs text-stone-900 dark:text-stone-100">{g.title}</span>
                      </div>
                      {isSel && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handlePrimaryGoalSubmit}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Set Objective & Continue
              </button>
            </div>
          )}

          {/* STEP 6: AUDIENCE & PAIN POINT */}
          {currentStep === 'audience_pain' && (
            <form onSubmit={handleAudiencePainSubmit} className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'b2b_executives', label: 'B2B Executives' },
                  { id: 'consumers', label: 'Everyday Consumers' },
                  { id: 'small_business', label: 'Small Business' },
                  { id: 'luxury_clients', label: 'Luxury Clientele' },
                  { id: 'general_public', label: 'Broad Public' },
                ].map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => updateAnswers('targetAudience', a.id as any)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                      answers.targetAudience === a.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                required
                value={tempPain}
                onChange={(e) => setTempPain(e.target.value)}
                placeholder="What is their primary frustration/pain point? (e.g. Existing tools take weeks to implement)"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Save Audience & Continue
              </button>
            </form>
          )}

          {/* STEP 7: AESTHETIC & VIBE */}
          {currentStep === 'aesthetic_tone' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'minimal_clean', title: 'Clean & Minimalist', sub: 'Apple / Stripe' },
                  { id: 'bold_tech', title: 'Dark Mode High-Tech', sub: 'Linear / Raycast' },
                  { id: 'warm_editorial', title: 'Warm & Organic', sub: 'Aesop / Kinfolk' },
                  { id: 'luxury_refined', title: 'Quiet Luxury', sub: 'Architectural' },
                  { id: 'playful_vibrant', title: 'Playful & Vibrant', sub: 'Figma / Duolingo' },
                  { id: 'corporate_trust', title: 'Corporate & Trust', sub: 'Institutional' },
                ].map((aes) => {
                  const isSel = answers.aestheticVibe === aes.id;
                  return (
                    <button
                      key={aes.id}
                      type="button"
                      onClick={() => updateAnswers('aestheticVibe', aes.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        isSel
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500'
                          : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <span className="font-bold text-xs text-stone-900 dark:text-stone-100 block">
                        {aes.title}
                      </span>
                      <span className="text-[10px] text-stone-500 block">{aes.sub}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAestheticSubmit}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Lock Visual Tone & Continue
              </button>
            </div>
          )}

          {/* STEP 8: FEATURES & TECHNICAL MODULES */}
          {currentStep === 'features_stack' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                Toggle all essential features required:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
                {[
                  'Custom CMS / Blog',
                  'Interactive Booking',
                  'E-Commerce & Stripe',
                  'Price Calculator',
                  'Client Portal Login',
                  'CRM & Webhooks',
                  'Animations & 3D Polish',
                  'Multi-language Support',
                ].map((feat) => {
                  const isChecked = answers.selectedFeatures.includes(feat);
                  return (
                    <button
                      key={feat}
                      type="button"
                      onClick={() => toggleArrayItem('selectedFeatures', feat)}
                      className={`p-2 rounded-xl border text-left text-xs font-medium transition cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                      }`}
                    >
                      <span className="truncate">{feat}</span>
                      {isChecked && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleFeaturesSubmit}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer shadow-xs"
              >
                Confirm Features & Proceed
              </button>
            </div>
          )}

          {/* STEP 9: BUDGET & TIMELINE */}
          {currentStep === 'budget_timeline' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'starter', label: '$2.5k – $5k', tag: 'Sprint' },
                  { id: 'growth', label: '$5k – $12k', tag: 'Custom' },
                  { id: 'scale', label: '$12k – $25k', tag: 'Premium' },
                  { id: 'enterprise', label: '$25k+', tag: 'Enterprise' },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => updateAnswers('budgetTier', b.id as any)}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      answers.budgetTier === b.id
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500 font-bold'
                        : 'border-stone-200 dark:border-stone-800'
                    }`}
                  >
                    <span className="font-extrabold text-xs block">{b.label}</span>
                    <span className="text-[10px] text-stone-500 block">{b.tag}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <select
                  value={answers.targetLaunchWindow}
                  onChange={(e) => updateAnswers('targetLaunchWindow', e.target.value as any)}
                  className="flex-1 px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/50 text-xs font-semibold outline-none"
                >
                  <option value="urgent_month">Urgent: 2–4 Weeks Fast-Track</option>
                  <option value="standard_2months">Standard: 6–8 Weeks Production</option>
                  <option value="flexible_quarter">Flexible: 8–12 Weeks</option>
                </select>

                <button
                  type="button"
                  onClick={handleBudgetTimelineSubmit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Save & Complete
                </button>
              </div>
            </div>
          )}

          {/* STEP 10: READY TO SYNTHESIZE */}
          {currentStep === 'ready_to_synthesize' && (
            <div className="text-center py-2 space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>All Discovery Questions Completed</span>
              </div>

              <button
                type="button"
                onClick={onSubmit}
                disabled={isGenerating}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Synthesizing Project Brief...
                  </span>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <span>Synthesize & View Project Brief</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
