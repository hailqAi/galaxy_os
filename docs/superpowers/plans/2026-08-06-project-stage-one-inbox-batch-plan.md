# Project Stage 1 Inbox Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the per-project Stage 1 summary fan-out on `/projects/actions` and `/projects/alerts` while preserving Project isolation and financial redaction.

**Architecture:** Reuse `ProjectStageOneService` and its existing readiness/red-flag rules. Add one bounded collection read that loads at most the current 20 Project IDs with a single scoped Prisma `findMany`, returns only each accessible `projectId`, readiness, and red flags, then join that result to the already-authorized paginated Project list in the web page.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Next.js App Router, React, Vitest.

## Global Constraints

- Preserve every existing dirty-worktree change; do not reset or discard files.
- Do not commit, tag, push, open a PR, reset data, rewrite migrations, run `prisma db push`, or create a migration.
- Use TDD for each behavior: failing test, observed expected failure, minimum implementation, passing test.
- Reuse `BusinessEntityPolicy.projectWhere`, `deriveStageOneReadiness`, and `deriveStageOneRedFlags`; do not create another Project, permission, readiness, or red-flag system.
- Accept between 1 and 20 UUID Project IDs; ignore inaccessible IDs without returning metadata about them.
- Return no Project metadata or financial value from the batch endpoint—only `projectId`, readiness, and red flags.
- Keep list search/filter/sort/pagination behavior unchanged and make exactly one summary request per loaded Project page.
- Do not change Stage 2–5 routes or behavior in this task.

---

### Task 1: Bounded Stage 1 inbox summary read

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/projects.controller.ts`
- Modify: `apps/api/src/projects/projects.service.ts` only if an existing list interface must be reused; otherwise leave it unchanged
- Test: `apps/api/src/projects/project-stage-one.test.ts`
- Test: `apps/api/src/projects/projects.test.ts` only if `ProjectsService` changes

**Interfaces:**

- Produces: `StageOneSummaryBatchQuery` with `projectIds: string[]`, transformed from a comma-separated query value and validated to 1–20 UUIDs.
- Produces: `ProjectStageOneService.getSummaries(actor, projectIds)` returning `{ items: { projectId: string; readiness: StageOneReadiness; redFlags: ProjectRedFlag[] }[] }` in requested-ID order for accessible Projects only.
- Produces: `GET /projects/stage-1-summaries?projectIds=<uuid>,<uuid>` guarded by `project.read`.

- [x] **Step 1: Write the failing DTO and service tests**

  Add focused cases that prove malformed, empty, and 21-ID queries fail validation; two requested Projects cause one scoped `project.findMany`; a Project outside `BusinessEntityPolicy.projectWhere` is absent rather than represented by a placeholder; and the response contains no Project name, customer, plan, required-document counts, or financial fields.

  The service expectation must use literal requested IDs and assert the observable response shape:

  ```ts
  expect(result).toEqual({
    items: [
      {
        projectId: accessibleProjectId,
        readiness: expect.objectContaining({ status: expect.any(String) }),
        redFlags: expect.any(Array),
      },
    ],
  });
  expect(result.items[0]).not.toHaveProperty('project');
  expect(findMany).toHaveBeenCalledOnce();
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: { in: [accessibleProjectId, inaccessibleProjectId] },
      }),
    }),
  );
  ```

- [x] **Step 2: Run the focused API test and verify RED**

  Run:

  ```bash
  pnpm --filter @galaxy/api test -- project-stage-one.test.ts
  ```

  Expected: FAIL because `StageOneSummaryBatchQuery` and `getSummaries` do not exist.

- [x] **Step 3: Implement the minimum bounded collection read**

  Extract the existing single-Project summary selection/derivation into private service helpers so `getSummary` and `getSummaries` share the same rules. `getSummaries` must issue one `project.findMany` with both `id: { in: projectIds }` and `BusinessEntityPolicy.projectWhere(actor)`, map results by ID, and return only accessible items in requested order. Add the static collection route before `GET /projects/:id` so `stage-1-summaries` is never parsed as a UUID Project ID.

- [x] **Step 4: Run the focused API test and verify GREEN**

  Run:

  ```bash
  pnpm --filter @galaxy/api test -- project-stage-one.test.ts
  ```

  Expected: all tests in the file pass with one `findMany` for the batch case.

- [x] **Step 5: Run focused API type and lint checks**

  Run:

  ```bash
  pnpm --filter @galaxy/api typecheck
  pnpm --filter @galaxy/api lint
  ```

  Expected: both commands pass.

- [x] **Step 6: Do not commit**

  Leave the reviewed working-tree changes uncommitted for the user.

### Task 2: One-request Actions/Alerts loading

**Files:**

- Modify: `apps/web/app/projects/page.tsx`
- Modify only if the response type belongs there: `apps/web/app/projects/stage-one-projects.ts`
- Test: `apps/web/app/projects/page.test.ts`
- Test only if row transformation changes: `apps/web/app/projects/stage-one-projects.test.ts`

**Interfaces:**

- Consumes: `GET /projects/stage-1-summaries?projectIds=<uuid>,<uuid>`.
- Preserves: `stageOneRows(mode, entries)` and current list pagination/search/filter state.
- Produces: exactly one batch summary request after each successful Actions/Alerts Project page load.

- [x] **Step 1: Write the failing web behavior test**

  Use a two-Project page and assert exactly two fetches total: the Project list and one batch endpoint. Assert the batch URL contains both Project IDs and contains neither `/projects/<id>/stage-1/summary` path. Return one accessible summary and prove the corresponding row renders while the missing summary produces the existing partial-load message.

  ```ts
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[1]?.[0])).toContain(
    '/projects/stage-1-summaries?projectIds=',
  );
  expect(String(fetch.mock.calls[1]?.[0])).not.toContain('/stage-1/summary');
  ```

- [x] **Step 2: Run the focused web test and verify RED**

  Run:

  ```bash
  pnpm --filter @galaxy/web test -- app/projects/page.test.ts
  ```

  Expected: FAIL because the current loader makes one Stage 1 request per Project.

- [x] **Step 3: Implement the minimum loader change**

  Replace the `Promise.all` per-project fetch with one batch request, map returned summaries by `projectId`, and feed the existing `stageOneRows` function. Keep generation invalidation and partial-data messaging behavior unchanged.

- [x] **Step 4: Run focused web tests and verify GREEN**

  Run:

  ```bash
  pnpm --filter @galaxy/web test -- app/projects/page.test.ts app/projects/stage-one-projects.test.ts
  ```

  Expected: all focused tests pass.

- [x] **Step 5: Run focused web type and lint checks**

  Run:

  ```bash
  pnpm --filter @galaxy/web typecheck
  pnpm --filter @galaxy/web lint
  ```

  Expected: both commands pass.

- [x] **Step 6: Do not commit**

  Leave the reviewed working-tree changes uncommitted for the user.

### Task 3: Verification, reviews, and continuation status

**Files:**

- Modify: `PROJECT_STATUS.md`

**Interfaces:**

- Produces: fresh checkpoint evidence and the exact next remaining Slice 0/1 task.

- [x] **Step 1: Run targeted regression**

  Run the complete Project API and Web unit-test files touched by Tasks 1–2, then `pnpm --filter @galaxy/api typecheck`, `pnpm --filter @galaxy/web typecheck`, and `git diff --check`.

- [x] **Step 2: Invoke verification and code-review workflows**

  Invoke `superpowers:verification-before-completion`, `superpowers:requesting-code-review`, and the mandatory Ponytail diff review. Review correctness, security, Project authorization, financial non-disclosure, and Actions/Alerts UX.

- [x] **Step 3: Fix review findings test-first**

  For each real behavior defect, invoke `superpowers:systematic-debugging`, reproduce it with a failing regression test, implement the smallest root-cause fix, and rerun the affected checks.

- [x] **Step 4: Update status and stop at the verified checkpoint**

  Append the batch endpoint/UI result, exact test counts, preserved dirty state, and next task to `PROJECT_STATUS.md`. Keep Shell and Stage 1 classified PARTIAL unless every strict Definition-of-Done item is met. Do not claim Stage 2–5 work.

- [x] **Step 5: Do not commit**

  Do not commit, tag, push, or create a PR.

## Plan self-review

- Spec coverage: the plan addresses the earliest confirmed Shell/Stage 1 performance gap and deliberately leaves later independent field, participant, route, and Stage 2–5 work for subsequent vertical plans.
- Placeholder scan: every task names exact files, interfaces, tests, commands, expected results, and non-disclosure constraints; no implementation placeholder remains.
- Type consistency: the API returns `projectId`, `readiness`, and `redFlags`; the web joins those fields to its existing authorized Project list before calling `stageOneRows`.
- Scope and safety: no schema, migration, new domain, fake data, route scaffold, database mutation, or commit is required.
