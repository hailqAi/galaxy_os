# Sprint 2 — Complete Business Operations — UX and operations audit

Audit date: 2026-07-23. Scope was limited to the existing operational routes requested for Sprint 2 — Complete Business Operations. Playwright Chromium baseline completed with the repository fixture; code-path review covered the routes that the fixture does not yet populate.

## Findings

| Area                            | Finding                                                                                                                                                           | Sprint 2 — Complete Business Operations response                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard                       | Existing route re-exports the home page and has no commercial, procurement, inventory, or cash-flow context.                                                      | Replace with permission-scoped operational KPIs after vertical slices expose aggregates.                                             |
| Customers, leads, opportunities | CRUD is findable, but the hand-off into a project is not presented as the next action consistently.                                                               | Keep the existing CRM flow; add project-context links rather than another CRM workflow.                                              |
| Project detail                  | A small collection of panels exposed members and departments, but did not answer the next operational step. The phase action only handled the first three phases. | Replaced by a left-navigation workspace, lifecycle progress, project summary, contextual empty states, and one primary quick action. |
| Tasks                           | Shared task relationships are already suitable for new entities.                                                                                                  | Reuse `relatedEntityType` and `relatedEntityId`; do not create a second task system.                                                 |
| Surveys and requirements        | Separate list/detail routes work, but project context requires navigation away from the project.                                                                  | Surface both from the project workspace.                                                                                             |
| Files                           | Existing upload is appropriate for ordinary files only; it is not a resumable large-object path.                                                                  | Keep it for current assets and add a separate upload-session flow for large objects.                                                 |
| Notifications                   | Useful as a global inbox; operational alerts do not yet exist.                                                                                                    | Emit only actionable phase alerts and preserve project references. Marketing alerts remain disabled.                                 |
| Import                          | Request-oriented workbook processing cannot safely cover multi-gigabyte sources.                                                                                  | Separate attachment upload from queued streaming import processing.                                                                  |
| Navigation                      | Marketing remained visible when permissions existed. Commercial and supplier master data were absent.                                                             | Marketing is feature-guarded and hidden by default; catalog and suppliers are permission-aware entries.                              |
| Responsive layout               | Dense tables and the old project detail had no small-screen information hierarchy.                                                                                | Project navigation scrolls on smaller screens and becomes a fixed left column on desktop; secondary context is isolated.             |

## Browser/runtime baseline

- Existing Playwright Chromium suite passed with one worker.
- No baseline hydration, `pageerror`, or critical request failure was reported by the fixture suite.
- Full API integration baseline requires the local PostgreSQL service; without it, database suites fail before test execution.
- The fixture only covers authentication and user administration today. Sprint 2 — Complete Business Operations scenarios must extend it with project and operational endpoints and fail on `pageerror`, unexpected `console.error`, HTTP 500, and critical request failures.

## Delivery order

Implementation follows the requested vertical slices. Each slice includes the database model, tenant-scoped API, permission, usable UI, and a targeted test before the next slice. Financial fields remain decimal-backed and internal cost, margin, bank reference, and payment approval receive separate permissions.
