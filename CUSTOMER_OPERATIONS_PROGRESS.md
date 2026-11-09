# Customer Operations progress

## Phase status

| Phase | Status |
|---|---|
| 1 — Foundation | Implemented and validated locally; awaiting Firebase-backed access-flow checks |
| 2 — Customers and Tickets | Implemented locally; requires non-production Firestore indexes and authenticated acceptance tests |
| 3 — Unified Inbox and In-App Messaging | Implemented locally; Firebase-backed acceptance pending. Attachments deferred at user request. |
| 4 — External Channels | Implemented locally; SMTP/provider/Firebase acceptance pending. WhatsApp provider activation awaits provider choice/configuration. |
| 5 — Operations | Not started |
| 6 — Reporting, AI and Hardening | Not started |

## Phase 1 delivered

- Inspected the existing React/Vite, Express, Firebase Auth, and Firestore architecture.
- Added independent Customer Operations platform and business role types and Firestore-backed membership/business records.
- Added server-side verified-identity authorization, business membership scoping, platform administration APIs, and transactional audit records.
- Added `/studio/customer-operations` with platform overview, business setup, Support Agent management, and business workspace selection.
- Added an entry link in the existing Studio portal.
- Kept Studio, BetaDesk, business, and platform access roles separate. No fake customer data or metrics are shown.
- Added architecture, implementation, and progress documentation.

## Phase 2 delivered

- Added business-scoped customer records, editable profiles, status/tags/ownership, timeline activity, and private customer notes.
- Added business-scoped tickets with sequential tenant-specific references, priority, category, tags, assignment, lifecycle timestamps, and transactional creation.
- Added ticket status transitions, assignment validation, internal-only ticket notes, and append-only ticket history.
- Added paginated customer/ticket lists with tenant-scoped prefix search and status/priority filters.
- Denied platform roles access to business customer and ticket data; business membership is required for every operation.
- Added Firestore composite indexes and business workspace navigation for Customers and Tickets.

## Phase 3 delivered locally

- Added a business-scoped inbox with customer conversations and explicit optional ticket relationships.
- Added transactional message writes, customer-visible versus internal-only visibility, and open/closed conversation status.
- Added random, conversation-scoped customer links that store only token hashes, expire after seven days, and can be rotated or revoked.
- Added a public customer reply page that only returns customer-visible messages and accepts only customer-visible replies.
- Added inbox navigation, conversation creation, customer link copy/revoke controls, message history, and status filters.
- Deferred attachment upload and storage as requested; outbound email delivery remains part of Phase 4.

## Phase 4 delivered locally

- Added outbound SMTP email delivery for customer-visible inbox messages, including the secure expiring reply link.
- Persisted email delivery state and error details, omitted failed outbound email from the customer's public conversation view, and added a retry route and UI action.
- Added a server-reported channel capability endpoint; SMTP credentials remain server-only and no provider settings are exposed to the browser.
- Defined a vendor-neutral `CustomerOperationsWhatsAppProvider` contract for official providers. WhatsApp sending is explicitly unavailable until an official provider is selected and configured; no unofficial gateway is used.
- Added tenant-scoped call logs with inbound/outbound direction, outcome, duration, phone number, summary, authenticated agent, and customer activity updates. No audio is recorded or stored.

## Changed files

- `server.ts`
- `serverStore.ts`
- `serverEmailAndExcel.ts`
- `src/App.tsx`
- `src/components/CustomerOperationsApp.tsx`
- `src/components/CustomerOperationsBusinessWorkspace.tsx`
- `src/components/CustomerOperationsInbox.tsx`
- `src/components/CustomerOperationsCustomerConversation.tsx`
- `src/components/CustomerOperationsCallLogs.tsx`
- `src/components/studio/StudioPortalApp.tsx`
- `src/types/customerOperations.ts`
- `firebase.customer-operations.json`
- `firestore.indexes.json`
- `CUSTOMER_OPERATIONS_ARCHITECTURE.md`
- `CUSTOMER_OPERATIONS_IMPLEMENTATION.md`
- `CUSTOMER_OPERATIONS_PROGRESS.md`

## Validation and known limitations

- `git diff --check`: passed.
- `bun run lint`: passed after Phase 4 changes.
- Firestore index JSON validation: passed.
- `bun run build`: passed (Vite reports the pre-existing large-chunk advisory).
- Local smoke tests: `/studio/customer-operations` and `/customer-operations/conversations` returned HTTP 200; an empty public conversation token returned HTTP 404 as expected.
- Protected customer/ticket/inbox/call endpoints return HTTP 503 because `STUDIO_OWNER_EMAIL` and Firebase server credentials are not configured in the current local environment; authenticated Firestore behavior has not been exercised. SMTP delivery and the email retry lifecycle have not been tested with a configured mail server. WhatsApp remains disabled pending provider configuration.
- Firestore schema is created on first write; Phase 2–4 query indexes must be deployed to the isolated development Firebase project before functional acceptance testing.
- Membership invitation delivery and UID claim are not yet implemented. Use a non-production Firebase project for local testing.
- Authenticated data workflows and cross-tenant access attempts still need acceptance testing against a non-production Firebase project.
- Phase 1–2 are on the remote `dev` branch. Phase 3–4 changes are local and uncommitted; nothing has been deployed.

## Next actions

1. Configure Firebase server credentials and `STUDIO_OWNER_EMAIL` for a non-production project.
2. Deploy indexes with `firebase --config firebase.customer-operations.json deploy --only firestore:indexes --project <dev-project-id>`.
3. Test role access, customer/ticket CRUD, assignments, status history, private notes, pagination, filters, and cross-tenant ID access.
4. Verify Phase 2 tenant isolation; test Phase 3 message visibility/link expiry and Phase 4 SMTP delivery/retry/call-log isolation against non-production Firebase and SMTP configuration.
