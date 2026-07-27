# Financial permissions

Backend tenant/project scope is authoritative.

- `estimate.read` exposes customer-facing values.
- `financial_margin.read` additionally exposes purchase price, cost, and margin.
- `bank_information.read/update` is separate from supplier access; normal supplier responses omit bank references.
- `estimate.approve` is separate from create/update, and a creator cannot approve their own version.

Money is PostgreSQL/Prisma `Decimal` and API input uses decimal strings. Payment, discount, stock-adjustment, and goodwill permissions remain outstanding with their vertical slices.
