# Customer Operations progress

## Phase status

| Phase | Status |
|---|---|
| 1 — Foundation | Implemented and validated locally; awaiting Firebase-backed access-flow checks |
| 2 — Customers and Tickets | Implemented locally; requires non-production Firestore indexes and authenticated acceptance tests |
| 3 — Unified Inbox and In-App Messaging | Not started |
| 4 — External Channels | Not started |
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

## Changed files

- `server.ts`
- `serverStore.ts`
- `src/App.tsx`
- `src/components/CustomerOperationsApp.tsx`
- `src/components/CustomerOperationsBusinessWorkspace.tsx`
- `src/components/studio/StudioPortalApp.tsx`
- `src/types/customerOperations.ts`
- `firebase.customer-operations.json`
- `firestore.indexes.json`
- `CUSTOMER_OPERATIONS_ARCHITECTURE.md`
- `CUSTOMER_OPERATIONS_IMPLEMENTATION.md`
- `CUSTOMER_OPERATIONS_PROGRESS.md`

## Validation and known limitations

- `git diff --check`: passed.
- `bun run lint`: passed after Phase 2 changes.
- `bun run build`: passed (Vite reports the large-chunk advisory).
- Local route smoke test: `/studio/customer-operations` returned HTTP 200 and the SPA entry point.
- Protected customer/ticket endpoints returned HTTP 503 because `STUDIO_OWNER_EMAIL` and Firebase server credentials are not configured in the current local environment; authenticated Firestore behavior has not been exercised.
- Firestore schema is created on first write; Phase 2 query indexes must be deployed to the isolated development Firebase project before functional acceptance testing.
- Membership invitation delivery and UID claim are not yet implemented. Use a non-production Firebase project for local testing.
- Authenticated data workflows and cross-tenant access attempts still need acceptance testing against a non-production Firebase project.
- No changes have been pushed or deployed.

## Next actions

1. Configure Firebase server credentials and `STUDIO_OWNER_EMAIL` for a non-production project.
2. Deploy indexes with `firebase --config firebase.customer-operations.json deploy --only firestore:indexes --project <dev-project-id>`.
3. Test role access, customer/ticket CRUD, assignments, status history, private notes, pagination, filters, and cross-tenant ID access.
4. Proceed to Phase 3 only after Phase 2 tenant-isolation checks pass.
