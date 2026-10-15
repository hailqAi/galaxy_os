# Project UI cutover and deletion matrix

Date: 2026-08-11

## Scope and rule

This matrix covers the current Project-facing routes, orchestration, shell, and directly reused business surfaces. It does not authorize deletion of authoritative domain models, migrations, records, audit history, or shared services.

Classification:

- `KEEP_DOMAIN`: canonical business record/page/service; preserve and orchestrate.
- `REUSE_COMPONENT`: already matches the target responsibility; compose it into the PMS.
- `ADAPT`: keep the path or component, but change presentation/orchestration.
- `REPLACE`: keep the business behavior and regression coverage while replacing the implementation.
- `REDIRECT`: compatibility entry only.
- `DELETE_AFTER_CUTOVER`: delete only after replacement, redirects, reference search, tests, typecheck, and build are green.

## Verified cutover facts

- `/projects/[projectId]` already ignores the old query-string workspace selector and redirects to `/projects/[projectId]/stage-1`.
- The current global `PortalShell` and CSS already provide the approved 272 px sidebar, 76 px header, light canvas, navy, borders, and shared card/table/form treatment.
- Global Project navigation correctly contains portfolio destinations only; stage workstreams belong inside Project context.
- Stage 2–5 roots exist as authorized, connected Project stage workspaces. The
  shared switcher links every stage while preserving the server-owned current
  stage rather than mutating it during navigation.
- The Stage 1 implementation is a large client monolith used by Stage 1 plus members/files/activity wrappers. Its business calls and tests must be preserved while its rendering/orchestration is split.
- Canonical Product, Required Document, Estimate, Quotation, Contract, Inspection, Handover, Warranty, FileAsset, Activity, and Comment pages already exist. The PMS must reuse them.

## Global shell and navigation

| Current path                             | Class             | Cutover disposition                                                                                                                            |
| ---------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/portal-shell.tsx`          | `REUSE_COMPONENT` | Keep as the one global shell; adapt only where Project context needs a five-stage group.                                                       |
| `apps/web/app/globals.css`               | `REUSE_COMPONENT` | Reuse existing tokens and shared panel/table/form styles; remove only proven obsolete Project selectors after cutover.                         |
| `apps/web/app/portal-navigation.ts`      | `REUSE_COMPONENT` | Keep `/projects`, `/projects/mine`, `/projects/actions`, `/projects/alerts` as global Project destinations. Do not add stage workstreams here. |
| `apps/web/app/portal-navigation.test.ts` | `KEEP_DOMAIN`     | Retain navigation and authorization regression coverage.                                                                                       |
| `apps/web/app/project-pms.tsx`           | `ADAPT`           | Keep the shared frame; add real stage destinations and stage-specific workstream tabs as each vertical slice becomes complete.                 |
| `apps/web/app/project-pms.test.tsx`      | `ADAPT`           | Retain and expand route, disabled-state, context, summary, readiness, red-flag, and no-dead-CTA assertions.                                    |

## Portfolio and Project entry

| Current path                                               | Route                       | Class                  | Cutover disposition                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/projects/page.tsx`                           | `/projects`                 | `ADAPT`                | Make the Executive PMS dashboard the default. Replace its raw legacy `phase` presentation (currently three exposed values) with deterministic five-stage mapping; keep real list/batch data and permission filtering. The backend enum's 14 historical values remain intact. |
| `apps/web/app/projects/page.test.ts`                       | `/projects`                 | `ADAPT`                | Preserve batch/N+1 regression coverage and update dashboard expectations.                                                                                                                                                                                                    |
| `apps/web/app/projects/project-dashboard.test.tsx`         | `/projects`                 | `ADAPT`                | Replace assertions that lock legacy placeholder copy once real planned/actual data is wired.                                                                                                                                                                                 |
| `apps/web/app/projects/stage-one-projects.ts`              | actions/alerts adapter      | `REUSE_COMPONENT`      | Keep the small canonical Stage 1 summary-row adapter until a common Project inbox source replaces it.                                                                                                                                                                        |
| `apps/web/app/projects/stage-one-projects.test.ts`         | adapter test                | `KEEP_DOMAIN`          | Retain.                                                                                                                                                                                                                                                                      |
| `apps/web/app/projects/mine/page.tsx`                      | `/projects/mine`            | `REUSE_COMPONENT`      | Keep the permission-filtered portfolio variant.                                                                                                                                                                                                                              |
| `apps/web/app/projects/actions/page.tsx`                   | `/projects/actions`         | `REUSE_COMPONENT`      | Keep the action-inbox route.                                                                                                                                                                                                                                                 |
| `apps/web/app/projects/alerts/page.tsx`                    | `/projects/alerts`          | `REUSE_COMPONENT`      | Keep the alert-inbox route.                                                                                                                                                                                                                                                  |
| `apps/web/app/projects/new/page.tsx`                       | `/projects/new`             | `ADAPT`                | Keep a minimal create-only entry if needed, then land in Stage 1 initiation. Do not duplicate the full initiation form.                                                                                                                                                      |
| `apps/web/app/projects/project-form.tsx`                   | create/edit form            | `DELETE_AFTER_CUTOVER` | Remove after create is minimal and edit redirects to Stage 1 initiation; it currently duplicates identity/status/legacy phase editing.                                                                                                                                       |
| `apps/web/app/projects/[projectId]/page.tsx`               | `/projects/:projectId`      | `REDIRECT`             | Keep as the canonical compatibility entry. Change destination to the current applicable stage only when that mapping is implemented and tested.                                                                                                                              |
| `apps/web/app/projects/[projectId]/compatibility.test.tsx` | compatibility routes        | `KEEP_DOMAIN`          | Preserve old-query and legacy-domain link coverage.                                                                                                                                                                                                                          |
| `apps/web/app/projects/[projectId]/edit/page.tsx`          | `/projects/:projectId/edit` | `REDIRECT`             | Redirect to `/projects/:projectId/stage-1/initiation` after the initiation form owns Project editing.                                                                                                                                                                        |

## Stage 1 routes and implementation

| Current path                                                             | Route/responsibility                | Class                  | Cutover disposition                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ----------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/projects/[projectId]/project-stage-one.tsx`                | all Stage 1 rendering and mutations | `REPLACE`              | Preserve its tested commands and states, then split into focused page/container and step components. Delete the monolithic body only after route and browser regressions pass.      |
| `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`           | Stage 1 behavior                    | `ADAPT`                | Keep as regression coverage while tests move beside focused responsibilities.                                                                                                       |
| `apps/web/tests/browser/stage-one.spec.ts`                               | stale English mocked browser flow   | `DELETE_AFTER_CUTOVER` | Deleted after `rg` proved `project-stage-one.spec.ts` plus focused unit coverage owns its save, read-only, outsider, reconciliation, permission, idempotency, and crypto contracts. |
| `apps/web/tests/browser/project-stage-one.spec.ts`                       | real Stage 1 browser flow           | `KEEP_DOMAIN`          | Canonical deterministic Project acceptance, including route cutover, governance, remediation, documents, versions, denial, console, and responsive contracts.                       |
| `apps/web/app/projects/[projectId]/stage-1/page.tsx`                     | `/stage-1`                          | `REUSE_COMPONENT`      | Keep the Stage 1 overview route.                                                                                                                                                    |
| `apps/web/app/projects/[projectId]/stage-1/initiation/page.tsx`          | `/stage-1/initiation`               | `ADAPT`                | Make it the canonical identity/responsibility/scope/date/finance entry.                                                                                                             |
| `apps/web/app/projects/[projectId]/stage-1/survey/page.tsx`              | `/stage-1/survey`                   | `ADAPT`                | Keep and complete the survey/organization step.                                                                                                                                     |
| `apps/web/app/projects/[projectId]/stage-1/requirements/page.tsx`        | `/stage-1/requirements`             | `ADAPT`                | Keep proposal/requirements orchestration; stop multiplexing unrelated finance routing invisibly.                                                                                    |
| `apps/web/app/projects/[projectId]/stage-1/approval/page.tsx`            | `/stage-1/approval`                 | `ADAPT`                | Keep and complete approval history/gate presentation.                                                                                                                               |
| `apps/web/app/projects/[projectId]/stage-1/documents/page.tsx`           | `/stage-1/documents`                | `REDIRECT`             | Keep redirecting to the canonical Required Document matrix until all bookmarks/notifications/callers are verified.                                                                  |
| `apps/web/app/projects/[projectId]/stage-one-documents-members.test.tsx` | adapters/IAM                        | `KEEP_DOMAIN`          | Retain direct URL, member-by-userId, file, and comment protection coverage.                                                                                                         |

Target Stage 1 responsibilities should follow repository conventions; the useful boundaries are container/data loading, initiation form, navy routing panel, step navigator, five step details, readiness/red flags/gate, and the existing Required Document matrix. Do not create an interface/factory per boundary or duplicate API state.

## Cross-stage Project adapters

| Current path                                          | Route                          | Class         | Cutover disposition                                                                                              |
| ----------------------------------------------------- | ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/projects/[projectId]/members/page.tsx`  | `/members`                     | `ADAPT`       | Replace the `openMembers` monolith switch with a direct IAM-backed adapter.                                      |
| `apps/web/app/projects/[projectId]/files/page.tsx`    | `/files`                       | `ADAPT`       | Replace the monolith `section` switch with direct `EntityFiles` composition.                                     |
| `apps/web/app/projects/[projectId]/activity/page.tsx` | `/activity`                    | `ADAPT`       | Replace the monolith `section` switch with direct activity/comments composition.                                 |
| `apps/web/app/entity-files.tsx`                       | FileAsset list/upload/download | `KEEP_DOMAIN` | Reuse; preserve API/download authorization.                                                                      |
| `apps/web/app/entity-activity.tsx`                    | Activity feed                  | `KEEP_DOMAIN` | Reuse.                                                                                                           |
| `apps/web/app/entity-comments.tsx`                    | comments/replies               | `KEEP_DOMAIN` | Reuse; preserve mention lookup and permission checks.                                                            |
| absent                                                | `/projects/:id/tasks`          | `ADAPT`       | Target-only gap. Add only when backed by a real task service and a completed screen; do not expose an empty tab. |
| absent                                                | `/projects/:id/settings`       | `ADAPT`       | Target-only gap. Add only for approved, authorized Project settings; do not scaffold.                            |

## Required Documents

| Current path                                                           | Class             | Cutover disposition                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/projects/[projectId]/documents/page.tsx`                 | `ADAPT`           | Explicit read-only Project document archive/search compatibility; preserve Project Files access and remove raw Stage 1 create/mutation UI. |
| `apps/web/app/projects/[projectId]/documents/[requirementId]/page.tsx` | `REDIRECT`        | Stage-qualified deep compatibility adapter to the canonical stage row anchor; detail/history/actions live in the inline shared matrix.     |
| `apps/web/app/projects/[projectId]/documents/document-ui.ts`           | `REUSE_COMPONENT` | Keep the small authoritative status/action rules.                                                                                          |
| `apps/web/app/projects/[projectId]/documents/document-ui.test.ts`      | `KEEP_DOMAIN`     | Retain.                                                                                                                                    |

## Authoritative business domains to preserve and orchestrate

| Current path family                                                                                                                                             | Class         | PMS placement                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/projects/[projectId]/products/**`                                                                                                                 | `KEEP_DOMAIN` | Stage 2 Products/configuration; keep old product compatibility redirects until inbound references are drained. |
| `apps/web/app/projects/[projectId]/estimates/**`                                                                                                                | `KEEP_DOMAIN` | Stage 2 BOQ/Estimate and Stage 3 approved commercial source.                                                   |
| `apps/web/app/projects/[projectId]/quotations/**`                                                                                                               | `KEEP_DOMAIN` | Stage 3 commercial.                                                                                            |
| `apps/web/app/projects/[projectId]/contracts/**`                                                                                                                | `KEEP_DOMAIN` | Stage 3 contract and Stage 4 contract execution.                                                               |
| `apps/web/app/projects/[projectId]/inspections/**`                                                                                                              | `KEEP_DOMAIN` | Stage 5 inspection/acceptance.                                                                                 |
| `apps/web/app/projects/[projectId]/handover/**`                                                                                                                 | `KEEP_DOMAIN` | Stage 5 handover.                                                                                              |
| `apps/web/app/projects/[projectId]/warranty/**`                                                                                                                 | `KEEP_DOMAIN` | Stage 5 warranty/service.                                                                                      |
| API/Prisma domains for Project, Contract, PO, Shipment, Inventory, Installation, Handover, Warranty, FileAsset, Approval, User, Activity, Comment, Notification | `KEEP_DOMAIN` | Source of truth. Add only missing relations, applicability, orchestration, and gate state.                     |

## Obsolete presentation patterns

| Pattern                                              | Class                  | Removal condition                                                                                                             |
| ---------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| query-string `workspace`/phase orchestration         | `DELETE_AFTER_CUTOVER` | Root and notification links use real routes; compatibility test proves stale selectors are ignored.                           |
| raw legacy Project phase controls in forms/dashboard | `REPLACE`              | Five-stage presentation mapping is deterministic and tested; database history and the 14-value backend enum remain unchanged. |
| separate old Project home                            | `DELETE_AFTER_CUTOVER` | `/projects` is the verified PMS portfolio dashboard and no caller links to the old presentation.                              |
| monolithic Stage 1 section switching                 | `DELETE_AFTER_CUTOVER` | Focused route components pass unit, API, and Playwright flow tests.                                                           |
| duplicate Project edit form                          | `DELETE_AFTER_CUTOVER` | Initiation owns editing and `/edit` redirects.                                                                                |
| placeholder stage pages/dead CTAs                    | `DELETE_AFTER_CUTOVER` | Never expose them; enable only completed routes.                                                                              |

The audit found no concrete Project-only stylesheet or obsolete Project feature flag, so neither is a deletion target at this checkpoint. Shared CSS and the generic navigation flag type remain reusable.

## 2026-08-11 focused Stage 1 inline-matrix cutover

| Route/component                                   | Classification       | Focused disposition                                                                                                                |
| ------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/projects/:projectId/stage-1`                    | ADAPT                | Canonical connected Stage 1 workspace with public `#documents` / `#document-<requirementId>` anchors and retained legacy aliases.  |
| `/projects/:projectId/documents?stageKey=STAGE_N` | REDIRECT             | Resolve to the matching stage root and preserve a supplied requirement row anchor.                                                 |
| `ProjectPmsDocuments` detached summary link       | DELETE_AFTER_CUTOVER | Remove after the inline matrix, correction links, notification links, browser flow, typecheck, and build are verified.             |
| `/projects/:projectId/documents` without a stage  | KEEP                 | General archive/search compatibility, not the primary completion workflow.                                                         |
| Required Document detail/history route            | REDIRECT             | Preserve deep bookmark/notification compatibility through a stage-row redirect; inline dialogs own detail/history/review/download. |
| `DocumentUpload`                                  | ADAPT                | Reuse unchanged resumable lifecycle inside the shared in-page dialog.                                                              |
| Stage 2–5 roots                                   | KEEP                 | Retain the implemented authorized stage workspaces and shared document anchors without expanding Stage 2–5 business scope.         |

No file is approved for deletion by this amendment until the focused route,
authorization, Playwright, screenshot, typecheck, and production-build gates
pass and `rg` shows no legitimate caller.

## Route availability at this checkpoint

Implemented canonical routes:

- `/projects`, `/projects/mine`, `/projects/actions`, `/projects/alerts`, `/projects/new`;
- `/projects/:projectId` compatibility redirect;
- `/projects/:projectId/stage-1`, `/initiation`, `/survey`, `/requirements`, `/documents`, `/approval`;
- `/projects/:projectId/stage-2`, `/stage-3`, `/stage-4`, and `/stage-5`;
- `/projects/:projectId/members`, `/files`, `/activity`;
- canonical Product, Required Document, Estimate, Quotation, Contract, Inspection, Handover, and Warranty route families.

Not implemented and therefore not exposed as live screens:

- `/projects/templates`;
- `/projects/:projectId/tasks` and `/projects/:projectId/settings`.

## Safe cutover order

1. Keep the current shell, tokens, global navigation, and authoritative domains.
2. Add regression coverage before changing each vertical slice.
3. Make the five-stage portfolio/shell presentation deterministic from real data.
4. Complete Stage 1 behind its current routes and split the monolith without changing its command semantics.
5. Complete Stage 2–5 one stage at a time; expose only working routes.
6. Redirect duplicate edit/legacy entry points.
7. Search every obsolete path/import/notification link with `rg`.
8. Run route tests, Web typecheck, production build, and browser flows.
9. Delete only zero-reference UI/orchestration files and record each deletion.

## Deletion gate

No candidate above may be deleted until all of these are true:

- the replacement route is the default;
- direct URL authorization and compatibility redirects are tested;
- notification links resolve;
- `rg` shows no legitimate import or route caller;
- targeted route tests and Project Playwright flow pass;
- `git diff --check`, Web typecheck, and production Web build pass;
- both required viewport captures have been inspected.

Task 6 satisfied this gate for one zero-reference presentation/test artifact:
`apps/web/tests/browser/stage-one.spec.ts` was deleted. No business model,
history, migration, API, fixture framework, or reusable Project presentation
component was deleted. Compatibility adapters remain because live
notification/activity/bookmark callers still use them and their redirect cost
is smaller than rewriting every historical target.
