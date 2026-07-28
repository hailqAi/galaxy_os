# Installation, handover, and warranty workflow

Status: `PARTIAL`.

Installation plans and readiness-gated work orders reuse Production approvals,
Inventory reservations, Stock Issues and the immutable Inventory posting
command. Inspection decisions can create Punch Items; accepted inspections and
completed handover checklists gate handover. Handover completion creates
policy-snapshot Warranty Assets idempotently. Service Tickets enforce
project/customer scope, resolution evidence and customer confirmation.

Remaining before `COMPLETE`: team/site-delivery/site-issue commands, versioned
generated handover documents, manual warranty registration and expiry worker,
replacement inventory commands, notifications and browser authorization
coverage. Uploaded Handover Documents are versioned, checksummed and
immutable after completion; Service Visit and Warranty Claim transitions are
implemented.
