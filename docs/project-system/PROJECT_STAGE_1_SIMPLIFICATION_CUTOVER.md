# Project Stage 1 simplification cutover

Date: 2026-08-12  
Branch: `feature/project-business-operations`

## Fresh baseline classification

| Capability             | State       | Evidence                                                                                                              |
| ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Stage Header           | COMPLETE    | Shared PMS shell renders Stage 1 and five stage links.                                                                |
| Project Selector       | COMPLETE    | Scoped `/projects` selector is present.                                                                               |
| Initiation Form        | PARTIAL     | Existing form exposes legacy identity/type/scope/governance/finance fields, not the approved four.                    |
| Initiation Action      | PARTIAL     | Save, initialize, submit, and gate are separate legacy actions.                                                       |
| Five-step Navigator    | PARTIAL     | Five canonical steps exist, but the finance/legacy policy and route props remain.                                     |
| Step Selection         | PARTIAL     | Legacy mini-routes select props; stable `?step=1..5` state is absent.                                                 |
| Step Detail            | PARTIAL     | Detail is mixed with legacy forms/checklists and uses generic completion copy.                                        |
| Multi-file Selection   | NOT_STARTED | Input has no `multiple`; picker and drop handlers read only index zero.                                               |
| UploadSession          | COMPLETE    | Existing per-file resumable session lifecycle passes unit/browser tests.                                              |
| File Transfer          | COMPLETE    | Chunk transfer/checksum/resume/abort pass for one Required Document target.                                           |
| FileAsset Finalization | COMPLETE    | One FileAsset is finalized idempotently for the existing target.                                                      |
| Step/File Linkage      | NOT_STARTED | Upload can target only a pre-existing Required Document; no logical step-document target exists.                      |
| File Persistence       | COMPLETE    | Existing Required Document current file/version survives reload.                                                      |
| Uploaded-file List     | PARTIAL     | Current matrices show configured requirements and blank rows, not only actual step submissions.                       |
| File Download          | COMPLETE    | Authorized current/prior version downloads and outsider denial pass.                                                  |
| File Versioning        | COMPLETE    | Existing Required Document replacement preserves prior versions.                                                      |
| Complete-step Command  | PARTIAL     | Commands work but still require hidden governance, survey/proposal, and preliminary-finance fields.                   |
| Stage 1 Legacy UI      | COMPLETE    | Routing, issues, governance, readiness, finance, approval, and matrices are still rendered.                           |
| Route Compatibility    | PARTIAL     | Legacy routes render the root with prop state or anchors rather than canonical query redirects.                       |
| Authorization          | COMPLETE    | Existing Project/document/upload/download isolation passes the old browser flow; new targets still need direct tests. |
| Playwright             | PARTIAL     | Four old-scope flows pass; approved simplified flows are absent.                                                      |
| Visual Acceptance      | PARTIAL     | Old matrix/dashboard captures exist; simplified responsive captures do not.                                           |

## Reproduction evidence

- PostgreSQL and Redis healthy; Prisma validate passed and all 50 migrations
  were current.
- Focused API unit baseline: 226/226 passed.
- Focused Web unit baseline: 77/77 passed.
- Existing real Stage 1 Playwright baseline: 4/4 passed in two minutes,
  including one-file UploadSession transfer, FileAsset linkage, version
  history, reload persistence, download, and outsider denial.
- The passing baseline proves the old per-requirement transport is not a dead
  endpoint; it also proves the new multi-file/per-step behavior is untested and
  absent.

## Proven root causes

### File selection/upload

`DocumentUpload` owns `useState<File>()`, the input lacks `multiple`, the change
handler reads `event.target.files?.[0]`, and drop reads
`event.dataTransfer.files[0]`. Selecting or dropping several files therefore
retains only the first file. The upload loop operates on one `File`, so partial
batch success, per-file retry/type override, and bounded concurrency cannot
occur.

### Selected-file retention

Every new selection overwrites the single `File` state. Closing/unmounting the
upload dialog discards that in-memory file. Local storage retains only one
opaque UploadSession ID per Project/requirement and browsers cannot persist a
`File` object across reload, so a resumed session correctly asks the user to
reselect the matching file but cannot restore a multi-file queue. The new queue
must retain all selected files while mounted and persist only resumable session
metadata, not pretend browser `File` objects survive reload.

### FileAsset/document linkage

The existing completion transaction correctly creates one FileAsset,
EntityAttachment, Required Document version, and current-file assignment for a
pre-existing `requiredDocumentId`. It cannot link a new logical document chosen
inside a step because UploadSession accepts only `requiredDocumentId`, and
`ProjectRequiredDocument` is unique on
`projectId + stageKey + workstreamKey + documentType`. Multiple same-type
logical submissions therefore require the approved narrow additive step-
document/version relation and a second target branch in the same upload
service—not a second uploader or FileAsset system.

### Duplicate/excessive document UI

The root passes a global `StageRequiredDocumentGroups` through
`documentsSlot`, while selected-step rendering uses the same canonical
requirement source again. The group component intentionally renders configured
requirements, completion counts, empty rows, ownership/due dates, policy, and
secondary actions. Combining global and selected projections makes Stage 1
long and repeats the same domain list instead of showing actual submissions
once for the selected step.

### Hidden completion blockers

Assignment completion calls `deriveStageOneGovernanceChecks` and explicitly
requires responsibility notes, principal/coordinators, manager/members, and
department. Finance completion explicitly requires preliminary revenue, cost,
currency, date, and derived margin. Survey/proposal completion requires legacy
record/form fields. The global gate also re-evaluates those readiness and Red
Flag rules. Removing only their UI would leave invisible blockers; the
simplified policy must replace these predicates for Stage 1 completion while
preserving historical values.

## Component/route cutover classification

- KEEP_DOMAIN: `UploadSession`, `UploadPart`, `FileAsset`, `EntityAttachment`,
  `ProjectRequiredDocument`, `ProjectRequiredDocumentVersion`, Project stage
  rows, Approval, Activity, Audit, Notification, Customer/Contact.
- REUSE: shared PMS shell/header/switcher, Project selector, member-permission
  dialog, money normalization, upload constraints/parts/checksum/storage,
  file metadata/download authorization, Required Document configuration.
- ADAPT: Stage 1 service/controller/DTO/rules, UploadSession target/finalizer,
  Stage 1 root, selected-step navigation, compatibility tests and fixture.
- REDIRECT: legacy initiation → Step 1, survey → Step 2, requirements → Step 3,
  approval → Step 5, Stage-qualified document links → resolved step/anchor.
- DELETE_AFTER_CUTOVER: Stage 1 primary routing panel, Red Flag/action summary,
  governance card, readiness card, preliminary-finance form/summary, separate
  approval card, global/selected requirement matrices, empty-row renderer, and
  dead upload handlers after `rg`, typecheck, tests, build, and browser proof.

Deleted files: none yet. This list will be updated only after verified cutover.

## Final simplified cutover — 2026-08-12

The baseline table above is retained as the pre-cutover record. Fresh API,
Web, database, and browser evidence now classifies the requested Stage 1 slice
as follows:

| Capability                   | Final state | Fresh evidence                                                                                               |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| Stage Header                 | COMPLETE    | Exact badge/title and five authorized stage links; blue active state.                                        |
| Project Selector             | COMPLETE    | Project-policy-scoped selector plus `Phân quyền dự án`.                                                      |
| Initiation Form              | COMPLETE    | Exactly four business inputs; existing Project ID and Decimal VND persist.                                   |
| Initiation Action            | COMPLETE    | One idempotent CTA creates one pending approval and five steps once.                                         |
| Five-step Navigator          | COMPLETE    | Exact labels, URL selection, completed/selected states, dynamic detail/action.                               |
| Step Detail                  | COMPLETE    | One workspace; missing named types appear only after a failed completion.                                    |
| Multi-file Selection         | COMPLETE    | Native multiple picker/drop, per-file type/name/remove/progress/abort/retry.                                 |
| UploadSession/File Transfer  | COMPLETE    | Existing bounded resumable path; partial success and retry verified.                                         |
| FileAsset/Step Linkage       | COMPLETE    | Short final transaction creates one FileAsset, logical document/version/current link, Activity and Audit.    |
| File Persistence/Versioning  | COMPLETE    | Reload persistence, v1→v2 history, both downloads, current version verified.                                 |
| Uploaded-file List           | COMPLETE    | One selected-step list containing actual logical documents only.                                             |
| Complete-step/Stage commands | COMPLETE    | Hidden legacy gates excluded; Steps 1–5 and Stage 1 complete idempotently after real approval.               |
| Stage 1 Legacy UI            | COMPLETE    | Obsolete primary dashboard sections are absent from the new route.                                           |
| Route Compatibility          | COMPLETE    | Native redirects map initiation→1, survey→2, requirements→3, approval→5; document links resolve step/anchor. |
| Authorization                | COMPLETE    | Member, outsider, on-behalf, metadata/history/session/download bytes verified directly.                      |
| Playwright                   | COMPLETE    | Simplified spec 12/12 across four projects/viewports; full Project baseline 16/16.                           |
| Visual Acceptance            | COMPLETE    | Seventeen ignored acceptance PNGs opened at original detail after final recapture.                           |

### Final component classification

- **KEEP_DOMAIN:** Project, Customer/Contact, Required Document history,
  UploadSession/UploadPart, FileAsset/EntityAttachment, Approval, Activity,
  Audit, Notification, and the legacy policy/data required by later stages.
- **REUSE:** existing API proxy/auth, Project policy, scoped Project/member
  sources, money helpers, upload constraints/checksum/parts/storage, file
  authorization/download, and shared shell.
- **ADAPT:** Stage 1 rules/service/controller/DTO, UploadSession logical target,
  concise Stage 1 workspace, upload queue, safe fixture, and Project browser
  baselines.
- **REDIRECT:** the four legacy mini-routes through native Next redirects;
  Stage-qualified document/requirement links through the step resolver and
  stable document anchor.
- **DELETE_AFTER_CUTOVER — deleted:**
  `apps/web/features/projects/project-governance-card.tsx` and
  `apps/web/features/projects/stage-one-readiness-card.tsx`, plus the four
  native-redirect-shadowed wrappers:
  `apps/web/app/projects/[projectId]/stage-1/initiation/page.tsx`,
  `apps/web/app/projects/[projectId]/stage-1/survey/page.tsx`,
  `apps/web/app/projects/[projectId]/stage-1/requirements/page.tsx`, and
  `apps/web/app/projects/[projectId]/stage-1/approval/page.tsx`.
  Reference search and Task 4 checks proved the two component removals; native
  redirect tests, route generation, browser compatibility, and the production
  build prove the four wrapper removals. The shared Required Document matrix was retained
  because Stage 2–5 routes still use it; it is not rendered by primary Stage 1.

### Final upload and completion root causes

- Multi-file selection failed because the retired dialog had one `File` state,
  no `multiple`, and read only `files[0]`/drop index zero. The concise queue now
  owns every selected `File` independently.
- Selected files disappeared because successful-sibling refetch replaced the
  Step object and an identity-dependent effect reset the queue. Reset now
  depends only on stable step key/number and merges per-file results.
- Logical linkage failed because UploadSession accepted only one pre-existing
  Required Document target whose unique key forbade many same-type logical
  submissions. The same UploadSession/FileAsset finalizer now accepts the
  narrow `ProjectStageOneDocument` target and appends versions atomically.
- The old page was duplicated/long because global Required Document groups and
  selected-step projections rendered configured blank rows, while routing,
  readiness, governance, finance, Red Flags, approval and diagnostics were
  composed into the same primary page. The cutover renders one short workspace
  and one actual-document list.
- Hidden completion failed because legacy step/gate predicates explicitly
  required governance/responsibility, survey/proposal form state, preliminary
  finance, Red Flags, and all legacy requirements. The simplified V2 policy
  gates only the four initiation values, configured named document types, real
  integrity, and the configured Step 5 approval decision.

### Browser and visual evidence

- Initial RED: the obsolete spec failed immediately by expecting the retired
  `/stage-1#document-*` destination instead of canonical
  `/stage-1?step=1#document-*`; the remaining serial cases did not run.
- Final simplified suite: **12/12 passed** across `1536×864`, `1440×900`,
  `1280×800`, and `390×844` in 1.6 minutes. Compatibility proves one actual,
  visible, highlighted legacy document target; responsive cases navigate steps
  and exercise queue/remove/disabled-submit behavior.
- Full configured Project baseline: **16/16 passed** in 1.9 minutes.
- Focused Web Stage 1: **27/27 passed**; Stage 1 plus compatibility:
  **38/38 passed** at the Task 5 checkpoint; final fixture cleanup safety is
  **4/4 passed**; Web typecheck passed.
- Production Web build compiled in 5.5 seconds, completed TypeScript in 8.7
  seconds, and generated **77/77** routes. Independent re-review is approved
  with no Critical or Important finding.
- All 17 images under `.artifacts/stage-1-simple/` were opened at original
  detail. Inspection found one stretched funding selector caused by grid-row
  stretch; `sm:items-start` fixed it. All images were regenerated and reopened.
  Final captures have no duplicate uploader/list, clipping, horizontal page
  overflow, raw enum/debug output, empty requirement matrix, or legacy warning
  dashboard.
- The fixture uses fixed synthetic Project/user IDs, discovers and deletes only
  records belonging to that Project or those users, retains their exact storage
  keys, and removes only validated objects below the configured storage root.
  An executable sentinel test preserves an adjacent non-fixture object, and
  both final browser teardowns left zero new blobs. The 23 known pre-fix orphan
  test PDFs were confirmed unreferenced and removed. No
  database reset, migration rewrite, seed, drop, or business-record deletion
  occurred.
