# PMS Stage 1 reference audit

Date: 2026-08-11  
Reference: user-authorized read-only PMS inspection

## Inspection method and security

The current run attempted a new disposable authenticated browser session, but
the execution safety reviewer blocked credential submission before login. No
authenticated mutation was attempted and no credential was stored or printed.
The existing ignored authenticated captures under `.artifacts/pms-reference/`
were therefore reopened and inspected at original resolution together with the
prior read-only audit. They contain no password. The public login capture from
this run is also ignored.

The reference is a single-page application whose browser URL remains `/`.
Paths below are UI navigation paths, not stable HTTP routes. Reference sample
records, legal wording, SmartCA claims, financial values, and public-sector
routing are visual evidence only and are not Galaxy OS business rules.

## Route and navigation path

1. Login.
2. Sidebar `GĐ 1` or Executive dashboard Project action.
3. Project Stage 1 workspace.
4. Five-stage switcher (`GĐ 1`–`GĐ 5`).
5. Project selector and Project permission action.
6. Five-step Stage 1 process and selected-step workspace.

Galaxy OS maps this to `/projects/:projectId/stage-1`. Existing deep routes
remain compatibility entries, while document corrections stay on the Stage 1
root through section and requirement anchors.

## Page and card order

The inspected Stage 1 page is one vertical workspace:

1. Stage badge/title and five-stage switcher.
2. Project selector and permission action.
3. Initiation form at roughly 70% width beside a navy routing panel at roughly
   30% width.
4. Compact Required Document table.
5. Five-step process cards.
6. Selected-step detail.
7. Upload area.
8. Submitted-file list.

The selected step changes detail content without replacing the page frame.
Stage 2–5 reuse the same hierarchy: compact header/context, horizontal
workstream tabs, one or two dense business cards, and documents at the bottom
of the active workstream. Stage 4 uses colored workstream accents; Stage 5
reserves danger styling for consequential closure actions.

## Form structure

The reference initiation form is compact and grouped rather than a long raw
database form. Labels sit above controls, related fields share two-column
rows, completed context is summarized, and a single primary action closes the
form. The navy panel communicates derived routing, approvals, document count,
risk, blocker, and next action.

Galaxy OS keeps its approved identity, Project type, governance, scope,
milestone, survey, finance, and approval data. The target governance card uses
an existing accountable Project principal, selected active Project-member
coordinators, a policy-resolved approver, and a bounded responsibility note.

## Required Document table structure

The reference Stage 1 table contains five concise columns: document, step,
submission status, attached file, and action. Status appears once. Each row has
one visually dominant upload action; technical metadata is absent. Later-stage
document areas use the same compact density, often as small warning cards when
few documents apply.

Galaxy OS adapts this to the approved operational columns: `Hồ sơ`,
`Trạng thái`, `Phụ trách`, `Hạn`, and `Thao tác`. Applicable requirements are
grouped by business purpose. Completion policy, checksum, workflow codes,
version metadata, and history move to the detail dialog/drawer.

## Upload interaction

The reference keeps upload inside the selected stage/step. It shows document
type, submitter/responsible context, a file input or drop area, one submit
action, and a submitted-file list. The inspected reference advertises SmartCA
and fixed limits; Galaxy OS must not copy those claims.

Galaxy OS reuses its configured UploadSession constraints, resumable parts,
checksum verification, retry/resume/abort, FileAsset finalization, append-only
Required Document versions, current version, authorization, Activity, and
Audit. Upload success must refresh the document list, readiness, actionable
issues, and stage gate without navigation or a full-page reload.

## Status and action design

The reference uses restrained inline pills: blue selected/in-progress, pale
green complete, amber missing or due, red rejected/critical, and purple
progress. Ordinary missing work is a warning, not a global hard block.

One primary action is visible per row. Secondary upload/version/history/
review actions belong in a compact overflow control. Stage actions sit at card
edges and do not repeat generic owner, due-date, and remediation copy when it
adds no decision value.

## Modal and drawer behavior

The Project permission control opens a centered modal with dimmed backdrop,
navy header, explicit close action, current owner context, and clear add/remove
hierarchy. Upload and document history should use the same contained in-page
interaction pattern. Galaxy OS uses native dialogs with labelled titles,
Escape/explicit close, focus restoration, and backend authorization.

## Galaxy OS mapping

- Preserve PortalShell, IAM, Project, Project membership, Department,
  FileAsset, UploadSession, Required Document, Approval, Activity,
  Notification, and Audit as the only sources of truth.
- Keep all five authorized stage roots navigable without adding unfinished
  Stage 2–5 workflows.
- Replace the current raw Stage 1 form/matrix presentation; do not create a
  second Project home, upload service, document system, or workflow engine.
- Use server-derived applicability, completion policy, readiness, issues, and
  gate state. The Web client presents these values and invalidates them after
  mutations; it does not calculate a competing truth.
- Keep document/file authorization and financial disclosure enforcement in the
  API. Never expose storage paths, checksums, bytes, or history to outsiders.
- Match the reference hierarchy and density while using truthful Galaxy OS
  business labels, configured limits, and real data only.

## Galaxy OS baseline mismatch observed before the rebuild

The following defects describe the reproduced pre-rebuild baseline, not the
verified post-cutover Stage 1 workspace:

- Stage 1 is still a long expanded form rather than a concise operational
  workspace.
- Governance is only Project Manager plus one ambiguous responsibility note.
- The full eight-column matrix and a second selected-step matrix render the
  same Required Document source twice.
- The matrix exposes completion policy and current-file state in the default
  view, shows every action inline, and has no mobile card treatment.
- The current `Cờ đỏ` card repeats generic owner, missing due date,
  remediation, and action copy.
- Existing desktop captures show no horizontal page overflow, but there is no
  mobile acceptance evidence and the document table remains horizontally
  scrollable.
