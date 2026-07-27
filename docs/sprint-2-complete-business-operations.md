# Sprint 2 — Complete Business Operations

Status: in progress; do not tag or release.

Implemented in the working tree through partial vertical slices: Proforma
Invoice, supplier payables/payments, and Production Tracking in addition to the
previously reported commercial and procurement modules. Tenant-scoped payment
idempotency, maker-checker approval, Serializable allocation, immutable
technical revisions, sample decisions, quality reports, and packing records
are present.

Routes include `/catalog`, `/partners`, `/procurement/requests`, `/procurement/rfqs`, `/procurement/supplier-quotes`, `/procurement/comparisons`, `/procurement/purchase-orders`, and the corresponding project and API routes.

Migrations currently run through
`20260727190000_add_inventory_operations` (38 applied locally).

Logistics/Customs/Landed Cost, Warehouse Master and Inventory operations are
partial working slices. Not completed: inventory hardening;
installation/inspection/handover; warranty/service; the queued large import
worker; operational dashboards; final Project Workspace integration; and the
full business E2E/authorization matrix. PI, supplier payables, and production
remain `PARTIAL` until their missing integration and authorization evidence is
implemented. See `docs/sprint-2-completion-audit.md`.

Production still needs S3-compatible storage, malware scanning, SMTP, and external integration credentials.
