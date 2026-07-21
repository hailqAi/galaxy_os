# ADR-002: ERP modular monolith

**Status:** Accepted

Implement ERP capabilities as NestJS modules in one deployable API. This keeps authorization, transactions, and operational ownership together. Split a service only after an observed independent scaling or isolation requirement.
