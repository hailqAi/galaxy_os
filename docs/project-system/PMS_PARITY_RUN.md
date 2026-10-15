# PMS parity, estimate, and risk implementation plan

**Goal:** Deliver one verified Project slice: Stage 2 estimate calculations and
approval use the existing Estimate domain, while one Project risk register can
fund an estimate revision without duplicate contingency.

**Architecture:** Keep Project, Product Register, Estimate, Quotation, Contract,
Task, FileAsset, Approval, and IAM as the canonical records. Add only the missing
Project-risk and estimate-risk-allocation persistence, expose it through
Project-scoped APIs, and render real records inside the existing shared Project
workspace.

**Tech stack:** NestJS, Prisma/PostgreSQL Decimal, Next.js/React, Vitest,
Playwright.

**Spec:** Current user-approved PMS parity requirements in this run.

## Constraints

- The earlier quota/status gate is superseded by the user's 2026-09-10
  continuation instruction. No quota guarantee is claimed because no usage
  telemetry was available.
- Preserve the dirty `feature/project-business-operations` worktree; do not
  commit, push, reset the database, rewrite migrations, or add dependencies.
- Backend authorization remains authoritative. Approved estimate revisions are
  immutable and financial fields are permission-filtered.
- Stage 2–5 remain directly reachable. Reference behavior is adapted to Galaxy
  domains and never copied as legal policy or mock business data.
- One main agent; targeted reads/tests first, broad verification at handoff.

## Current evidence and parity gaps

| Reference                     | Behavior/evidence                                                                                                                                                                                   | Galaxy now                                                                                                           | Gap                                                                             | This slice                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Dashboard and GĐ1–GĐ5         | **NOT_VERIFIED:** fresh public login page rendered in Playwright; authenticated reference navigation awaits explicit credential-egress approval. Prior read-only audit identifies all stage groups. | **VERIFIED:** shared header and direct stage routes passed Project Playwright.                                       | Fresh authenticated reference parity remains unverified.                        | Preserved navigation; added the shared Project risk route.                   |
| GĐ2 — detailed plan/resources | **OBSERVED:** prior live audit recorded baseline table and documents.                                                                                                                               | **VERIFIED:** Step 1 persists Task baseline rows and supports XLSX preview/import.                                   | No timeline visualization exists.                                               | Removed the unsupported “Gantt” label; retained baseline workflow.           |
| GĐ2 — design/products/BOQ     | **OBSERVED:** prior live audit recorded design selectors, BOQ form/table, summary, files.                                                                                                           | **VERIFIED:** Product Register and Estimate are canonical and now render in the tab.                                 | Multi-line import/export and scenario UI remain.                                | Added explicit missing/provisional/confirmed price state and dated evidence. |
| GĐ2 — review/approval         | **OBSERVED:** prior live audit recorded reviewer, decision, comments, history.                                                                                                                      | **VERIFIED:** canonical estimate versions render in the approval tab; submit/approve/reload passed.                  | Technical/cost approval separation is not implemented.                          | Reused Estimate approval and immutable approved revision.                    |
| Project risk                  | **EXTERNAL_GUIDANCE:** Orange Book supports integrated identification, treatment, monitoring, and reporting.                                                                                        | **VERIFIED:** one Project register persists scored risks, explicit EMV, and one allocation per EstimateVersion/Risk. | Update/close/occurred workflow and evidence files remain.                       | Added Project-scoped API/UI/audit and financial redaction.                   |
| GĐ3–GĐ5                       | **OBSERVED:** prior live audit maps supplier/contract/payment/progress/log/handover/settlement/warranty groups.                                                                                     | **GALAXY_ADAPTATION:** canonical downstream domains remain behind route shells.                                      | Full orchestration, Gantt/journal, settlement, and cross-stage forecast remain. | No duplicate Contract/Product/Estimate/FileAsset model was introduced.       |

## Sources checked 2026-09-10

- GAO-20-195G product page: purpose/scope, technical baseline, WBS,
  assumptions, data, methods, sensitivity/risk, documentation, and updates with
  actual cost.
- GAO-16-89G product page: approved plan versus performance, dependencies, and
  cost impact of schedule slippage.
- HM Treasury Orange Book page updated 2026-07-29: risk management integrated
  with decisions; structured identification/assessment, treatment, monitoring,
  reporting, evidence, ownership, and continual improvement. It is guidance for
  its stated public-sector context, not a Galaxy certification or mandatory 5×5
  method.
- Chrome DevTools MCP configuration: `--executablePath` is supported. This
  session's connector cannot launch because Chrome Stable is absent; the
  installed Playwright Chromium works only with elevated sandbox permission.

## Executable tasks

- [x] Add RED calculation tests: margin/markup, missing price, sell versus buy
      quantity, parent/child exclusion, EMV, forecast, and duplicate contingency.
- [x] Implement the minimum Decimal calculation rules in the existing
      Commercial domain and persist source/completeness snapshots additively.
- [x] Add RED authorization/service tests for one Project risk register and a
      unique EstimateVersion allocation; implement Project-scoped API and audit.
- [x] Replace Stage 2 link/empty panels with canonical estimate, approval, and
      risk data; add focused component tests.
- [x] Run focused API/Web tests, Prisma validation, typecheck/lint, and
      `git diff --check`; fix the final Ponytail/correctness/security/authorization/
      UX review findings.
- [x] Run Playwright local acceptance and open desktop/mobile screenshots when
      the environment and authenticated reference access permit it.

## Checkpoint

- Status: **PARTIAL**. The estimate/risk vertical slice is implemented and
  browser-verified; complete PMS parity for GĐ3–GĐ5 is not claimed.
- Reference write operations: **NOT VERIFIED**; no safe TEST project was used.
- Chrome DevTools MCP: **BLOCKED** because Chrome Stable is absent from the
  configured executable paths. Playwright Chromium rendered the live reference
  login and Galaxy pages. Sending the supplied reference credential was denied
  by the approval reviewer pending an explicit credential-egress confirmation.
- Database: additive migrations
  `20260910120000_project_estimate_risk_register`,
  `20260910123000_widen_estimate_ratio_precision`, and
  `20260910124000_estimate_risk_integrity_constraints` applied; Prisma
  validates and all 68 migrations are current. No reset or `db push` occurred.
- Focused verification after final review fixes: API 35/35; full API 1052/1052;
  full Web 497/497. API/Web typecheck and lint pass (one pre-existing Web
  `<img>` warning); Prisma validates and reports all 68 migrations current. API
  and Web production builds pass.
- Browser: the final Flow B run passes 1/1 at 1536×864 with estimate source
  snapshot, explicit EMV, contingency allocation, reload, submit, second-user
  approval, and final reload. A separate final risk-layout run passes 4/4 at
  1536×864, 1440×900, 1280×800, and 390×844; its desktop/mobile screenshots
  were opened and checked.
  The full Project suite passes 29/35; six later viewport cases are blocked at
  login by accumulated auth rate limiting after the preceding serial logins,
  while their isolated viewport run passed.
- Final review fixes require target-scoped financial permission to create a
  cost estimate, redact every cost/markup/contingency field, exclude display-only
  parent rows from estimate and generated-quotation totals, serialize contingency
  writes against estimate transitions, ignore stale entered price when status
  is `MISSING`, and keep visible labels on financial inputs.
- Exact next action: obtain reference-login egress confirmation, finish the
  authenticated GĐ1–GĐ5 observation matrix, then implement GĐ3 contract/PO to
  GĐ4 commitment/actual/forecast without duplicating canonical records.
