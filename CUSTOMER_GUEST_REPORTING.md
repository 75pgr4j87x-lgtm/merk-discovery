# Guest issue reporting

In Customer Operations, open a business's Customers or Tickets tab. Under **Customer reporting link**, an owner or manager can enable reporting, copy the public business link, or preview the form. Existing businesses start disabled. Disabling intake stops new submissions without revoking existing conversation links.

Customers enter a name, subject and description without signing in or providing an email address. Submission atomically creates a separate guest customer, ticket, customer-authored first message, activity and ticket relationship. Existing ticket-created automation/SLA settings apply. Names are display labels, never identity credentials; people with the same name are not merged.

The confirmation provides a private seven-day conversation link. Customers must save it to return, reply, attach files, and use existing survey/help features. No email is sent by this flow. Initial attachments are added on the conversation page after submission. This is not an account-level list of all previous issues.

Public intake is rate-limited and only available for enabled, active businesses. Browser-generated 256-bit tracking secrets are sent in a header, stored only as hashes, and placed in the conversation URL fragment. Atomic submission receipts prevent duplicate records on retry and reject reuse for a different payload/business. Staff controls require existing business authorization; enable/disable changes are audited. Never publish a customer's private tracking link as the general reporting link.

Validation: 35 application tests, type check and production build passed. All 20 real Firebase-emulator end-to-end scenarios passed, including an anonymous browser submission, private-link reply, cross-business denial, replay behavior, and disabled-intake rejection. Live authenticated business enablement still requires the user's Studio session.
