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
  createdAt: string;
  invitedBy: string;
}

export interface CustomerOperationsPlatformMembership {
  email: string;
  role: CustomerOperationsPlatformRole;
  active: boolean;
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

export interface CustomerOperationsActivity {
  id: string;
  businessId: string;
  customerId: string;
  ticketId: string | null;
  action: string;
  actorEmail: string;
  createdAt: string;
}
