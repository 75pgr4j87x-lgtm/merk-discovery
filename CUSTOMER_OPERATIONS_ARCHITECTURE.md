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
- Internal customer and ticket notes are stored separately from customer profiles and tickets and are returned only from authenticated business-agent routes. The activity stream records that a note was added, never its body. There are no customer-facing APIs in this phase.
- Ticket events retain status, assignment, priority, tag, and other permitted field changes without overwriting prior event history. Resolution time is set on resolve and cleared on reopen; the event history records the status transitions.
- Customer and ticket lists are limited and cursor-paginated. Prefix searches are tenant-scoped; Firestore composite indexes for the actual list/search patterns are declared in `firestore.indexes.json`.

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

Business records require an active membership in the exact business. Platform Super Admins and Platform Support Agents are denied these data endpoints. Agent assignment is validated against active membership and rechecked inside the Firestore transaction. Ticket status transitions are validated in the transaction to prevent concurrent updates from bypassing the lifecycle rules.

## Phase status and planned phases

1. Foundation — access model, tenant boundaries, route, base navigation and workspace setup.
2. Customers and Tickets — tenant-scoped profiles, ticket lifecycle, notes and history. **Implemented locally; validate against non-production Firestore.**
3. Unified Inbox and In-App Messaging — explicit conversation/ticket relationships, customer-safe messaging and private attachments.
4. External Channels — configured email, official WhatsApp provider boundary and call logs.
5. Operations — notifications, automation, SLAs, knowledge base, feedback and business team workflows.
6. Reporting, AI and Hardening — tenant-scoped reporting, optional provider interfaces, security and acceptance testing.
