# Sprint 0 — Foundation

## Goal

Provide a reproducible, testable base for later Galaxy OS ERP work without implementing business functionality.

## Deliverables

pnpm monorepo, Vietnamese web shell, versioned NestJS health/readiness API, empty Prisma/PostgreSQL foundation, Redis local service, inactive FastAPI placeholder, CI, and operating documentation.

## Acceptance

Root install, lint, typecheck, focused tests, and builds pass; runtime endpoints and database readiness are verified where Docker is available; no secrets, business modules, or unused production dependencies exist. Exact results belong in `PROJECT_STATUS.md`.
