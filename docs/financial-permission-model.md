# Financial permissions

Backend tenant/project scope is authoritative.

- `estimate.read` exposes customer-facing values.
- `financial_margin.read` additionally exposes purchase price, cost, and margin.
- `bank_information.read/update` is separate from supplier access; normal supplier responses omit bank references.
- `estimate.approve` is separate from create/update, and a creator cannot approve their own version.
- `supplier_payment.approve` is separate from record/allocation; the recorder
  cannot approve their own payment.
- Supplier-payment idempotency is unique per organization, never globally
  reusable across tenants.

Money is PostgreSQL/Prisma `Decimal` and API input uses decimal strings.
Supplier allocation uses a Serializable transaction. Stock-adjustment and
goodwill permissions remain outstanding with their missing vertical slices.
