# Galaxy Project PMS Shell and Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default Project experience with the approved PMS shell and deliver a real, authorized, end-to-end Stage 1 workflow.

**Architecture:** Keep existing Project and business domains authoritative. Add only Stage 1 orchestration records, compute routing/readiness/red flags in the Project module, expose backend-owned commands, and render route-based Next.js screens with compatibility redirects for old workspace URLs.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Next.js App Router, React, Tailwind CSS, Vitest, Playwright.

## Global Constraints

- Preserve the dirty worktree and all existing Product/Required Document changes.
- Do not commit, tag, push, open a PR, reset data, rewrite migrations, run `prisma db push`, or use `prisma migrate dev` if it requests reset.
- Use TDD for every behavior: failing test, observed failure, minimum implementation, passing test.
- Use `BusinessEntityPolicy` and backend permission checks; frontend visibility is not authorization.
- Never return hidden financial values, aggregates, sort/filter metadata, file metadata, or Project metadata.
- No Stage 2–5 business implementation, empty pages, mock data, fake charts, dead actions, or duplicate business domains.
- Primary viewport is 1536×864; secondary viewport is 1440×900.
- Use additive production-safe migration SQL and `prisma migrate deploy` only when PostgreSQL is available.
- Do not commit after tasks; leave all changes for user review.

## File structure

- `apps/api/prisma/schema.prisma`: minimal Stage 1 orchestration relations.
- `apps/api/prisma/migrations/20260801*_project_stage_one/`: additive SQL only.
- `apps/api/src/projects/project-stage-one.dto.ts`: validated Stage 1 command DTOs.
- `apps/api/src/projects/project-stage-one.rules.ts`: pure type/routing/readiness/red-flag rules.
- `apps/api/src/projects/project-stage-one.service.ts`: scoped reads and transactional commands.
- `apps/api/src/projects/project-stage-one.controller.ts`: Stage 1 endpoints and permission guards.
- `apps/api/src/projects/project-stage-one.test.ts`: focused unit/authorization behavior.
- `apps/api/test/project-stage-one.integration.test.ts`: PostgreSQL workflow/isolation behavior.
- `apps/web/app/project-pms.tsx`: focused reusable PMS frame components.
- `apps/web/app/project-pms.test.tsx`: user-visible component behavior.
- `apps/web/app/projects/project-dashboard.tsx`: executive dashboard UI.
- `apps/web/app/projects/[projectId]/project-stage-one.tsx`: Stage 1 client workflow.
- `apps/web/app/projects/[projectId]/stage-1/**/page.tsx`: route adapters into the Stage 1 client.
- `apps/web/app/projects/[projectId]/page.tsx`: canonical new PMS workspace.
- `apps/web/app/portal-shell.tsx`, `portal-navigation.ts`, `globals.css`: approved global shell and navigation.
- `apps/web/tests/browser/project-stage-one.spec.ts`: authorized workflow, isolation, screenshots, and console assertions.

---

### Task 1: Schema and migration for Stage 1 orchestration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260801090000_project_stage_one/migration.sql`
- Test: Prisma format and validate commands

**Interfaces:**

- Produces: `ProjectStageState`, `ProjectStageStep`, `ProjectStageApproval`, and `ProjectStageOnePlan` Prisma clients with unique Project/stage keys and optimistic versions.

- [x] Add Prisma models whose foreign keys reference `Project`; approval/file/user identifiers remain references or UUID audit fields and never copy user/file data.
- [x] Add enums for stage/step/approval status only when no equivalent current enum represents the exact values.
- [x] Run `pnpm --filter @galaxy/api exec prisma format --schema prisma/schema.prisma`; expect formatted schema.
- [x] Run `pnpm --filter @galaxy/api prisma:validate`; expect valid schema.
- [x] Review SQL for additive tables, indexes, unique constraints, foreign keys, defaults, and no destructive statement.
- [x] Do not apply until `prisma migrate status` can reach PostgreSQL; do not commit.

### Task 2: Pure Stage 1 business rules

**Files:**

- Create: `apps/api/src/projects/project-stage-one.rules.ts`
- Test: `apps/api/src/projects/project-stage-one.rules.test.ts`

**Interfaces:**

- Produces: `routeProject(project): ProjectRouting`, `deriveStageOneReadiness(input): StageOneReadiness`, and `deriveStageOneRedFlags(input): ProjectRedFlag[]`.

- [x] Write failing tests for all eight Project types, survey/financial applicability, missing PM/member/customer/type/handover, overdue survey/documents, rejected documents/approval, and resolved flags disappearing.
- [x] Run `pnpm --filter @galaxy/api test -- project-stage-one.rules.test.ts`; expect missing-module/function failures.
- [x] Implement typed lookup tables and pure derivation functions; use no database and no rules-engine abstraction.
- [x] Run the focused test; expect all cases pass.
- [x] Do not commit.

### Task 3: Stage 1 validation DTOs

**Files:**

- Create: `apps/api/src/projects/project-stage-one.dto.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces validated `InitializeStageOneDto`, `UpdateStageOnePlanDto`, `CompleteStageOneStepDto`, `SurveyNotApplicableDto`, `SubmitStageOneApprovalDto`, `DecideStageOneApprovalDto`.

- [x] Write failing controller-pipe tests for invalid Project type, negative money, malformed UUID/date, empty not-applicable reason, and invalid approval decision.
- [x] Run focused test; expect DTO validation failures not yet matching requirements.
- [x] Implement class-validator DTOs with field length, enum, UUID, ISO date, decimal/nonnegative, and required-reason constraints.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 4: Scoped Stage 1 read model and financial filtering

**Files:**

- Create: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces: `getSummary(actor, projectId)` and `getInitiation(actor, projectId)`; unauthorized financial properties are absent, not null.

- [x] Write failing tests for member access, non-member not-found, cross-project denial, financial field omission, financial aggregate omission, and hidden sort rejection.
- [x] Run focused test and record expected failures.
- [x] Implement one scoped Project lookup using `BusinessEntityPolicy.projectWhere`, bounded bulk queries, and permission-selected financial columns.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 5: Initialization and initiation commands

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces: `initialize(actor, projectId)` and `updatePlan(actor, projectId, dto)`; initialization idempotently creates five steps, Stage 1 state, plan, and twelve applicable document rows.

- [x] Write failing tests for idempotent initialization, canonical type validation, disabled PM rejection, invalid member rejection, financial write denial, and preservation of existing Project values.
- [x] Run focused test; expect failures.
- [x] Implement minimum transactional upserts and existing Project update calls; validate active user/organization membership before assignment.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 6: Step 1 assignment command

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces: `completeStep(actor, projectId, 'ASSIGNMENT')` returning structured blockers or completed server status.

- [x] Write a failing test proving missing identity/type/PM/member/responsibility blocks completion and valid active assignments pass.
- [x] Run focused test; expect failure.
- [x] Implement server validation and Activity write; never accept completion status from DTO.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 7: Step 2 survey command

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify only if needed: existing Survey controller/service DTOs
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces survey completion validation and `markSurveyNotApplicable(actor, projectId, reason)`.

- [x] Write failing tests for scheduled/recorded survey, evidence requirement, overdue flag, permissioned not-applicable with reason, and unauthorized/blank reason rejection.
- [x] Run focused test; expect failure.
- [x] Reuse `Survey` and `FileAsset` relations; store only missing site constraints in Stage 1 plan and the audited not-applicable decision in the step.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 8: Step 3 proposal and Step 4 preliminary finance

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces proposal and financial-plan save/completion validation; does not create Estimate, Contract, or payment records.

- [x] Write failing tests for missing scope/WBS/milestones/risk/resource blockers, financial applicability, unauthorized read/write, and permitted preliminary values.
- [x] Run focused test; expect failure.
- [x] Persist proposal JSON/text and preliminary Decimal/date fields only in the Stage 1 plan; omit financial selections for unauthorized actors.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 9: Step 5 approval and gate

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Reuse: `apps/api/src/projects/project-approver-resolver.service.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces `submitApproval`, `decideApproval`, and `completeGate`; gate failures return typed blockers and success is idempotent.

- [x] Write failing tests for resolver membership/permission, idempotent submit, self-approval denial, decision history, document/critical-flag blockers, successful Activity/direct Notification, and retry deduplication.
- [x] Run focused test; expect failure.
- [x] Implement transactional claim/update and deterministic idempotency keys; reuse resolver and Notification/Activity tables.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 10: Stage 1 API routes and compatibility authorization

**Files:**

- Create: `apps/api/src/projects/project-stage-one.controller.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Test: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces GET summary/initiation/routing and POST/PATCH initialize/plan/step/survey-NA/approval/gate routes under `/projects/:projectId/stage-1`.

- [x] Write failing controller tests for exact permission decorators, UUID parsing, DTO validation, structured 422 blockers, and non-member denial.
- [x] Run focused test; expect missing route/provider failures.
- [x] Add the minimum controller methods and module providers.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 11: Global PMS shell and navigation

**Files:**

- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/portal-shell.tsx`
- Modify: `apps/web/app/portal-navigation.ts`
- Test: `apps/web/app/portal-navigation.test.ts`

**Interfaces:**

- Produces approved white 272 px sidebar, 76 px header, grouped navigation, active Project links, and user card using real actor data.

- [x] Write failing navigation tests for Project actions/alerts links, active-state matching, permission filtering, and no global Project workstreams.
- [x] Run `pnpm --filter @galaxy/web test -- portal-navigation.test.ts`; expect failure.
- [x] Implement navigation entries using existing routes (`/projects/actions`, `/projects/alerts`) and approved CSS tokens once.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 12: Executive Project dashboard

**Files:**

- Modify: `apps/api/src/projects/projects.controller.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/web/app/projects/page.tsx`
- Create if needed: `apps/web/app/projects/project-dashboard.test.tsx`
- Test: `apps/api/src/projects/projects.test.ts`

**Interfaces:**

- Produces paginated Project list plus permission-filtered executive aggregate endpoint/UI.

- [x] Write failing API tests for full authorized totals, financial omission, no hidden sorting, delayed/pending/critical counts, and no page-local totals.
- [x] Write failing Web behavior tests for hero, KPI visibility, truthful chart empty state, project table, loading/error/empty states.
- [x] Run focused API and Web tests; expect failure.
- [x] Implement minimum aggregate query and dashboard presentation.
- [x] Run focused tests; expect pass.
- [x] Do not commit.

### Task 13: Shared Project PMS frame

**Files:**

- Create: `apps/web/app/project-pms.tsx`
- Create: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/page.tsx`

**Interfaces:**

- Produces `ProjectPmsShell`, header, switcher, context bar, tabs, summary cards, readiness, flags, steps, routing panel, and standard status-pill components.

- [x] Write failing behavior tests for real header fields, route hrefs, active/completed/blocked stage presentation, hidden unavailable Stage 2–5 destinations, readiness/flags, and no dead CTA.
- [x] Run focused Web test; expect missing components.
- [x] Implement focused components and replace the old query-string workspace entry.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 14: Stage 1 routes and initiation/routing UI

**Files:**

- Create: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-1/page.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-1/initiation/page.tsx`
- Test: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Produces route-selected Stage 1 client with separate Save Draft, Initialize, and Submit Review commands.

- [x] Write failing tests for grouped fields, canonical Project types, validation, financial-field omission, navy routing results, mutation errors, and separate actions.
- [x] Run focused Web test; expect failure.
- [x] Implement the 70/30 responsive row and API calls using existing `api` helper.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 15: Stage 1 step routes and forms

**Files:**

- Create: Stage 1 `survey`, `requirements`, and `approval` page adapters
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Test: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Produces five-step navigator and real Step 1–5 forms/commands.

- [x] Write failing tests for selected/completed/blocked cards, assignment, survey/not-applicable, proposal, permissioned finance, approval history, gate blockers, and direct routes.
- [x] Run focused test; expect failure.
- [x] Implement step sections with server-owned statuses and explicit actions.
- [x] Run focused test; expect pass.
- [x] Do not commit.

### Task 16: Required Documents, activity/comments, and members dialog

**Files:**

- Reuse/modify: existing Project document pages and `document-ui.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Create: route adapters for Stage 1 documents, members, files, tasks, activity, settings only when backed by existing real pages/data
- Test: focused Web tests

**Interfaces:**

- Produces Stage 1 matrix placement, history links, existing file upload flow, scoped activity/comments, and necessary internal-member administration dialog.

- [x] Write failing tests for all status colors/actions, no full history in matrix, real links, modal userId operations, and absent unauthorized financial controls.
- [x] Run focused tests; expect failure.
- [x] Reuse existing matrix/detail, `EntityFiles`, `EntityComments`, member endpoints, and actor permissions; add no parallel file/member store.
- [x] Run focused tests; expect pass.
- [x] Do not commit.

### Task 17: Old-route compatibility

**Files:**

- Modify: old workspace-linked pages and/or add Next.js `redirect()` route adapters
- Test: `apps/web/app/portal-navigation.test.ts` and focused route tests

**Interfaces:**

- Produces canonical `/projects/:id` PMS entry and redirects query-string workspaces to nearest real route while preserving Product/commercial/document notification paths.

- [x] Write failing direct-route tests for old workspace queries, Product aliases, document notifications, and authorization preservation.
- [x] Run focused tests; expect failure.
- [x] Add the minimum server redirects/adapters; keep authoritative domain pages valid.
- [x] Run focused tests; expect pass.
- [x] Update `docs/project-system/OLD_TO_NEW_PROJECT_MAPPING.md` with implemented decisions.
- [x] Do not commit.

### Task 18: PostgreSQL integration

**Files:**

- Create: `apps/api/test/project-stage-one.integration.test.ts`

**Interfaces:**

- Verifies real transaction, isolation, financial omission, document gate, approval/gate idempotency, Activity, and Notification.

- [x] Start only existing Compose `postgres` and `redis` if Docker is available.
- [x] Run `prisma migrate status`; if reachable, apply only the new migration with `prisma migrate deploy`.
- [x] Write the integration tests before implementation gaps are fixed and observe failures.
- [x] Make only root-cause fixes through the applicable earlier task tests.
- [x] Run the integration test; expect pass or record exact environment blocker.
- [x] Do not commit.

### Task 19: Playwright Stage 1 and isolation flows

**Files:**

- Create: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify only if needed: existing fixture/global setup scripts

**Interfaces:**

- Produces authorized PM-to-approver flow, direct-route isolation flow, console-error assertions, and screenshots at both approved viewports.

- [x] Write the two business flows using real seeded/fixture database data and small valid upload.
- [x] Assert each business transition, direct notification route, flags disappearing, activity, no metadata leak, and no unexpected console error.
- [x] Capture all nine required screens at 1536×864 and 1440×900 under ignored Playwright output.
- [x] Run Stage 1 Playwright; expect pass or record exact database/browser blocker.
- [x] Inspect every screenshot for proportions, colors, density, overflow, spacing, and alignment; record differences.
- [x] Do not commit artifacts or code.

### Task 20: Verification, reviews, and status

**Files:**

- Modify: `PROJECT_STATUS.md`

**Interfaces:**

- Produces fresh evidence and accurate COMPLETE/PARTIAL/NOT_STARTED classification.

- [ ] Invoke `superpowers:verification-before-completion` and run the exact repository checks from the approved prompt.
- [ ] Invoke `superpowers:systematic-debugging` before every failure fix.
- [ ] Invoke `superpowers:requesting-code-review`; resolve correctness findings through TDD.
- [ ] Run Ponytail lean, correctness, security, authorization, and UX/reference-match reviews.
- [ ] Update `PROJECT_STATUS.md` without deleting history; Stage 2–5 remain NOT_STARTED.
- [ ] Run `git diff --check` and list exact modified/added files and exact test counts.
- [ ] Do not commit, tag, push, or create a PR.

## Plan self-review

- Spec coverage: Tasks 1–20 cover Slice 0, Slice 1, authorization, financial filtering, compatibility, tests, browser flows, visual review, and status; Stage 2–5 are excluded.
- Placeholder scan: every task names exact files, behavior, commands, expected red/green result, and interfaces; no deferred implementation instruction is used.
- Type consistency: routing/readiness/red-flag functions feed the Stage 1 service summary; API summary feeds the shared PMS frame and Stage 1 client; gate and approval commands use the same stage records.
- Repository override: all default commit steps are replaced with explicit no-commit steps.
