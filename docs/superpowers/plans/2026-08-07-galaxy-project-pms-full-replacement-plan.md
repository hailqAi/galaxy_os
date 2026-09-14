# Galaxy Project PMS full replacement implementation plan

> **For agentic workers:** use `superpowers:subagent-driven-development` task by task. Every behavior change uses `superpowers:test-driven-development`; unexpected failures use `superpowers:systematic-debugging`; every vertical slice ends with verification, code review, Ponytail, screenshots, and a `PROJECT_STATUS.md` checkpoint.

**Goal:** Make the PMS-style portfolio and five-stage Project workflow the only default Project experience while preserving Galaxy OS domain records, IAM, financial controls, and audit history.

**Architecture:** Reuse `PortalShell`, `ProjectPmsShell`, Project scope, and existing business modules. Add only deterministic stage/applicability/gate orchestration or relations proven missing by a failing test. All five authorized stage roots remain navigable; an uninitialized stage is a real state-management view, while unfinished workstream actions remain absent. Compatibility redirects precede deletion of obsolete UI.

**Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Next.js App Router, React, Tailwind CSS, Vitest, Playwright.

## Global constraints

- Work on `feature/project-business-operations` and preserve every current uncommitted change.
- Do not commit, tag, push, create a PR, reset data, rewrite an applied migration, use `prisma db push`, or run `prisma migrate dev` if it requests a reset.
- The user explicitly overrides Superpowers' normal commit/worktree steps. Stay in the current dirty workspace and leave checkpoints uncommitted.
- Use a failing test before every behavior change and observe the expected failure.
- Reuse `BusinessEntityPolicy`, current permission keys, current domains, `api`, `PortalShell`, theme tokens, `ProjectPmsShell`, `EntityFiles`, `EntityActivity`, and `EntityComments`.
- Never copy Contract, PO, PI, Shipment, Inventory, Installation, Inspection, Handover, Warranty, FileAsset, Approval, Activity, Comment, Notification, or User records into new Project tables.
- Never expose financial data through markup, server page data, API, sorting, filters, search, exports, or aggregates without the exact permission.
- Use Decimal-safe database aggregation/string serialization; no fake chart, KPI, status, AI, signature, GPS, or sample business data.
- All five stage roots are always real links for an authorized Project user.
  Stage initialization/applicability state may be read-only, but no route is
  hidden or redirected because an earlier stage is incomplete. Workstream
  tabs/actions still require real backed behavior; no empty page or dead CTA.
- After each task: targeted tests, affected typecheck/lint, `git diff --check`, correctness/security/authorization/UX review, Ponytail diff review, and status update.

## Completed prerequisites

- Phase 0 secure command-key repair is complete in `apps/web/app/lib/create-command-key.ts` and its Stage 1 callers/tests.
- Live reference audit, cutover/deletion matrix, and the approved full replacement design are complete.
- The 2026-08-01 Shell/Stage 1 plan and 2026-08-06 summary-batch plan remain historical completed-slice records.

## 2026-08-08 continuation priority

The fresh audit found that the resumable `UploadSession` API and canonical Required Document/FileAsset workflow are disconnected. Execute Task 4E before the remaining older Task 4 Stage 1 field expansion. This is the earliest incomplete Phase 0/Stage 1 dependency and does not invalidate completed Tasks 1–4D.

## 2026-08-10 Phase 0 precedence

The approved 2026-08-10 usability prompt supersedes the prior next task. Task
4E is complete. Execute Tasks 4F and 4G before the older Task 4 field expansion
or any Stage 2–5 operational work. These tasks preserve the verified upload,
money, entry-stage, and always-open stage behavior.

### Task 4F: Central Vietnamese presentation and actionable Step 1 completion

**Files:**

- Create: `apps/web/features/projects/project-domain-labels.ts`
- Create: `apps/web/features/projects/project-domain-labels.test.ts`
- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Browser: `apps/web/tests/browser/project-stage-one.spec.ts`

**Interfaces:**

- `projectDomainLabel(kind, value, context?)` returns a Vietnamese user label
  for Project type, workstream, step, document, status, risk, role, readiness,
  stage, and context-aware boolean values. Unknown snake-case values are
  humanized without exposing the raw code and are logged only in development.
- `completeStep(..., 'ASSIGNMENT')` returns
  `{ completed, step, status?, checklist, blockers }`. Each checklist item is
  `{ code, label, satisfied, field?, section?, route?, remediation?, actionLabel? }`.
  `RESPONSIBILITY_NOTES_MISSING` uses Vietnamese copy and points to
  `responsibilityNotes`, section `assignment`, and
  `/projects/:projectId/stage-1#assignment`.
- The Stage 1 client renders the full completion checklist, disables repeat
  submission, preserves entered data, and focuses/scrolls the missing field
  from the direct corrective action. It does not print blocker codes or
  `Trạng thái máy chủ`.

- [ ] Write dictionary tests for every required Project type, workstream, Stage
      1 step, document, status, risk, role, boolean context, and a safe unknown
      fallback; assert known raw codes are absent from rendered Stage 1 output.
- [ ] Run the focused Web tests and observe raw-code/fallback failures.
- [ ] Implement the smallest typed dictionary and replace only Project-facing
      raw fallbacks in the shared shell and Stage 1 workspace.
- [ ] Write failing API tests for the assignment checklist and exact structured
      Vietnamese responsibility blocker metadata; preserve the already-complete
      idempotent response.
- [ ] Run the focused API test and observe the missing checklist/English blocker
      failure.
- [ ] Implement one checklist builder inside the current Stage 1 service; do
      not create a workflow/rules framework or change persistence.
- [ ] Write failing Web tests for `Bước này còn 1 nội dung cần bổ sung`, the
      complete checklist, absent generic server error/raw code, pending disable,
      and the corrective action focusing `responsibilityNotes`.
- [ ] Implement the checklist panel and direct focus using the existing Stage 1
      command/data owner. After save, refresh current Stage 1 data in place.
- [ ] Run focused API/Web tests, Stage 1 browser Flow A, Web/API typecheck,
      `git diff --check`, and independent correctness/security/authorization/
      UX plus Ponytail diff review.

### Task 4G: Semantic stage readiness and record-level related data

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.rules.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: focused Stage-access Web tests
- Browser: `apps/web/tests/browser/project-pms-stage-access.spec.ts`

**Interfaces:**

- Ordinary missing conditions/documents derive `NOT_STARTED` or `IN_PROGRESS`
  plus missing counts. `BLOCKED` is emitted only for a hard business blocker.
- Stage cards remain compact and use the centralized presentation dictionary.
- Generic stage reads return `relatedData` entries backed by real canonical
  Project relations. A missing entry names the record and canonical select/open
  route. They never return whole earlier-stage completion warnings.
- Stage 4 stays usable with incomplete Stage 1–3 and shows only useful missing
  Contract/PO/Supplier/package/location links supported by current data.

- [ ] Write failing rule/service/Web tests for the 8/11 + 0/12 incomplete case,
      no hard `BLOCKED`, compact missing counts, Stage 4 access with incomplete
      upstream stages, and record-level related-data warnings.
- [ ] Run focused tests and observe current whole-stage inheritance and status
      failures.
- [ ] Implement the smallest read-model changes by querying existing canonical
      relations in bounded form; add no schema or work-package model.
- [ ] Rename the panel to `DỮ LIỆU LIÊN QUAN`, remove earlier-stage messages,
      and render only real select/open actions.
- [ ] Run focused API/Web tests, Stage-access Flow C at both viewports,
      typechecks, `git diff --check`, and independent correctness/security/
      authorization/UX plus Ponytail review.

### Task 4E: Connect resumable upload to Project Required Documents

**Files:**

- Modify: `apps/api/prisma/schema.prisma` only if target/finalized-asset relations are proven impossible to persist safely with current fields
- Create: one additive reviewed migration only for proven missing relations/unique idempotency constraints
- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/src/projects/project-products.service.ts` only to reuse its canonical version-link command through a focused interface
- Modify: `apps/api/src/projects/project-products.test.ts`
- Modify: `apps/web/app/projects/[projectId]/documents/[requirementId]/page.tsx`
- Create: `apps/web/app/projects/[projectId]/documents/document-upload.ts` only if the tested upload state would otherwise enlarge the route component materially
- Test: focused Web Required Document upload tests and `apps/web/tests/browser/project-stage-one.spec.ts`

**Interfaces:**

- Initiation accepts a Project Required Document target and returns the actual backend size/extension/part contract without storage paths.
- Status returns uploaded part numbers/bytes and expiry so the same actor can resume after reload.
- Complete verifies checksum and idempotently creates/returns one canonical `FileAsset`; it links through the existing Required Document version flow and never deletes the previous version.
- Retry reuses the same session/parts; abort is terminal and leaves no linked asset; a completed session cannot be rebound to another target.

- [ ] Audit current upload storage/FileAsset adapters and write failing API tests for cross-Project target denial, actor ownership, resume/status, retry idempotency, abort, checksum failure, one-asset materialization, one attachment, and preserved document version history.
- [ ] Run the focused upload/Required Document tests and observe the missing target/materialization behavior.
- [ ] Implement the smallest adapter using the current local upload service, `FileAsset`, `EntityAttachment`, Project policy, and canonical document link/version logic. Add schema only when the failing contract proves an idempotent target/asset relation cannot be represented.
- [ ] Write failing Web tests for file selection, real limit/extension copy, progress, reload resume, retry, abort, current version, link completion, submit review, and Vietnamese errors.
- [ ] Implement the upload panel in the existing Required Document detail route; do not add a second Project files page or provider abstraction.
- [ ] Run focused API/Web tests, Project Product integration, Stage 1 browser upload flow, API/Web typechecks, Prisma checks when changed, and `git diff --check`.
- [ ] Request independent correctness/security/authorization/UX review and run Ponytail diff review before continuing to the remaining Task 4 fields.

## 2026-08-07 continuation precedence

The newly approved always-open navigation, `entryStage`, Stage 1 clarity,
finance normalization, and Vietnamese command requirements supersede the old
plan instruction to keep unfinished stage roots disabled. Execute Tasks 4A–4D
before the older Task 4 contract-expansion work below. Existing completed Tasks
1–3 remain accepted and are not repeated.

### Task 4A: Always-open stage semantics and entry-stage persistence

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260807150000_project_entry_stage_access/migration.sql`
- Modify: `apps/api/src/projects/project-stage.ts`
- Modify: `apps/api/src/projects/project-stage.test.ts`
- Modify: `apps/api/src/projects/projects.dto.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`

**Interfaces:**

- `CreateProjectDto.entryStage?: 'STAGE_1' | ... | 'STAGE_5'`, defaulting to
  `STAGE_1` in persistence.
- `Project.entryStage: ProjectStage` is the immutable creation entry unless an
  explicit authorized future command changes it.
- `ProjectStageState.status` remains the single stage-state source and accepts
  `NOT_INITIALIZED`, `NOT_APPLICABLE`, `BYPASSED_WITH_APPROVAL`,
  `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, and `DONE` through the existing enum.
- `initialStageStates(entryStage)` returns five rows: the selected entry stage
  is `IN_PROGRESS`; every other stage is `NOT_INITIALIZED`; no earlier stage is
  marked done.
- `visualProjectStage` treats navigation as read-only and continues to derive
  current stage from active/done state, falling back to `entryStage` before
  legacy phase.

- [ ] Write failing pure tests proving Stage 3 entry creates one active Stage 3
      and four not-initialized states, navigation input never changes current
      stage, Stage 4 can coexist with viewable Stage 1, and no earlier stage is
      fabricated as complete.
- [ ] Run `pnpm --filter @galaxy/api test -- project-stage.test.ts`; observe the
      missing entry-stage helper/signature failures.
- [ ] Write failing service/DTO tests proving default Stage 1, explicit Stage 3,
      invalid entry stage rejection, five state rows in the same create
      transaction, Project isolation, and returned `entryStage`/`currentStage`.
- [ ] Add only the enum values, `Project.entryStage`, and stage-decision audit
      columns (`decisionReason`, `decisionBy`, `decisionAt`,
      `decisionApprovalId`) to the existing models. Generate/review additive SQL
      only; do not alter or delete an applied migration.
- [ ] Implement the pure helper and Project create/read mapping. Use one typed
      stage-key conversion table; do not introduce a workflow engine.
- [ ] Run focused tests, Prisma format/validate, and `prisma migrate status`.
      Apply with `prisma migrate deploy` only after SQL review confirms no
      destructive statement or reset.
- [ ] Re-run the focused tests, Prisma validate/status, API typecheck, and
      `git diff --check`.

### Task 4B: Generic stage read, initialization, applicability decision, and bypass

**Files:**

- Modify: `apps/api/src/projects/projects.dto.ts`
- Modify: `apps/api/src/projects/projects.controller.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/api/src/access-control/business-entity.policy.ts` only if the
  existing Project predicate cannot be reused unchanged
- Modify: `apps/api/prisma/seed.mjs` and add a permission migration only if no
  current narrow Project permission safely authorizes bypass

**Interfaces:**

- `GET /projects/:id/stages/:stageKey` returns the actor-scoped Project header,
  entry/current stage, the requested state, template applicability, upstream
  warnings/direct routes, and permitted commands without financial data.
- `POST /projects/:id/stages/:stageKey/initialize` is idempotent; it changes only
  `NOT_INITIALIZED` to `IN_PROGRESS`, validates active owners, creates known
  template Required Document requirements without duplicates, and records one
  Activity.
- `POST /projects/:id/stages/:stageKey/decision` accepts
  `{ decision: 'NOT_APPLICABLE' | 'BYPASSED_WITH_APPROVAL', reason,
approvalId? }`; blank reason and missing permission fail before mutation.

- [ ] Write failing controller/service tests for Stage 1→Stage 5 read, Stage
      4→Stage 1 read, non-member non-disclosure, not-applicable read-only
      response, initialize retry deduplication, bypass permission/reason, audit
      fields, Activity, and unchanged current stage.
- [ ] Run `pnpm --filter @galaxy/api test -- projects.test.ts`; confirm the new
      routes/methods are absent.
- [ ] Implement one stage-key parser and reuse `visibleWhere`/existing Project
      policy. Reject client-supplied status/current-stage values.
- [ ] Reuse the existing Required Document unique key for idempotent defaults;
      when no approved template requirement exists for a stage, return an empty
      requirement set honestly instead of inventing document types.
- [ ] Re-run focused tests and API typecheck; verify unauthorized reads return
      the repository's existing non-disclosing not-found behavior.

### Task 4C: Always-open five-stage routes and initialization workspace

**Files:**

- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Create: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-2/page.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-3/page.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-4/page.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-5/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Browser: `apps/web/tests/browser/project-pms-stage-access.spec.ts`

**Interfaces:**

- `ProjectPmsStageSwitcher` always receives all five route destinations and
  never renders progression-disabled buttons.
- `ProjectStageAccess` renders the real shared Project header/switcher/context,
  requested state, upstream warnings, and `KHỞI TẠO GIAI ĐOẠN` or read-only
  not-applicable/bypassed state; it exposes no unfinished workstream CTA.
- `/projects/:id` redirects to `currentStage`, falling back to `entryStage`,
  then Stage 1; visiting a stage never invokes a mutation.

- [ ] Write failing Web tests for all five hrefs, no disabled stage control,
      initialization card, not-applicable read-only state, permission-hidden
      decision actions, warning links, and unchanged current-stage display.
- [ ] Run focused Web tests and observe missing routes/component behavior.
- [ ] Implement the shared access component and four thin route adapters. Keep
      Stage 1 on its current full workspace; do not add fake tabs, tables, or
      stage data.
- [ ] Add the Playwright Flow 0 regression: open Stage 1 and Stage 5 on a Stage
      1 Project, open Stage 1 on a Stage 4 Project, assert outsider denial, and
      assert no console/runtime error at both required viewports.
- [ ] Run focused Web tests, Web typecheck, route compatibility tests,
      Playwright Flow 0, open the captures, and run `git diff --check`.

### Task 4D: Stage 1 Vietnamese workspace, money normalization, and command semantics

**Files:**

- Create: `apps/web/app/projects/[projectId]/stage-1/money.ts`
- Create: `apps/web/app/projects/[projectId]/stage-1/money.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/projects/project-stage-one-approval.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`

**Interfaces:**

- `normalizeVietnameseMoney(value): string | null` accepts digits, canonical
  two-decimal strings, spaces, `₫`, and valid Vietnamese thousands separators;
  it rejects mixed letters, malformed separators/decimals, negatives, more than
  18 integer digits, and more than two decimal digits without using Number.
- DTO transforms `''` to `undefined`, uppercases currency, validates canonical
  values with Vietnamese field messages, and never exposes regex text.
- The service derives `preliminaryMargin = revenue.minus(cost)` with
  `Prisma.Decimal`; the request DTO no longer trusts a supplied margin.
- Stage 1 presents the six approved Vietnamese form sections and the exact
  `LƯU NHÁP`, `KHỞI TẠO LUỒNG DỰ ÁN`, `GỬI PHÊ DUYỆT GĐ 1`, and
  `HOÀN TẤT BƯỚC` actions with helper text and truthful availability.

- [ ] Write failing money-helper tests for every accepted/rejected value in the
      approved prompt and prove API payloads contain neither `₫` nor empty
      optional money strings.
- [ ] Write failing DTO/service tests for uppercase/default VND, Vietnamese
      field errors, Decimal-derived margin, conflicting supplied margin, null
      optionals, and financial permission omission.
- [ ] Run focused API/Web tests and record the expected raw-regex/serialization
      failures.
- [ ] Implement the smallest string normalizer, DTO transforms/messages, and
      server Decimal derivation; do not add a dependency or use floating point.
- [ ] Replace the English legends/labels/buttons in the existing connected
      Stage 1 root. Remove the top-level Stage 1 mini-app tab language while
      retaining deep links for bookmarks/notifications.
- [ ] Write/extend tests proving Save Draft does not initialize, Initialize is
      idempotent, Submit Review does not complete Stage 1, and Complete Step
      returns/displays structured blockers without blind navigation.
- [ ] Run Stage 1 API/Web/browser regressions, inspect the Stage 1 captures at
      both viewports, and perform correctness/security/authorization/UX and
      Ponytail reviews before continuing to the older Task 4 contract fields.

---

### Task 1: Deterministic five-stage mapping and current-stage Project presentation

**Files:**

- Create: `apps/api/src/projects/project-stage.ts`
- Create: `apps/api/src/projects/project-stage.test.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/web/app/projects/page.tsx`
- Modify: `apps/web/app/projects/page.test.ts`
- Modify: `apps/web/app/projects/project-dashboard.test.tsx`
- Browser: `apps/web/tests/browser/project-pms-dashboard.spec.ts`

**Interfaces:**

- `visualProjectStage(phase, stageStates)` maps all 14 historical phases to `STAGE_1`–`STAGE_5` and prefers a completed/current backend stage state without mutating history.
- Project list items return `currentStage`; existing dashboard aggregates and their authorization remain unchanged in this slice.
- `/projects` replaces raw legacy phase controls/cells with the five-stage presentation and approved dashboard hierarchy without adding cross-domain KPI queries yet.

- [x] Write pure failing tests for all 14 phase mappings, completed-stage advancement, invalid/unavailable state fallback, and no database mutation.
- [x] Run `pnpm --filter @galaxy/api test -- project-stage.test.ts`; observe missing helper failure.
- [x] Implement one typed lookup/helper; do not add a workflow abstraction.
- [x] Add failing service tests for Project list `currentStage`, including Project isolation and unchanged financial redaction/sort behavior.
- [x] Add failing Web tests for the exact title, banner, current-stage filter/table cell, Customer/PM/progress/health/action columns, existing permitted financial card, absent unauthorized financial markup, loading/empty/error/retry, pagination, and no fake chart.
- [x] Replace the legacy raw-phase UI with the smallest reference-matched dashboard composition in `page.tsx`; keep `/mine`, `/actions`, and `/alerts` behavior intact.
- [x] Write the browser test with real fixture/API data at both viewports; assert five-stage presentation, direct Project navigation, and no console/hydration error. Capture/open dashboard and empty/forbidden states.
- [x] Run focused API/Web tests, Web typecheck/lint, browser test, screenshot inspection, and review.

### Task 2: Expand Executive dashboard KPIs from existing authorized domains

**Files:**

- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/web/app/projects/page.tsx`
- Modify: `apps/web/app/projects/project-dashboard.test.tsx`
- Modify: `apps/web/tests/browser/project-pms-dashboard.spec.ts`

**Interfaces:**

- Dashboard returns real authorized counts/sums for contract value, receipts, receivable, payable, schedule health, pending approvals, critical flags, and due warranty/service where current schema and permissions support them.
- Missing authoritative data stays absent or an honest empty state; the chart renders only from real series.

- [x] Write failing service tests one KPI family at a time for actor scope, per-currency Decimal strings, and exact permission omission.
- [x] Add the minimum bounded aggregates over existing `Contract`, `CustomerPayment`, `CustomerPaymentSchedule`, `SupplierPayable`, `ProjectStageApproval`, `WarrantyAsset`, and `ServiceTicket` relations; do not add schema or a second reporting service.
- [x] Write failing Web tests for each permitted card, absent unauthorized markup, real red-flag/health treatment, and honest planned/actual empty/data states.
- [x] Extend the existing dashboard composition and browser fixture without changing five-stage mapping or portfolio list behavior.
- [x] Run focused API/Web/browser tests, screenshot inspection, financial/security review, and Ponytail.

### Task 3: Generalize the shared Project PMS frame without duplicating stage pages

**Files:**

- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`

**Interfaces:**

- `ProjectPmsShell` accepts `activeStage`, stage title, completed route destinations, stage-specific tabs/context selectors, and slots for summary/readiness/flags/main/documents/activity.
- Project header returns Customer, location, type, Sales owner, Project Director when implemented, PM, current stage, status, health, and handover date with permission-safe fields.
- `/projects/:projectId` resolves to the current accessible/applicable implemented stage, falling back to Stage 1.

- [x] Write the historical shell tests for active stage, exact real links,
      then-unavailable stage buttons, active tab treatment, stage-specific
      accents, context controls, no legacy query orchestration, and no dead CTA.
      Task 4C replaces the unavailable-button expectation.
- [x] Write failing service tests for the bounded shared header/workspace response and Project isolation.
- [x] Refactor the existing component props and stage switcher only enough to serve completed stages; keep Stage 2–5 disabled until their root route passes.
- [x] Keep one shared status pill/token source and one data load; do not create a second shell/theme.
- [x] Update the Project-root redirect only after current-stage destination availability is deterministically known.
- [x] Run shell/compatibility tests, Web/API typecheck, route smoke, both viewport captures, and review.

### Task 4: Complete Stage 1 contract and split the monolithic presentation

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create if the failing contract proves fields absent: `apps/api/prisma/migrations/20260807*_complete_project_stage_one_fields/migration.sql`
- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/test/project-stage-one.integration.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Create only the focused files justified by extracted responsibilities under `apps/web/app/projects/[projectId]/stage-1/`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify: `apps/web/tests/browser/stage-one.spec.ts`

**Interfaces:**

- Stage 1 initiation includes the approved identity, responsibility, scope, milestone, and permission-protected financial contract.
- `Project Director` references an active user; additional dates are explicit persisted columns only when no current Project/plan field represents them without loss.
- Existing Stage 1 command/gate/idempotency semantics remain unchanged.

- [ ] Add failing API/Web tests for Project Director and design-complete/order/production-ready/delivery/installation/handover dates, active-user validation, financial omission, and exact update/detail round trip.
- [ ] Audit `Project` and `ProjectStageOnePlan`; map existing fields first. Add the smallest additive columns/relation and reviewed SQL only for proven gaps.
- [ ] Run Prisma format/validate; review migration for additive statements only; use `prisma migrate deploy` after status confirms no reset.
- [ ] Add failing UI regression tests around each responsibility before extracting it from `project-stage-one.tsx`.
- [ ] Extract container/data-command ownership, initiation form, routing panel, step navigator/details, readiness/red flags/gate, and member modal only where it reduces the current section branching. Keep one source of client state.
- [ ] Make files/members/activity pages compose their existing canonical components directly; redirect `/edit` to initiation once equivalent edit behavior passes.
- [ ] Complete the approved five step detail fields, Required Document Matrix placement, approval history, structured blockers, and activity/comments.
- [ ] Extend Playwright Flow 1 for initiation → survey → proposal → finance → approval → gate, same-key retry, immutable approval history, direct URL isolation, upload, notification, and no console error.
- [ ] Capture/open overview, form/routing, matrix, each step, approval, red flags, member modal, and forbidden state at both viewports.
- [ ] Run Stage 1 unit/integration/browser regression, Prisma/Web/API checks, and reviews.

### Task 5: Deterministic Project applicability shared by Stages 1–5

**Files:**

- Create: `apps/api/src/projects/project-applicability.ts`
- Create: `apps/api/src/projects/project-applicability.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Modify only if CUSTOM storage is proven absent: Prisma schema plus one additive reviewed migration

**Interfaces:**

- `projectApplicability(projectType, customConfig?)` returns applicable stages/workstreams and required survey/finance/installation/Customer-commercial/closure controls for the eight approved templates.
- CUSTOM configuration accepts only supported enum values and is authorization/version controlled.

- [ ] Write failing table-driven tests for every approved template and each default-not-applicable rule.
- [ ] Implement one typed lookup plus validated CUSTOM overlay; reuse it from Stage 1 routing.
- [ ] Prove unknown types/config fields fail closed and do not silently enable workstreams.
- [ ] Add persistence only if current canonical type/config fields cannot retain approved CUSTOM behavior.
- [ ] Run focused rules, Stage 1 regression, Prisma checks if changed, and review.

### Task 6: Stage 2 planning, Product/Design/BOQ, review, and gate

**Files:**

- Create: `apps/api/src/projects/project-stage-two.controller.ts`
- Create: `apps/api/src/projects/project-stage-two.service.ts`
- Create: `apps/api/src/projects/project-stage-two.dto.ts`
- Create: `apps/api/src/projects/project-stage-two.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Create only if planning/design review state is not represented: additive Prisma schema/migration with focused integration test
- Create: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Create completed adapters under `apps/web/app/projects/[projectId]/stage-2/`
- Create: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`
- Reuse: `apps/web/app/projects/[projectId]/products/**`
- Reuse: `apps/web/app/projects/[projectId]/estimates/**`
- Reuse: `apps/web/app/projects/[projectId]/quotations/**`
- Reuse/test: `apps/api/src/projects/project-products.*`, `apps/api/src/commercial/**`, `apps/api/test/project-product.integration.test.ts`, `apps/web/tests/browser/product-acceptance.spec.ts`
- Browser: `apps/web/tests/browser/project-stage-two.spec.ts`

**Interfaces:**

- Stage 2 summary composes Project locations/Product lines/revisions/approvals, Estimates, Required Documents, owners, readiness, red flags, and gate blockers in bounded queries.
- Real routes are enabled progressively: `plan`, `design`, `locations`, `products`, `materials`, `measurements`, `boq`, `review`, `documents`.

- [ ] First inventory current Task/ProjectLocation/Product/Estimate/approval fields; write failing tests only for missing observable behavior.
- [ ] Implement the Stage 2 root and three main tabs using real adapters. Route Product and BOQ actions to canonical Product/Estimate detail pages.
- [ ] Add planning list/create/detail/edit only if backed by the existing Task relation or a proven minimal schedule relation; no fake Gantt.
- [ ] Add design/material/sample classification/approval state only if not safely represented by Product revisions/files/approvals.
- [ ] Enforce Project isolation and exact design/product/estimate/document permissions on summary and commands.
- [ ] Implement the gate: Stage 1 complete, applicable design/Customer/technical approvals, locations/configuration, approved Estimate, required documents, no critical blocker.
- [ ] Add API/database tests for partial quantities/revisions, immutable approvals, financial filtering, gate idempotency, Activity/Notification.
- [ ] Add Web tests for three tabs, Product Register integration, BOQ, review history, states, and unavailable unfinished subtabs.
- [ ] Run Playwright Flow 2 with real DB data; capture/open overview/form/table/matrix/review/red-flags/modal/forbidden at both viewports.
- [ ] Keep the Stage 2 root open throughout; only after acceptance enable its
      completed workstream tabs and replace the initialization-only main panel.

### Task 7: Stage 3 commercial, site readiness, Supplier selection, contracts/PO/PI, and gate

**Files:**

- Create: `apps/api/src/projects/project-stage-three.controller.ts`
- Create: `apps/api/src/projects/project-stage-three.service.ts`
- Create: `apps/api/src/projects/project-stage-three.dto.ts`
- Create: `apps/api/src/projects/project-stage-three.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Reuse: `apps/api/src/commercial/**`, `apps/api/src/contracts/**`, `apps/api/src/procurement/**`
- Create only if site-readiness observations are absent: additive Prisma model/migration and integration test
- Create: `apps/web/app/projects/[projectId]/project-stage-three.tsx`
- Create completed adapters under `apps/web/app/projects/[projectId]/stage-3/`
- Reuse Project commercial routes and global Project-filtered procurement routes
- Reuse/test: `apps/api/src/commercial/commercial.test.ts`, `apps/api/src/contracts/contracts.test.ts`, `apps/api/src/procurement/procurement.test.ts`
- Browser: `apps/web/tests/browser/project-stage-three.spec.ts`

**Interfaces:**

- Stage 3 summary references approved Estimate/Quotation/Contract/Appendix/payment terms, Project locations/site readiness, PR/RFQ/Supplier Quotations/Comparison/Selection, PO/PI, Required Documents, readiness/red flags/gate.
- Public-reference GPMB/household data is not copied; the Galaxy screen is site readiness.

- [ ] Write failing Project-isolation/financial-redaction tests for each composed domain before adding the summary.
- [ ] Build the commercial module from existing approved Estimate/Quotation/Contract data and canonical actions.
- [ ] Build site-readiness list/create/detail/edit with area/access/delivery/installation/electricity/storage/protection/document fields only after schema audit; validate external input and actor scope.
- [ ] Build Supplier package/selection orchestration from existing PR/RFQ/quote/comparison/selection/PO/PI records; preserve immutable selections and values.
- [ ] Implement Stage 3 gate with structured direct-route blockers and idempotent completion side effects.
- [ ] Add Web states, Required Documents, approval/history, package/Supplier context selectors, and no dead action.
- [ ] Run API/integration tests and Playwright Flow 3; capture/open required screens at both viewports.
- [ ] Keep the Stage 3 root open throughout; only after acceptance enable its
      completed workstream tabs and replace the initialization-only main panel.

### Task 8: Stage 4 contracts, payments, progress, execution logs, and gate

**Files:**

- Create: `apps/api/src/projects/project-stage-four.controller.ts`
- Create: `apps/api/src/projects/project-stage-four.service.ts`
- Create: `apps/api/src/projects/project-stage-four.dto.ts`
- Create: `apps/api/src/projects/project-stage-four.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Reuse: `apps/api/src/contracts/**`, `procurement/**`, `production/**`, `logistics/**`, `warehouse/**`, `inventory/**`, `installation/**`
- Create only if no canonical daily-log/milestone relation can represent required context: additive Prisma migration and integration test
- Create: `apps/web/app/projects/[projectId]/project-stage-four.tsx`
- Create completed adapters under `apps/web/app/projects/[projectId]/stage-4/`
- Reuse global Project-filtered production/logistics/inventory/installation routes
- Reuse Web: `apps/web/app/projects/[projectId]/contracts/**`, `apps/web/app/procurement/purchase-orders/**`, `apps/web/app/procurement/proforma-invoices/**`, `apps/web/app/finance/payables/**`, `apps/web/app/finance/supplier-payments/**`, `apps/web/app/production/**`, `apps/web/app/tasks/**`, `apps/web/app/logistics/**`, `apps/web/app/inventory/**`, `apps/web/app/installations/**`
- Reuse tests: contracts, procurement, production, tasks, logistics, inventory, warehouse, and installation service tests
- Browser: `apps/web/tests/browser/project-stage-four.spec.ts`

**Interfaces:**

- One bounded Stage 4 summary composes contract/PO/line, Customer/Supplier payment, production, QC, packing, shipment/customs, receipt/inventory, site delivery, installation/daily log, quantity, progress, red flags, and gate data.
- Payment fields and aggregates are independently permission-selected.

- [ ] Write failing tests for Project/package/contract/Supplier/area context isolation and each financial omission boundary.
- [ ] Implement the blue contracts tab using canonical contracts/appendices/lines and referenced production-to-acceptance quantities.
- [ ] Implement the green payment tab using `CustomerPaymentSchedule`/`CustomerPayment` and `SupplierPayable`/schedules/payments; preserve bank/evidence permissions and Decimal strings.
- [ ] Implement the purple progress tab from real milestones/events only; no baseline means an honest empty state.
- [ ] Implement the orange execution tab by reusing installation daily logs and authoritative quantity events; add only missing context fields proven by tests.
- [ ] Implement applicability-aware Stage 4 gate and structured blockers.
- [ ] Add direct URL/file/action authorization, immutable state, upload/activity/notification tests and Web states.
- [ ] Run Playwright Flow 4 and inspect all required screenshots at both viewports.
- [ ] Keep the Stage 4 root open throughout; only after acceptance enable its
      completed workstream tabs and replace the initialization-only main panel.

### Task 9: Stage 5 acceptance, settlement, archive, warranty/service, and closure gate

**Files:**

- Create: `apps/api/src/projects/project-stage-five.controller.ts`
- Create: `apps/api/src/projects/project-stage-five.service.ts`
- Create: `apps/api/src/projects/project-stage-five.dto.ts`
- Create: `apps/api/src/projects/project-stage-five.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Reuse: `apps/api/src/after-sales/**`, `contracts/**`, payment services, `files/**`, `inventory/**`
- Create only if closure decision/archive state is absent: additive Prisma migration and integration test
- Create: `apps/web/app/projects/[projectId]/project-stage-five.tsx`
- Create completed adapters under `apps/web/app/projects/[projectId]/stage-5/`
- Reuse: Project inspections/handover/warranty routes
- Reuse Web: `apps/web/app/projects/[projectId]/inspections/**`, `handover/**`, `warranty/**`, `apps/web/app/after-sales/**`
- Reuse tests: `apps/api/src/after-sales/after-sales.test.ts`, `contracts.test.ts`, `procurement.test.ts`, `files.test.ts`, and `projects.test.ts`
- Browser: `apps/web/tests/browser/project-stage-five.spec.ts`

**Interfaces:**

- Stage 5 summary composes Inspection/Acceptance/Punch/Handover, settlement, FileAsset archive metadata, Customer/Warranty Assets, Service Tickets, Required Documents, readiness/red flags, and closure blockers.
- Closure is audited, idempotent, permissioned, and rule-gated; approved/signed evidence remains immutable.

- [ ] Write failing tests for acceptance/handover Project isolation, financial settlement omission, archive confidentiality/download, warranty/service scope, and every closure blocker.
- [ ] Implement three real tabs through canonical routes/data; do not duplicate acceptance BOQ or warranty assets.
- [ ] Add archive summary/export only from real versions/checksums/signed records and existing file authorization.
- [ ] Implement closure command with optimistic/idempotent claim, structured blockers, Activity/Notification, and no mutation on failure.
- [ ] Add complete Web state/action tests and direct URL protection.
- [ ] Run Playwright Flow 5 and inspect required screenshots at both viewports.
- [ ] Keep the Stage 5 root open throughout; only after acceptance enable its
      completed workstream tabs and replace the initialization-only main panel.

### Task 10: Cross-stage adapters and Project route completion

**Files:**

- Modify: `apps/web/app/projects/[projectId]/members/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/files/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/activity/page.tsx`
- Create only when backed by real complete behavior: `apps/web/app/projects/[projectId]/tasks/page.tsx`, `apps/web/app/projects/[projectId]/settings/page.tsx`
- Modify: `apps/web/app/project-pms.tsx`
- Test: cross-stage route/authorization tests and `apps/web/app/projects/[projectId]/compatibility.test.tsx`

- [ ] Replace monolith switches in members/files/activity with direct canonical compositions and preserve their backend authorization.
- [ ] Add Project tasks by filtering canonical Task records and validating Project scope; otherwise leave the route absent.
- [ ] Add Project settings only for real authorized stored configuration; otherwise keep the link/route absent.
- [ ] Verify every notification/direct link and stale query URL reaches a protected canonical route.
- [ ] Run route, navigation, direct URL, file download, and browser Flow 0 tests.

### Task 11: Default cutover and deletion of obsolete Project UI

**Files:**

- Delete only files whose removal gate passes, beginning with candidates recorded in `docs/project-system/PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md`
- Modify: `apps/web/next.config.ts` only for necessary compatibility redirects
- Modify: `docs/project-system/OLD_TO_NEW_PROJECT_MAPPING.md`
- Modify: `docs/project-system/PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md`
- Test: route/navigation/notification compatibility and Project Playwright Flow 0

- [ ] Confirm `/projects` and `/projects/:projectId` are the only default Project entries and no legacy home/mode is reachable.
- [ ] Run `rg` for `workspace=`, raw phase UI, `project-form`, old wrappers, old CTA text, old Project selectors, and every candidate import/caller.
- [ ] Add/verify compatibility redirects and stored notification destinations before deletion.
- [ ] Delete `project-form.tsx`, obsolete Stage 1 monolith/wrappers, aliases, styles, or adapters only when each has zero legitimate references and equivalent verified behavior.
- [ ] Record every deleted file in both matrix/status and final handoff.
- [ ] Run focused route tests, Web typecheck, production build, `git diff --check`, browser Flow 0, and both viewport inspection.

### Task 12: Full Project regression, visual acceptance, and handoff

**Files:**

- Modify: `PROJECT_STATUS.md`
- Modify: relevant docs when verified commands/routes changed

- [ ] Invoke `superpowers:verification-before-completion`.
- [ ] Run fresh: `git diff --check`; Prisma format/validate/status; API/Web/Edge typecheck; lint; API/Web/Edge/Document Service tests; Project/current-stage/Required Document/database integration/navigation tests; baseline and Project Playwright Flows 0–5; production Web build; format check.
- [ ] Record exact test counts and exact blockers; do not reuse historical counts.
- [ ] Open and inspect every final stage/dashboard screenshot at 1536×864 and 1440×900.
- [ ] Invoke `superpowers:requesting-code-review`; fix correctness defects test-first.
- [ ] Run Ponytail lean plus correctness, security, authorization, and UX/reference-match reviews; remove out-of-scope code.
- [ ] Update `PROJECT_STATUS.md` with exact COMPLETE/REUSABLE_FOUNDATION/PARTIAL/NOT_STARTED classification and exact next task.
- [ ] Deliver `GALAXY OS — PROJECT PMS FULL REPLACEMENT HANDOFF` without claiming incomplete stages.
- [ ] Do not commit, tag, push, or create a PR.

## Plan self-review

- The order follows the approved Phase 0–9 sequence and completes one real vertical slice before exposing the next.
- Existing domains/routes are reused; new per-stage services are orchestration boundaries, not duplicate business domains.
- Schema changes are conditional on a failing contract/schema audit and additive reviewed SQL.
- Authorization, financial non-disclosure, immutable history, idempotency, direct routes, and file downloads are tested at backend boundaries.
- No unfinished route/tab, fake chart/data, speculative template/settings page, generic workflow engine, dependency, or parallel Project mode is planned.
- User no-commit/no-reset/no-discard instructions override default worktree/commit steps.
