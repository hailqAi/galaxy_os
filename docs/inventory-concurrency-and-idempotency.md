# Inventory concurrency and idempotency

Status: `PARTIAL`.

Inventory movement commands use Serializable Prisma transactions,
organization-scoped idempotency keys, immutable transaction lines and
payload hashes. Balance buckets are updated in the same transaction and
controlled buckets cannot become negative. Receipt, quality release,
reservation, transfer, issue, return, adjustment and cycle-count posting use
the shared posting command.

Mock-based integrity coverage passes. Real-database concurrent reservation,
issue, receipt, quality release, transfer receive, adjustment and cycle-count
tests remain required before this area is `COMPLETE`.

Historical migration checksum drift exists. Do not reset the database. New
migrations are generated with Prisma diff and applied using deploy.
