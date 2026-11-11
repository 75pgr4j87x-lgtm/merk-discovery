# Customer Operations final verification — 2026-11-11

> Historical audit of the earlier checkpoint. A subsequent completion pass is in progress; consult the current checkpoint in CUSTOMER_OPERATIONS_PROGRESS.md. No later code changes establish live acceptance by themselves.

## Verdict

**The application builds and runs inside the cloud workspace, but all six phases are not complete against the attached master build prompt.** Existing implementation and fixture test success must not be presented as end-to-end acceptance or complete production functionality. Authentication is a prerequisite for live acceptance, but it is not the only remaining work.

This audit inspected the current local `dev` work, executed the existing checks again, and launched a fresh production server. It did not modify authentication, disable security, deploy indexes, invoke external providers or write production data.

## Execution results

| Check | Outcome |
|---|---|
| `npm run test:customer-operations` | PASS: 15 tests; zero failures/skips |
| `npm run lint` | PASS |
| `npm run build` | PASS; existing large main-bundle warning |
| `git diff --check` | PASS |
| Operations browser fixture suite | PASS: rules/settings, retry, article save and error recovery, team UI, mobile width, feedback/knowledge |
| Reports browser fixture suite | PASS: populated/empty/error, keyboard, date labels, tables, mobile width, escaped category text |
| Fresh production server: `PORT=3100 npm start` | Started successfully |
| Real production Chromium: `/`, `/studio/customer-operations`, `/customer-operations/conversations` | HTTP 200, visible application content; zero page JavaScript errors |
| Protected API configuration gates | 15 requests returned the expected 503 “platform administrator is not configured” with private/no-store headers |
| Public conversations/survey/knowledge without bearer token | All 3 returned 404 |
| Actual Firebase identity, indexed queries and real two-tenant workflows | NOT RUN; platform administrator configuration absent; no selected isolated development Firebase project verified |
| Email/WhatsApp provider delivery and webhook acceptance | NOT RUN; corresponding live integrations unavailable/incomplete |
| Production-scale load, screen reader and human UAT | NOT RUN |

Store tests use an in-memory transactional model. HTTP tests inject verified-identity/store fixtures. Browser feature suites intercept requests in the test browser. These are useful isolated checks, not tests of live Firebase credentials or Firestore indexes. The deliberately injected report database failure logs an error during an expected passing test.

Development browser fixtures report a Vite HMR websocket warning. The fresh production run does not use HMR and produced no JavaScript page errors. This distinguishes the observed development transport warning from production application rendering; it does not establish user-facing network access.

## Phase-by-phase requirements audit

| Phase | Implemented evidence | Missing or unverified |
|---|---|---|
| 1 — Foundation | Existing Firebase identity checks, business/platform roles and directory, business membership scoping, native workspace navigation, audit records and Firestore model | Invitation delivery/claiming, UID-bound membership lifecycle and live access/revocation/suspension acceptance. The platform workspace has business registry/agent administration, not the full platform support inbox/ticket workflow. |
| 2 — Customers and Tickets | Customer CRUD, notes/activity; ticket references, assignments, transitions, history, prefix search and paginated lists | No authenticated Firestore CRUD/lifecycle or real cross-tenant acceptance has run. Exact query indexes must be deployed/verified. Contact values are not verified identities; automated merging is intentionally absent. |
| 3 — Unified Inbox and In-App Messaging | Persisted conversation messages, internal/customer visibility, ticket relationship, expiring/revocable hashed bearer links, customer reply page | Relationship is one-to-one for linked tickets, not the required many-to-many model: `createCustomerOperationsConversation` uses the ticket ID as conversation ID and rejects a second conversation. Attachments remain deferred. Inbox has manual refresh only, with no automatic polling/realtime fallback. Existing authenticated customer-session messaging, concurrent-agent handling and retried-message idempotency are not implemented to the brief. |
| 4 — External Channels | Outbound SMTP message/status/retry boundary, secure web reply links, manual phone call logs, official-provider-only WhatsApp interface/disconnected capability | Inbound email ingestion, reliable provider/header threading, attachments, verified/idempotent WhatsApp webhooks, templates and delivery/read mapping are absent. Actual SMTP delivery/retry is unverified. Provider credentials alone do not implement the missing endpoints. |
| 5 — Operations | Business-scoped transactional rules, execution history/failed assignment retry; notifications/preferences; calendar-minute SLA and paginated on-demand checks; draft/published knowledge; opt-in immutable feedback; existing-owner team controls | No unattended SLA scheduler. Team routing is a label, not team membership groups. Platform-wide knowledge publishing/operations are absent. Live transactional behavior, index deployment and authenticated two-business acceptance remain unverified. |
| 6 — Reporting, AI and Hardening | Bounded tenant-scoped ticket/SLA/reopen/satisfaction reports; disconnected optional AI provider contract; selected privacy/access hardening; 15 isolated tests and targeted browser checks | Platform support analytics have no underlying platform-ticket model. Full live tenant-isolation coverage across all record types, public-message replay/rate-limit controls, broad security review, performance targets, screen-reader testing and human UAT remain incomplete. AI is intentionally disconnected; the interface/status is permitted by the brief when no provider is approved. |

### Specific code evidence

- `serverStore.ts`: `createCustomerOperationsConversation` sets `conversationId = input.ticketId || randomUUID()` and rejects an existing conversation for that ticket. There is no `conversation_tickets` relationship collection.
- `src/components/CustomerOperationsInbox.tsx`: effects load on selection/filter changes and a manual `refresh` helper; no `setInterval` or realtime subscription exists for the inbox.
- `src/types/customerOperations.ts`: WhatsApp has a send-only provider contract and capabilities explicitly report disconnected; no verified webhook processing exists for Customer Operations.
- `customerOperationsOperations.ts`: deadline checks execute only when requested; notifications poll independently and do not run the deadline job. Business knowledge is under the business root; no platform knowledge publishing exists.
- `server.ts`: Customer Operations identity resolution stops with 503 when `STUDIO_OWNER_EMAIL` is absent. Bearer-link public resources remain protected separately.
- Customer Operations message writes use new UUIDs per request without an idempotency key; public Customer Operations endpoints do not have their own rate-limit implementation. Existing BetaDesk rate limiting/idempotency does not automatically protect Customer Operations.

## Why the user could not open localhost

`127.0.0.1`/`localhost` refers to whichever computer runs the browser. The responding servers and successful Chromium checks are **inside the cloud executor**, not on the user's computer. A localhost URL in a personal browser does not connect to this executor without a supported desktop/forwarding route.

The current environment reports remote desktop enabled with unknown state. This chat exposes no desktop-control or `open_in_codex` tool, so shared Chrome navigation/viewer reachability could not be exercised. No reachable public preview was created or verified. User-facing browser access remains unresolved; earlier instructions to open localhost should not be treated as a confirmed preview path. The internal HTTP and production-browser checks establish that the application process itself runs.

## Completion order

1. Establish a supported user-visible browser/port-forwarding path or run the checkout on the user's local machine.
2. Complete the planned authentication/invitation/UID/membership work using an explicitly selected non-production Firebase project; deploy and verify indexes.
3. Run real owner/manager/agent/platform/customer acceptance with two businesses. Exercise CRUD, notes, messages, token expiry/revocation, feedback and reports; attempt cross-tenant IDs, queries and payloads.
4. Complete the remaining inbox relationship/refresh/concurrency/idempotency controls and the deferred attachment decision.
5. Implement the missing external channel ingestion/webhook boundaries and test official providers when configured.
6. Finish platform support/knowledge/reporting scope, scheduler requirements and release security/performance/accessibility/UAT checks.

Runtime evidence and a real sign-in-screen screenshot are saved outside the checkout under `/workspace/phase-verification/`. No claim of user-browser reachability, live provider success or complete phase acceptance is made.
