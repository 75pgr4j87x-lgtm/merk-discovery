# Customer Operations architecture

## Current application fit

Customer Operations is a feature inside the existing Merk Discovery application, not a separate app. The repository uses React and TypeScript with Vite, an Express server, Firebase Authentication for Google sign-in, and Firestore through the Firebase Admin SDK. Existing Studio access is a separate internal role system; Customer Operations does not treat Studio invitations, BetaDesk grants, or client project access as Customer Operations permissions.

The feature entry point is `/studio/customer-operations`. It shares the existing Firebase identity provider but uses Customer Operations-specific server checks and role records. The Studio Super Admin is determined by the existing server-only `STUDIO_OWNER_EMAIL` configuration. All other grants are stored independently.

## Phase 1 data model

Firestore is schema-on-write, so phases add collections rather than SQL migrations:

| Collection | Purpose | Scope |
|---|---|---|
| `customerOperationsBusinesses` | Business workspace registry and lifecycle status | Platform registry metadata |
| `customerOperationsBusinessMemberships` | Verified-email membership and role for one business | Exactly one `businessId` |
| `customerOperationsPlatformMemberships` | Platform Support Agent membership | Platform only |
| `customerOperationsAuditLogs` | Append-only records of workspace and role grants/revocations | Platform administration |
| `customerOperationsCustomers` | Business customer profiles | Exactly one `businessId` |
| `customerOperationsTickets` | Support tickets and workflow fields | Exactly one `businessId` |
| `customerOperationsActivity` | Customer timeline events, excluding note body text | Exactly one `businessId` |
| `customerOperationsCustomers/{id}/internalNotes` | Private customer notes | Parent customer business |
| `customerOperationsTickets/{id}/internalNotes` | Private ticket notes | Parent ticket business |
| `customerOperationsTickets/{id}/events` | Append-only ticket changes and lifecycle history | Parent ticket business |
| `customerOperationsConversations` | Inbox threads linked to one customer and optionally one ticket | Exactly one `businessId` |
| `customerOperationsConversations/{id}/messages` | Customer-visible and internal-only conversation messages | Parent conversation business |
| `customerOperationsCallLogs` | Manually recorded inbound/outbound call activity | Exactly one `businessId` |
| `customerOperationsBusinesses/{id}/counters/tickets` | Transactional per-business ticket sequence | Parent business |

Business membership roles are `business_owner`, `business_manager`, and `business_support_agent`. The only platform membership role currently grantable is `platform_support_agent`; `platform_super_admin` is derived exclusively from the configured owner identity and cannot be granted through an API. A business is created with an initial Business Owner membership in the same Firestore transaction.

Phase 2 creates customer and ticket records with explicit `businessId` ownership. Server queries always filter by the authorized business ID; direct record loads verify the stored business ID before returning anything. Platform roles are expressly denied customer/ticket endpoints, even if the actor can see the platform business directory. The platform business APIs continue to manage account metadata and membership only.

Ticket references are sequential within a business (`TKT-1001`, etc.) and allocated in a Firestore transaction. They are unique in their business, not globally across tenants. Customer records are never merged based on matching names or contact values; there is no verified-identifier source yet. Staff can create separate profiles safely.

## Authorization and data boundaries

- Every Customer Operations API verifies the Firebase ID token server-side and requires a verified email.
- Business workspace membership is resolved separately from the Studio and BetaDesk role systems.
- Platform directory and platform-member administration endpoints are restricted to the configured Platform Super Admin.
- Business membership management requires the exact business's Business Owner membership, except for platform account onboarding.
- Platform Support Agents do not inherit business workspace access.
- Client Firestore access remains default-deny. Customer Operations persistence is through server APIs using the Admin SDK.
- Grants and revocations are written with their corresponding append-only audit record in a Firestore transaction.
- Internal customer and ticket notes are stored separately from customer profiles and tickets and are returned only from authenticated business-agent routes. Conversation messages have explicit `customer` or `internal` visibility; the public customer link can only load or create customer-visible messages.
- Customer conversation links use 256-bit random tokens, store only the SHA-256 token hash, expire after seven days, and can be rotated or revoked by a business member. The token is placed in the URL fragment and sent to the server only in a request header. Public responses omit customer email, internal messages, and token metadata.
- Outbound conversation email uses the server's SMTP configuration, writes delivery status to the message, and supports retrying failed sends. Email contains the customer-visible message and the expiring secure conversation link; internal messages are never delivered externally.
- WhatsApp uses a vendor-neutral `CustomerOperationsWhatsAppProvider` contract for official providers. No provider or credentials are selected/configured in this phase, so sending is explicitly unavailable rather than routed through an unofficial gateway.
- Call logs are append-only business-scoped records. They store direction, outcome, duration, phone number, summary, and the authenticated agent; call recording is not enabled.
- Ticket events retain status, assignment, priority, tag, and other permitted field changes without overwriting prior event history. Resolution time is set on resolve and cleared on reopen; the event history records the status transitions.
- Customer, ticket, and conversation lists are limited and cursor-paginated. Prefix searches are tenant-scoped; Firestore composite indexes for the actual list/search patterns are declared in `firestore.indexes.json`.
- Phase 3 attachment upload/storage is deferred; no attachment URLs or public file access are exposed.

Memberships are currently assigned to a normalized, verified email to support onboarding before a business user has signed in. When later implementing invitation claiming, bind the claimed membership to the Firebase UID and retain an auditable lifecycle so a changed or recycled email cannot transfer access.

## Implemented routes

- `GET /api/customer-operations/access` — returns the caller's permitted platform role and business memberships.
- `GET /api/customer-operations/businesses` — platform business registry, Platform Super Admin only.
- `POST /api/customer-operations/businesses` — creates a business and its initial Business Owner membership, Platform Super Admin only.
- `GET /api/customer-operations/platform-members` — list platform support grants, Platform Super Admin only.
- `POST /api/customer-operations/platform-members` — grant Platform Support Agent, Platform Super Admin only.
- `DELETE /api/customer-operations/platform-members/:email` — deactivate platform grant, Platform Super Admin only.
- `GET /api/customer-operations/businesses/:businessId/members` — active team roster, business member only.
- `POST /api/customer-operations/businesses/:businessId/members` — grant Manager or Support Agent in the exact business, Business Owner or Platform Super Admin.
- `DELETE /api/customer-operations/businesses/:businessId/members/:email` — deactivate a non-owner membership in the exact business.
- `GET /api/customer-operations/businesses/:businessId/customers` — tenant-scoped, paginated customer list with prefix search and status filter.
- `POST /api/customer-operations/businesses/:businessId/customers` — create a customer profile.
- `GET/PATCH /api/customer-operations/businesses/:businessId/customers/:customerId` — read/update a profile; GET returns business-agent-only notes and activity.
- `POST /api/customer-operations/businesses/:businessId/customers/:customerId/internal-notes` — add a private internal note.
- `GET/POST /api/customer-operations/businesses/:businessId/tickets` — list/filter/search or create tickets.
- `GET/PATCH /api/customer-operations/businesses/:businessId/tickets/:ticketId` — read/update a ticket and its private history.
- `POST /api/customer-operations/businesses/:businessId/tickets/:ticketId/internal-notes` — add a private internal note.
- `GET/POST /api/customer-operations/businesses/:businessId/conversations` — list inbox threads or create a thread with an initial customer-visible message.
- `GET /api/customer-operations/businesses/:businessId/conversations/:conversationId` — load all messages for an authorized business member.
- `POST /api/customer-operations/businesses/:businessId/conversations/:conversationId/messages` — add customer-visible or internal-only staff messages.
- `PATCH /api/customer-operations/businesses/:businessId/conversations/:conversationId` — open or close a conversation.
- `POST/DELETE /api/customer-operations/businesses/:businessId/conversations/:conversationId/customer-link` — issue/rotate a seven-day customer link or revoke it.
- `GET /api/customer-operations/public/conversations` and `POST /api/customer-operations/public/conversations/messages` — read/reply using the conversation-scoped link token; customer replies cannot be internal.
- `GET /api/customer-operations/businesses/:businessId/channels` — return available email, WhatsApp, and call-log capabilities without exposing secrets.
- `GET/POST /api/customer-operations/businesses/:businessId/calls` — list or record business-scoped call activity.
- `POST /api/customer-operations/businesses/:businessId/conversations/:conversationId/messages/:messageId/retry` — retry a failed outbound SMTP message.

Business records require an active membership in the exact business. Platform Super Admins and Platform Support Agents are denied these data endpoints. Agent assignment is validated against active membership and rechecked inside the Firestore transaction. Ticket status transitions are validated in the transaction to prevent concurrent updates from bypassing the lifecycle rules.

## Phase status and planned phases

1. Foundation — access model, tenant boundaries, route, base navigation and workspace setup.
2. Customers and Tickets — tenant-scoped profiles, ticket lifecycle, notes and history. **Implemented locally; validate against non-production Firestore.**
3. Unified Inbox and In-App Messaging — **implemented locally** with explicit customer/optional-ticket relationships, customer-safe and internal messages, and expiring customer links. Attachment support was deferred at the user's request; validate using a non-production Firebase project.
4. External Channels — **implemented locally** with configured SMTP delivery, a vendor-neutral official WhatsApp provider contract, and manual business-scoped call logs. WhatsApp sending remains disabled until a provider is selected and configured.
5. Operations — notifications, automation, SLAs, knowledge base, feedback and business team workflows.
6. Reporting, AI and Hardening — tenant-scoped reporting, optional provider interfaces, security and acceptance testing.

## Phase 6: reporting and hardening

Business owners and managers can open Reports from their business workspace. Support agents and all platform roles are denied report/AI configuration endpoints on the server. Platform access does not grant private business reporting access. The shared business access policy validates exact workspace IDs and active membership; existing verified Firebase identity resolution remains unchanged.

`customerOperationsReporting.ts` owns date validation, bounded report calculations, the report router and the optional `CustomerOperationsAIProvider` contract. `serverStore.ts` projects only report fields from tickets, filtering `businessId` and a half-open UTC `createdAt` range in Firestore. Reports are creation-cohort reports evaluated at query time, not historical snapshots or all-time backlog. Dates are limited to 90 days; queries stop at 5,001 documents and reject oversized cohorts instead of silently truncating. Categories, source channels, statuses and assigned-agent counts are computed from those rows without N+1 queries. Missing time measurements remain null with sample counts. There is no claim that first-response instrumentation is complete in older ticket workflows.

The report view is lazy-loaded. Requests carry Firebase ID tokens and responses are private/no-store. All Customer Operations API responses now disable caching and referrer propagation. Public message serialization uses an explicit allowlist and independently removes internal messages and undelivered email, even if upstream results accidentally include them. Provider metadata and staff email are stripped.

The AI adapter is an interface only. It is not instantiated and there is no generation endpoint. The existing global Gemini key does not opt business data into AI. A future adapter requires server-side provider configuration, explicit approval of tenant data handling, permitted-data retrieval, timeouts, output validation and human approval before sending any suggestion. No private data is currently sent to an AI provider.

Phase 5 was absent on the starting dev commit; the implementation described below adds business operations and reporting measurements. Platform support tickets remain absent.

## Phase 5 operations implementation

Operations extends the existing business workspace, identity checks, Firestore and Express backend. No second auth system, worker infrastructure, runtime dependency or database is introduced. All new staff routes are below `businesses/:businessId/operations` and pass the same verified active-business membership middleware. Owners/managers manage settings, articles, SLA checks, rule retries and feedback reports. All active business members can read staff knowledge, their notifications and team roster; only the existing Business Owner endpoint changes memberships. Platform roles do not gain business access.

Business-owned records are nested below `customerOperationsBusinesses/{businessId}`: `operations/settings`, `articles`, `automationRuns`, `notifications`, `notificationReads`, `notificationPreferences`, `surveys`, `deadlineChecks` and `operationsAudit`. There are no nullable tenant IDs. Customer-visible knowledge requires both published status and customer visibility and a valid existing conversation link for that business. Internal/draft articles never enter that response. Articles are plain text, rendered with React escaping. Settings/article audit records are append-only; notification read acknowledgements and preferences are private per identity.

Ticket creation, lifecycle changes and customer replies invoke operations within their existing Firestore transaction, before any writes. Trigger/condition/action rules use a fixed allowlist; no code evaluation. Up to 20 rules execute in configured order. Assignment only applies to an unassigned ticket and reads active membership in the same business within the transaction. Failures and skips are recorded; a manager can retry a failed assignment after correcting membership/configuration. Retry effects use a deterministic run marker. Run history records rule, trigger, target, result, error, actor and timestamp. Notifications and runs commit with the ticket, so transaction retries cannot send duplicate effects. There are no external email/WhatsApp automation side effects in Phase 5.

A business default resolution SLA uses calendar minutes (5–43,200; default 1,440), snapshotted when a ticket is created or reopened. An explicit check processes up to 50 deadlines with a cursor, generates one approaching alert within 15 minutes and one breach alert when due, and executes matching SLA rules. The app has no scheduler: deadline checks are on demand from Operations, not autonomous background alerts. Notification lists poll every 30 seconds while visible; customer resources poll every 60 seconds. Deadline markers and event IDs make repeated checks idempotent. Resolved/closed tickets stop active deadline checks; historical targets remain for reporting. Priority-specific policies, business hours, pause calendars and a hosted scheduler remain future work.

Surveys are opt-in. A resolution event creates at most one durable survey; its current ID is held by the ticket. A customer with that ticket's valid linked conversation can read the prompt and submit a 1–5 score, resolution answer and optional comment. The submission transaction revalidates token hash, expiry, business, customer and ticket relationship. Identical retries return success; conflicting second answers return 409. Reopening clears the active survey reference without deleting past feedback. Surveys are offered in the customer page; no repeated survey emails are sent.

Phase 6 now consumes the new SLA target, reopen counter and survey records. Legacy records without instrumentation remain excluded with sample counts. SLA reports describe the latest cycle; survey cohorts use survey creation dates rather than ticket creation dates. In-app staff replies and successful email deliveries now record first-response timestamps on linked tickets. The knowledge/operations functionality here is business-scoped; platform support tickets and platform knowledge publishing were not present in the upstream phases and are not implied by this implementation.

## Studio integration and Super Admin authority

Customer Support is now a tab rendered **inside the Studio shell**, using the same header, verified Firebase session, Super Admin badge, Studio access controls and theme. The nested `/studio/customer-operations` route renders `StudioPortalApp` with its Support view; the support workspace is embedded without a second application header or sign-in control. Support-only business/platform members can use that nested view without receiving Studio submissions, outbox or invitation-management privileges.

Studio and Customer Support use the same server-side `isStudioSuperAdmin` decision and bound owner UID. The existing Studio Super Admin automatically receives Support platform administration, business registration, agent/invitation management and platform reporting. Ordinary Studio administrators or support agents are not promoted to Super Admin by the UI.

To administer private business records, the Super Admin explicitly opens a business session with a 10–500-character purpose. The server stores a UID- and business-scoped 30-minute grant in `customerOperationsAdminSessions`. Each privileged business API request rechecks the grant, expiry and active business state in a transaction and appends its purpose/method/path to `customerOperationsAuditLogs`. Query strings and request bodies are not copied into those audit records. The session enables the existing owner-level support operations for that one business; other businesses remain denied. Closing/expiring the grant or suspending the business removes access. Platform Support Agents cannot open these sessions.

Sessions are nested under a hashed owner UID at `customerOperationsAdminSessions/{ownerKey}/businesses/{businessId}`. Expiry queries use the automatic single-field index, so opening Support does not require a new composite index. The existing Firestore default-deny rule had an invalid `allow read, write: false` statement; it is corrected to `allow read, write: if false`, preserving the intended access restriction. No production rules or data were changed during validation.
