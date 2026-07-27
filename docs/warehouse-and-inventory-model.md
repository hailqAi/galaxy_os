# Warehouse and inventory model

Status: `PARTIAL`.

Warehouse Master and partial Inventory operations are implemented with
organization/project scope. InventoryTransaction is immutable and idempotent;
InventoryBalance projects on-hand, available, reserved, in-transit,
quality-hold, damaged, issued and installed quantities in Serializable
transactions. Receipt stock enters quality hold, QC releases or damages it,
and reservations, transfers, issues, returns, adjustments and cycle counts
reuse the same posting command.

New transaction idempotency keys are bound to a payload hash. Legacy
transactions retain metadata-based retry validation.

The implementation must distinguish on-hand, available, reserved, in-transit, quality-hold, damaged, and issued quantities. Receipt and stock movement must update immutable transactions and balances atomically. Quality-hold stock cannot become available, and project reservations cannot be consumed elsewhere without an audited override.

Remaining before `COMPLETE`: database-level concurrency and authorization E2E,
approved excess-receipt workflow, evidence upload controls, per-serial partial
QC decisions, richer operation detail screens and complete Project summaries.
