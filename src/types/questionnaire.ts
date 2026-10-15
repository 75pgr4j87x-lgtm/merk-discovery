export interface DiscoveryAnswers {
  // New 8-step questionnaire fields
  businessAndClient: string; // Q1: What you do & favorite kind of client
  brandVibe: string[]; // Q2: Multi-select up to 3 options
  visualColors: string; // Q3: Colors and visual taste, love/hate, links
  selectedColors?: string[]; // Question 4: 1 to 3 selected hex colors from color picker
  existingAssets: string[]; // Q4: Multi-select pieces in toolkit
  coreObjectives: string[]; // Q5: Multi-select headache / platform goals
  inspirationSites: string; // Q6: Websites or apps secretly admired
  successOutcome: string; // Q7: 6 months after launch dream outcome
  
  // Q8: Timing and Budget Compound Field
  timelineSelection: string; // Preset option
  customTimeline: string; // Optional custom text
  budgetSelection: string; // Preset option
  customBudget: string; // Optional custom text

  // Contact & Identity info
  clientName: string;
  clientEmail: string;
  companyName: string;

  // Legacy fields preserved for complete backward compatibility
  websiteStatus: 'new' | 'redesign' | 'replatform';
  existingUrl?: string;
  businessSummary: string;

  // Domain Conditional Logic
  hasDomain: boolean;
  domainName?: string;
  needDomainHelp?: boolean;

  // Legacy Objectives & Goals
  primaryGoal: 'leads' | 'ecommerce' | 'authority' | 'booking' | 'community' | 'portfolio';
  selectedGoals?: string[];
  keyActions: string[];
  successMetric: string;

  // Legacy Audience & UX
  targetAudience: 'b2b_executives' | 'consumers' | 'small_business' | 'luxury_clients' | 'general_public';
  selectedAudiences?: string[];
  corePainPoint: string;
  primaryDevice: 'mobile_first' | 'desktop_focused' | 'balanced';

  // Legacy Visual Aesthetic & Tone
  aestheticVibe: 'minimal_clean' | 'bold_tech' | 'warm_editorial' | 'playful_vibrant' | 'luxury_refined' | 'corporate_trust';
  brandIdentityStatus: 'ready' | 'in_progress' | 'needs_creation';
  visualKeywords: string[];

  // Legacy Features & Technical Functionality
  selectedFeatures: string[];
  thirdPartyIntegrations: string[];

  // Legacy Scope, Assets & Content
  pageCountScope: 'landing_page' | 'compact_5' | 'standard_10' | 'large_20_plus';
  copywritingStatus: 'finalized' | 'drafted' | 'need_copywriter';
  imageryStatus: 'ready_assets' | 'need_stock' | 'photoshoot_planned';

  // Legacy Investment & Timeline
  budgetTier: string;
  targetLaunchWindow: string;
  admirationUrls?: string;
  additionalNotes?: string;
}

export interface PresetTemplate {
  id: string;
  name: string;
  tagline: string;
  answers: DiscoveryAnswers;
}

export interface GoogleDocResult {
  documentId: string;
  docUrl: string;
  title: string;
  createdAt: string;
}

export interface GoogleFormResult {
  formId: string;
  responderUri: string;
  editUri: string;
  title: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  timestamp: string;
  stepId?: string;
}
