# Sprint 2 — Complete Business Operations

Status: in progress; do not tag or release.

Completed in the working tree: Marketing-off guards; project workspace redesign; Brand/Product/Variant/Supplier master data and UI; isolated supplier bank permission; Estimate approval with cost redaction; versioned Quotation lifecycle and documents; Contract, effective Appendix value history, receivable schedules and allocation; Purchase Request and Supplier RFQ lifecycles; Supplier Quotation review/revision; supplier comparison, split-line selection and approval; Purchase Order lifecycle; and a local streamed resumable upload adapter.

Routes include `/catalog`, `/partners`, `/procurement/requests`, `/procurement/rfqs`, `/procurement/supplier-quotes`, `/procurement/comparisons`, `/procurement/purchase-orders`, and the corresponding project and API routes.

Migrations currently run through `20260723240000_add_purchase_orders` (30 applied locally).

Not completed: PI/AP; production/logistics; warehouse/inventory; installation/inspection/handover; warranty/service; import worker; dashboards; pilots; and the full E2E/authorization matrix.

Production still needs S3-compatible storage, malware scanning, SMTP, and external integration credentials.
