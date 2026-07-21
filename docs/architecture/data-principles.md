# Data principles

- Use UUID identifiers for future business entities.
- Store timestamps in UTC and localize only at presentation boundaries.
- Store money as database decimals with explicit currency; never use floating point.
- Make approved business-document versions immutable.
- Apply financial state changes transactionally.
- Add deletion behavior only for an approved business requirement; no global soft delete.
- Add fields and tables only after business approval.

Sprint 1 identity/access records use UUIDs, explicit lifecycle statuses, organization-scoped uniqueness, foreign keys, and archival/disable operations instead of hard deletion. Normalized email is globally unique. Audit logs are append-only, and multi-record mutations are transactional.
