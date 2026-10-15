# Optional document and Stage 2 cutover

Date: 2026-08-14  
Branch: `feature/project-business-operations`

This matrix is based on fresh repository, browser, network-response, and
migration evidence. It preserves the existing dirty worktree and uploaded-file
history.

| Current area                                                           | Decision             | Reason / target                                                                                                                                                               |
| ---------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project`, Customer, Contact, ProjectMember, Department                | KEEP_DOMAIN          | Canonical Project identity, counterparty, membership, and organization scope.                                                                                                 |
| `ProjectStageState`, `ProjectStageStep`                                | KEEP_DOMAIN          | Canonical Stage/Step status; remove document and prior-stage predicates from covered completion commands.                                                                     |
| `ProjectRequiredDocument` and versions                                 | ADAPT                | Reuse as Project-scoped optional document definitions/history; add only ordering, visibility, description, and initial-matrix metadata that current columns cannot represent. |
| `ProjectStageOneDocument` and versions                                 | REUSE                | Existing logical multi-file/version relation for Stage 1 actual submissions.                                                                                                  |
| `UploadSession`, `UploadPart`, `FileAsset`, `EntityAttachment`         | REUSE                | One resumable transfer/finalization/download system for every covered upload.                                                                                                 |
| Stage 1 four-field initiation                                          | REUSE                | Existing Decimal/funding/Customer flow is substantially complete; change default document initialization to five optional matrix rows without reseeding custom changes.       |
| Stage 1 fixed server document arrays                                   | ADAPT                | Retain as one-time defaults only; runtime options come from Project definitions.                                                                                              |
| Stage 1 `missingDocuments` completion response/UI                      | DELETE_AFTER_CUTOVER | Files and document types are optional and cannot gate completion.                                                                                                             |
| Stage 1 old governance/readiness/finance/approval gate commands        | KEEP_DOMAIN          | Historical APIs remain for compatible callers, but the optional Step/Stage commands do not invoke them.                                                                       |
| `StageRequiredDocumentMatrix`                                          | KEEP_DOMAIN          | Other callers may still need it; it is not the Stage 1/Stage 2 primary UI after cutover.                                                                                      |
| Stage 1 retired mini-routes                                            | REDIRECT             | Preserve canonical `?step=1..5` compatibility and document anchors.                                                                                                           |
| `ProjectStageAccess` inherited-data section                            | DELETE_AFTER_CUTOVER | Remove `DỮ LIỆU KẾ THỪA`, earlier-stage warnings, and redirects; retain direct record-level links only in real business screens.                                              |
| Stage 2 generic access page                                            | ADAPT                | Replace with the approved three-tab page and fully backed Step 1.                                                                                                             |
| Generic `Task`                                                         | ADAPT                | Reuse for baseline rows; add the minimum code/baseline-version/allocated-budget fields and scoped uniqueness.                                                                 |
| Existing ExcelJS/import parsing                                        | REUSE                | Reuse bounded parsing, formula handling, and XLSX generation; add Project/plan-specific preview and confirmation.                                                             |
| Stage 2 Required Document definitions/upload versions                  | ADAPT                | Four Project-scoped optional types, shared uploader, actual-file list only.                                                                                                   |
| Stage 3–5 access pages                                                 | ADAPT                | Remove inherited-data UI/warnings only; do not expand business functionality.                                                                                                 |
| Separate Stage-specific uploader/service/file table                    | DELETE_AFTER_CUTOVER | Must not be introduced; remove any proven dead duplicate handler after caller search.                                                                                         |
| Historical files, versions, Activity, Audit, notifications, migrations | KEEP_DOMAIN          | Never delete or rewrite.                                                                                                                                                      |

## Final cutover classification

| Scope                                  | Status   | Evidence                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stage 1 initiation                     | COMPLETE | Four visible inputs, canonical Decimal/funding/Customer persistence, idempotent command, focused tests, and Flow A pass.                                                                                                                                                                                                 |
| Initial five-row matrix                | COMPLETE | Production initializes the exact five optional rows once in Step 1–5 order; the desktop table uses the approved copy, statuses, attachment drawer, and action menu.                                                                                                                                                      |
| Document customization                 | COMPLETE | Project-scoped add, edit, move, reorder, hide, restore, reload persistence, and duplicate handling are covered by component/API tests and Flow A.                                                                                                                                                                        |
| Step upload UI                         | COMPLETE | The shared picker/drop queue supports multiple files, retry/abort, progress, partial success, and completed-item dedupe; Flows C–E pass.                                                                                                                                                                                 |
| UploadSession / FileAsset finalization | COMPLETE | Flows C–E and H create sessions, finalize assets, render/download actual files, and survive reload without duplication.                                                                                                                                                                                                  |
| Definition/linkage                     | COMPLETE | Matrix and selected-Step uploads resolve one Project-scoped optional definition ID; fixture setup consumes production default initialization rather than duplicating it.                                                                                                                                                 |
| Five-step workflow                     | COMPLETE | One URL Step owns navigator, detail, upload, list, and completion; legacy links redirect to this workspace.                                                                                                                                                                                                              |
| Step/Stage completion                  | COMPLETE | All covered documents are optional; five Steps and Stage 1 complete with zero files, and Stage 2 Step 1 completes with an empty plan and no files.                                                                                                                                                                       |
| Stage 2–5 inherited-data removal       | COMPLETE | Covered later-stage reads/routes contain no upstream warning, missing-file gate, inherited card, or earlier-stage redirect. Stage 3–5 otherwise retain their existing business surfaces.                                                                                                                                 |
| Stage 2 three tabs / Step 1 plan       | COMPLETE | The canonical Stage 2 route owns three query tabs and a real editable/reloadable baseline plan backed by `Task`.                                                                                                                                                                                                         |
| Stage 2 template/import                | COMPLETE | Authorized XLSX template, bounded upload, preview, confirm, import persistence, and direct-route denial are covered by API and Flow G/I.                                                                                                                                                                                 |
| Stage 2 optional documents             | COMPLETE | Production initializes the exact four Project-scoped optional types once; empty completion, multi-file upload/list/reload, real timestamp, and version action pass.                                                                                                                                                      |
| Authorization                          | COMPLETE | Backend policy and Flow I deny non-members from Stage routes, file bytes, template, preview, and confirm without data exposure.                                                                                                                                                                                          |
| Route compatibility                    | PARTIAL  | Legacy Stage 1/document routes, Activity/Notification links, and later-stage direct routes passed. Stage 2 `?step=1..3` has focused unit coverage and newly added real-browser click/reload assertions, but the post-review four-test browser command was blocked before process creation by repeated approval timeouts. |
| Playwright / visual acceptance         | PARTIAL  | The definitive pre-review fixture-backed run passed 20/20 across Flows A–I and four responsive viewports; all 18 captures were opened at original detail. The post-review fixture/route fix is unit-verified but its focused browser rerun and affected state 9–12 recapture remain externally blocked.                  |

## Proven upload baseline

Focused Playwright flow 3 reached picker/drop, queue, UploadSession initiation,
transfer, FileAsset finalization, logical document/version creation, list
refresh, and reload persistence. It then failed at the assertion that the
logical document must be linked to a legacy Required Document. The server
lookup links only an exact matching Project/Stage/Step/document-type row; the
fixture/current simplified defaults did not provide a matching configured row.
The root fix is now implemented: one idempotent Project definition source feeds
the matrix, Step types, upload target creation, and list refresh. Stage 2 has
the same one-time production initializer for its exact four optional types.
Neither fixture creates a competing definition source.

## Deletion gate

Delete a current component/handler only after `rg` proves no legitimate caller,
focused tests cover the replacement, legacy links redirect, Playwright passes,
and uploaded/history records remain queryable. No domain table, migration, or
business data is a UI cutover target.

## Final caller/deletion audit

- `StageRequiredDocumentMatrix` remains a legitimate Stage 3–5 caller and is
  therefore `KEEP_DOMAIN`; it is not duplicated into the new Stage 1/2 views.
- Legacy Required Document APIs, history, initiation, governance, approval, and
  gate routes remain `KEEP_DOMAIN` or `REDIRECT` because tracked callers and
  compatibility tests still exercise them.
- The only other production `missingDocuments` match is the unrelated
  after-sales workflow. It was not changed.
- Searches find `DỮ LIỆU KẾ THỪA` and `upstreamWarnings` only in negative tests,
  not production Project Stage UI/service code.
- No production file, handler, CSS rule, model, history, or migration was
  deleted: caller proof did not justify any deletion beyond the already
  removed inherited presentation from Tasks 1–8.
