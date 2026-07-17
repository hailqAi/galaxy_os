# Data principles

- Use UUID identifiers for future business entities.
- Store timestamps in UTC and localize only at presentation boundaries.
- Store money as database decimals with explicit currency; never use floating point.
- Make approved business-document versions immutable.
- Apply financial state changes transactionally.
- Add deletion behavior only for an approved business requirement; no global soft delete.
- Add fields and tables only after business approval.

Sprint 0 deliberately defines no business models.
