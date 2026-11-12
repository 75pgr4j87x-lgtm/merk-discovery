export type CustomerOperationsPlatformRole = 'platform_support_agent';
export type CustomerOperationsBusinessRole =
  | 'business_owner'
  | 'business_manager'
  | 'business_support_agent';

export interface CustomerOperationsBusiness {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CustomerOperationsBusinessMembership {
  businessId: string;
  businessName: string;
  email: string;
  role: CustomerOperationsBusinessRole;
  active: boolean;
  uid?: string;
  grantVersion?:number;
  createdAt: string;
  invitedBy: string;
}

export interface CustomerOperationsPlatformMembership {
  email: string;
  role: CustomerOperationsPlatformRole;
  active: boolean;
  uid?: string;
  grantVersion?:number;
  createdAt: string;
  invitedBy: string;
}

export interface CustomerOperationsAccess {
  allowed: boolean;
  email: string;
  platformRole: 'platform_super_admin' | CustomerOperationsPlatformRole | null;
  businesses: CustomerOperationsBusinessMembership[];
}

export type CustomerOperationsCustomerStatus = 'active' | 'inactive';
export type CustomerOperationsTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type CustomerOperationsTicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'resolved'
  | 'closed';
export type CustomerOperationsTicketSource = 'manual' | 'email' | 'whatsapp' | 'phone' | 'in_app';

export interface CustomerOperationsCustomer {
  id: string;
  businessId: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  company: string;
  status: CustomerOperationsCustomerStatus;
  tags: string[];
  assignedOwner: string;
  nameSearch: string;
  emailSearch: string;
  companySearch: string;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string | null;
  createdBy: string;
}

export interface CustomerOperationsTicket {
  id: string;
  businessId: string;
  ticketNumber: string;
  ticketNumberSearch: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  subjectSearch: string;
  description: string;
  category: string;
  tags: string[];
  priority: CustomerOperationsTicketPriority;
  status: CustomerOperationsTicketStatus;
  assignedAgent: string;
  assignedTeam: string;
  source: CustomerOperationsTicketSource;
  createdAt: string;
  updatedAt: string;
  slaDueAt?: string | null;
  slaTargetAt?: string | null;
  slaPolicyMinutes?: number;
  slaBreachedAt?: string | null;
  reopenCount?: number;
  surveyId?: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdBy: string;
}

export interface CustomerOperationsInternalNote {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: string;
}

export interface CustomerOperationsTicketEvent {
  id: string;
  action: string;
  actorEmail: string;
  changes: Record<string, { from: string; to: string }>;
  createdAt: string;
}

export type CustomerOperationsConversationStatus = 'open' | 'closed';
export type CustomerOperationsMessageVisibility = 'customer' | 'internal';
export type CustomerOperationsMessageChannel = 'in_app' | 'email' | 'whatsapp';
export type CustomerOperationsMessageDeliveryStatus = 'not_applicable' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type CustomerOperationsCallDirection = 'inbound' | 'outbound';
export type CustomerOperationsCallOutcome =
  | 'answered'
  | 'missed'
  | 'voicemail'
  | 'callback_requested'
  | 'other';

export interface CustomerOperationsConversation {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  ticketId: string | null;
  ticketIds?: string[];
  assignedAgent?: string;
  revision?: number;
  ticketNumber: string | null;
  subject: string;
  status: CustomerOperationsConversationStatus;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  customerLinkExpiresAt: string | null;
}

export interface CustomerOperationsAttachment {id:string;name:string;mime:string;size:number;}

export interface CustomerOperationsConversationMessage {
  attachments?: CustomerOperationsAttachment[];
  id: string;
  conversationId: string;
  authorType: 'staff' | 'customer';
  authorEmail: string | null;
  visibility: CustomerOperationsMessageVisibility;
  channel: CustomerOperationsMessageChannel;
  deliveryStatus: CustomerOperationsMessageDeliveryStatus;
  deliveryError: string | null;
  externalMessageId: string | null;
  body: string;
  createdAt: string;
}

export interface CustomerOperationsCallLog {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  direction: CustomerOperationsCallDirection;
  outcome: CustomerOperationsCallOutcome;
  phoneNumber: string;
  durationSeconds: number;
  summary: string;
  agentEmail: string;
  createdAt: string;
}

export interface CustomerOperationsChannelCapabilities {
  email: { configured: boolean };
  whatsapp: { configured: boolean; provider: string | null;templates?:Array<{name:string;language:string}> };
  attachments?:{configured:boolean};
  callLogging: { enabled: true };
}

export interface CustomerOperationsWhatsAppProvider {
  sendTextMessage(input: {
    recipientE164: string;
    body: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string }>;
}

export interface CustomerOperationsActivity {
  id: string;
  businessId: string;
  customerId: string;
  ticketId: string | null;
  action: string;
  actorEmail: string;
  createdAt: string;
}
