# Galaxy Project PMS Replacement Design

Date: 2026-08-01  
Status: approved by the user in the authoritative implementation prompt  
Scope: Slice 0 (new Project PMS shell) and Slice 1 (complete Stage 1 vertical slice)

## 1. Current-state audit

Galaxy OS is a Next.js/NestJS/Prisma modular monolith. `/projects` currently renders a paginated Project list whose KPI cards aggregate only the loaded page. `/projects/[projectId]` is a single client workspace with query-string workstream switching and links into existing domains. The global frame is a 240 px dark sidebar and 64 px header. No canonical five-stage route hierarchy exists.

The current backend already applies organization and actor scope through `ProjectsService.visibleWhere` and `BusinessEntityPolicy.projectWhere`. Project detail, Product Register, Required Documents, surveys, requirements, files, tasks, comments, and linked domains use existing authoritative records. Financial filtering currently removes `estimatedValue` without `estimate.read` and `contractedValue` without `contract.read`, including rejecting hidden-field sorting. This behavior is retained and expanded, never moved to frontend-only hiding.

The branch is dirty with accepted prior Project Product and Required Document work. Those changes are preserved. The repository's existing Docker Desktop Compose integration is available: PostgreSQL, Redis, and Mailpit are healthy, and Prisma reports 46 migrations with the schema up to date.

## 2. Reference source

The authoritative reference is the user-approved textual blueprint dated 2026-08-01. It supersedes the earlier missing-image gate recorded in `docs/project-system/PMS_REFERENCE_IMAGE_INVENTORY.md`. Visual acceptance compares generated screenshots to the exact dimensions, hierarchy, colors, spacing, card/table/form patterns, and Vietnamese labels in that blueprint.

## 3. Approaches considered

### A. Additive orchestration over existing domains — selected

Replace Project routes and presentation, add only Stage/Step/Gate and preliminary Stage 1 planning state that existing domains do not own, and link Survey, Requirement, Required Document, FileAsset, Task, Activity, Notification, and membership records. Old links redirect or remain thin adapters. This preserves data and produces one Project experience with the smallest safe schema change.

### B. Compute all state from existing records

This avoids a migration but cannot persist step ownership, deadlines, approval versions, deterministic gate decisions, not-applicable survey decisions, or preliminary financial planning without abusing unrelated records. It is rejected because auditability and idempotent gate completion would be ambiguous.

### C. New Project workflow domain

A standalone workflow engine could model every future stage but duplicates approval/orchestration concepts, increases migration and authorization risk, and creates a second source of truth. It is rejected as speculative.

## 4. Architecture

The Project module remains the orchestration boundary. Existing domain modules retain ownership of their records. The API adds narrowly scoped Project PMS summary, Stage 1 update, step-completion, approval, and gate commands. Each command first resolves the Project with existing actor scope. Mutations validate referenced users, memberships, documents, files, and permissions on the backend.

The web app replaces the old Project workspace with route-based Project PMS pages. Shared focused components render the Project header, stage switcher, context bar, workstream tabs, readiness, red flags, required documents, steps, routing panel, and member dialog. They consume real API responses; no component determines authorization, completion, or financial visibility.

## 5. Data ownership and additive schema

Existing `Project` continues to own code, name, customer, contact, location/address, type, owner, sales owner, design owner, Project Manager, dates, status, phase, priority, values, currency, description, confidentiality, health, and progress. `ProjectMember` remains the userId-backed authorization relation. `Survey`, `Requirement`, `ProjectLocation`, `ProjectRequiredDocument`, `FileAsset`, `Task`, `Activity`, and `Notification` remain authoritative.

The minimum additive records are:

- `ProjectStageState`: one row per Project/stage, status, completed actor/time, gate decision version, and optimistic version.
- `ProjectStageStep`: one row per Project/stage/step, owner user, due date, status, not-applicable reason/actor/time, and optimistic version.
- `ProjectStageApproval`: Stage 1 submission/decision history with status, submitter, resolved reviewer, comments, evidence file, decision times, and idempotency key.
- `ProjectStageOnePlan`: one Project row for source, legal entity text, scope flags/notes, intermediate planned dates, responsibility notes, site constraints, proposal baseline, risk/resource notes, and preliminary financial plan. Financial columns are never selected for unauthorized actors.

These records orchestrate existing truth; they do not copy Contract, payment, Product, procurement, logistics, inventory, installation, handover, warranty, file, approval-engine, or user records. Migration SQL is additive, reviewed, and applied only with `prisma migrate deploy`.

## 6. Visual tokens

The global frame uses a fixed 272 px white sidebar, 76 px white header, `#F4F7FB` canvas, 28–32 px desktop padding, and 20–24 px vertical gaps. Cards are white with `#DCE4EE` borders, 16 px radius, 20–24 px padding, and subtle shadow. Primary is `#1760FF`; navy is `#0B1328`; success `#079B67`; warning `#D97706`; danger `#E10D1A`; purple `#8B16F4`. Existing Tailwind classes are extended once in `globals.css`; duplicate theme systems are not introduced.

Tables use `#F0F4F8` headers, compact 12–14 px text, row separators, status pills, right-aligned numeric cells, allowlisted sorting, filters, and pagination. Forms use section cards, two desktop columns, labels above 38–42 px controls, explicit required marks, inline errors, and separate draft/workflow actions.

## 7. Global Project layout

The sidebar contains the approved groups and permission-filtered real links. Project workstreams stay out of global navigation. The header shows breadcrumb/context, notification count, and the authenticated actor's avatar, name, and real role/scope badge. The user card stays compact at the sidebar bottom where actor data supports it.

Inside a Project every screen renders, in order: Project header, five-stage switcher, context bar, workstream tabs for implemented real routes, summary/readiness, red flags, main content, Required Document Matrix, and activity/comments where applicable.

## 8. Executive dashboard

`/projects` becomes the Project Executive Dashboard. It renders the approved hero, permission-filtered KPI cards, a truthful baseline-versus-actual empty state until real series exist, red flags/health, and a paginated Project table. Aggregates come from a dedicated backend query over the full authorized result set, not the current page. Financial aggregates and fields are omitted at query/serialization level without their permissions; hidden fields cannot be selected for sorting or filtering.

## 9. Project header and stages

The Project header shows stage badge/title, code/name, customer, location, type, status, health, and planned handover. The five buttons use real paths `/stage-1` through `/stage-5`. Stage 1 is implemented. Stage 2–5 buttons remain visible and show computed availability/status; they link only to existing real domain-backed adapters. No empty page or “Coming Soon” is created. `/projects/[projectId]` is the sole default workspace entry and resolves to Stage 1 or the current mapped stage.

## 10. Stage 1 screen design

Stage 1 uses the title “GĐ 1 — KHỞI TẠO, KHẢO SÁT & PHÊ DUYỆT DỰ ÁN”. The first row is a 70/30 responsive grid: the initiation card on the left and navy business-routing panel on the right. Below are the Stage 1 Required Document Matrix, five-step navigator, selected step content, supporting documents/submitted records, and scoped activity/comments.

### Initiation

The form groups Project identity, responsibility, scope, dates, and permission-protected preliminary financial fields. Existing Project fields are written through `PATCH /projects/:id`; Stage 1-only planning fields use the Stage 1 plan command. Save Draft does not advance workflow. Initialize creates missing Stage 1 orchestration rows and default document requirements idempotently. Submit Review calls a distinct eligibility command.

Project types are the eight approved values. Existing free-text `projectType` stores the canonical value, avoiding a duplicate enum migration. Customer remains required by the current Project model; custom types require an explicit custom label in the Stage 1 plan.

### Business routing

A pure deterministic adapter maps canonical Project type and flags to applicable workstreams, steps, financial-plan requirement, survey requirement, document set, risk level, resolved approver, blocker, and next action. It is ordinary Project service logic, not AI and not a rules engine. The navy panel renders only this response.

### Five steps

The horizontal cards show server-owned statuses and direct routes. Step completion commands validate their own conditions and never accept a client-supplied completed status.

1. Assignment requires identity, customer, type, active Project Manager, active member, and responsibility notes/department.
2. Survey requires scheduled/actual data, constraints/evidence as applicable, or a permissioned not-applicable decision with reason.
3. Proposal requires scope, proposal baseline, milestones/WBS, areas or explicit scope decision, risks, and resource notes.
4. Financial planning is returned only to authorized actors and required only by routing policy. It stores preliminary values without creating Contract/payment records.
5. Kickoff approval uses versioned submission and decisions, permission-resolved reviewer, self-approval prevention, idempotent side effects, and immutable decided history.

## 11. Required Document behavior

The existing Required Document service owns the matrix. Initialization idempotently creates the twelve approved Stage 1 defaults with stage/workstream/type uniqueness. List responses contain current-file summary and owner but not full history. Detail routes load history on demand. Existing create/update/assign/file/submit/decision/not-applicable/supersede/history commands remain canonical. Status styling follows the approved color map. Not-applicable requires explicit permission and non-empty reason.

## 12. Readiness and red flags

`GET /projects/:id/stage-1/summary` bulk-loads the Project, memberships, relevant surveys/requirements, Stage 1 plan/steps/approvals, required-document counts, and owners. It derives six readiness cards and overall status from real conditions; no percentage is hard-coded.

The same query derives the approved red-flag codes. Every flag includes severity, title, description, owner, due date, direct route, and remediation. A flag is absent as soon as its underlying condition is resolved. Critical flags and rejected approval/document states block the gate.

## 13. Stage gate

`POST /projects/:id/stage-1/gate` runs inside a transaction and locks/claims the gate attempt through the stage-state version. It validates identity, type, customer, active PM/member, survey or approved non-applicability, proposal, applicable preliminary financial plan, required documents, Stage 1 approval, and critical flags. Failure returns HTTP 422 with `{ blockers: [{ code, title, entityType, entityId, route, remediation }] }` and makes no completion change.

Success writes the Stage 1 state, actor/time/version, advances the coarse Project phase to the first Stage 2-compatible phase, writes one Activity, and creates idempotent direct-route Notifications. Retry returns the existing completed decision without duplicate side effects.

## 14. Permissions

Every Project endpoint resolves through `BusinessEntityPolicy.projectWhere` or the equivalent existing Project visibility predicate. SELF actors require owner/PM/membership; managed-department and organization/system scopes retain current explicit policy. Disabled users cannot be assigned because user, organization membership, and active dates are validated. Project membership is stored by userId.

Existing domain permissions are reused. Narrow permissions are added only for Stage 1 financial plan read/manage, survey not-applicable, Stage 1 submit/review, gate completion, and scoped financial capabilities that current keys cannot distinguish. Financial columns, aggregates, sort fields, filters, exports, and metadata are omitted server-side for unauthorized actors. Files and comments resolve their parent Project authorization. Redirects never bypass destination checks.

## 15. Member and permission dialog

The navy-header dialog loads Project owner/director, PM, active members, departments, and actor-visible permissions. The Stage 1 slice supports internal membership, PM assignment, role label, department, active status, and financial permission summary using existing users and permissions. Customer/supplier/contractor participants are displayed only when backed by real relations; no email-list security store is added. Email is lookup/invitation input only.

## 16. Routes and compatibility

New real routes are `/projects`, `/projects/mine`, `/projects/actions`, `/projects/alerts`, `/projects/[projectId]`, and Stage 1 overview/initiation/survey/requirements/documents/approval plus members/files/tasks/activity/settings adapters. Stage 2–5 root routes exist only when they can redirect to a real existing domain destination; otherwise the five-stage switcher displays disabled availability without creating pages.

Old Product, Estimate, Quotation, Contract, Inspection, Handover, Warranty, file-download, notification, and document-detail paths remain valid. Query-string workspace URLs redirect to the nearest new canonical route. Stored notification paths continue to resolve. The route table in `OLD_TO_NEW_PROJECT_MAPPING.md` is the compatibility ledger.

## 17. Error, loading, empty, and forbidden states

Client pages render stable skeleton/loading copy, bounded empty states with real navigation only, inline mutation errors, and retry for fetch failures. The API returns not-found for inaccessible Project resources to prevent metadata discovery, except the existing explicit `/forbidden` navigation flow where policy already uses it. Forbidden screens contain no Project, financial, or file metadata. Gate validation displays structured blockers at the related cards/steps.

## 18. Testing strategy

API tests cover membership/project isolation, active-user assignment, financial omission and non-leaking sorts/totals, document/gate rules, survey not-applicable, idempotent approval/gate side effects, self-approval, approver resolution, Activity/Notification, and adapter authorization. Web tests cover user-visible shell, route switching, initiation validation, routing, steps, documents, approvals, readiness, flags, states, dead-CTA prevention, and absence of sensitive markup. Tests are focused rather than snapshots.

Real-database integration tests exercise the Stage 1 transaction and cross-project isolation. Playwright covers the authorized PM-to-approver flow and direct-URL non-member isolation. Every Playwright test asserts no console errors.

## 19. Visual-regression strategy

Playwright captures the dashboard, initiation/routing row, matrix, workflow, step detail/upload, approval, member dialog, and forbidden state at 1536×864 and 1440×900. Artifacts live under the ignored Playwright output directory. Review checks exact sidebar/header proportions, canvas/card/table/form colors and density, stage navigation, navy panel, status pills, red flags, document matrix, overflow, and alignment. Claims list any remaining difference.

## 20. Performance

Summary endpoints use bounded parallel aggregate queries and bulk owner/file lookups. Matrix lists omit version history. Activity is separately paginated. Project selectors are searched/paginated. Financial data is not selected when hidden. No per-row Project member, document file, owner, approval, flag, or readiness query is permitted.

## 21. Implementation slices

Slice 0 replaces the global visual frame, Project dashboard, Project workspace frame, route navigation, backend access/financial filters, readiness/red-flag placement, Required Document/activity slots, compatibility behavior, and standard states.

Slice 1 adds the additive Stage 1 orchestration migration, deterministic routing, initiation, five steps, survey/proposal/preliminary finance, required-document initialization/integration, approval, readiness/red flags, gate, necessary member dialog, API/web/integration/Playwright tests, and visual artifacts.

Stage 2–5 replacement logic is explicitly outside this run. Existing domain routes remain reusable foundations.

## 22. Explicit exclusions

No Stage 2–5 business implementation, Product browser-flow repair, Estimate/Quotation/Contract extension, fake chart/S-curve/AI/GPS/signature/integration, placeholder page, parallel Project system, duplicate business record, general workflow/rules engine, speculative component library, database reset, migration-history rewrite, commit, tag, push, or PR.

## 23. Open risks and resolved decisions

- PostgreSQL and Playwright require the existing Docker Desktop/WSL host integration and local-port permission. They were verified in the continuation run; a future unavailable host integration must be reported as an environment blocker rather than bypassed.
- The existing dirty changes overlap Project services and pages. Edits must preserve and extend them; no reset or discard is allowed.
- Current `ProjectPhase` has fourteen legacy phases. Slice 0 maps them deterministically to five visual stages; schema replacement is deferred to avoid destructive migration.
- The current `Project` requires a customer, so “customer when applicable” is resolved as customer required for this slice.
- Existing generic approval infrastructure is domain-specific. Stage 1 receives only a narrow approval-history model, not a reusable approval engine.
- The authoritative visual blueprint is sufficient; physical reference images are not required for this run.

## Spec self-review

Placeholder scan: no TODO, TBD, “Coming Soon”, fake data, or undefined workflow remains.  
Consistency: five visual stages map over legacy phases while Stage 1 owns only orchestration; existing domains remain authoritative.  
Scope: the implementation plan covers only Slice 0 and Slice 1.  
Ambiguity: customer is required, Stage 2–5 pages are not scaffolded, Stage 1 approval is narrow and versioned, and financial data is omitted server-side.
