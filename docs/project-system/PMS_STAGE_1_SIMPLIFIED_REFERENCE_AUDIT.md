# PMS Stage 1 simplified reference audit

Date: 2026-08-12  
Reference: user-authorized read-only PMS inspection

## Method and security

The reference returned HTTP 200. The current browser connector could not open
the unindexed application URL, so the existing authenticated read-only
Playwright captures were reopened at original resolution. They were copied to
the ignored directory `.artifacts/pms-reference/stage-1-simple/`; no password
is present in source, documentation, terminal output, or screenshots. No
reference mutation was performed.

## Observed structure

The reference Stage 1 screen uses a light canvas, white compact cards, blue
active states, pale-green completed states, and this vertical hierarchy:

1. Stage badge/title and five-stage switcher.
2. Project selector and Project-permission action.
3. Compact Project initiation form.
4. Five-step horizontal navigator.
5. One selected-step detail panel.
6. Document type and submitting-officer controls.
7. Drag/drop upload zone and one submission action.
8. Submitted-document list for the selected step.

The approved Galaxy OS adaptation removes the reference's legal-routing panel,
classification/special-condition controls, SmartCA claim, global matrix, raw
codes, fixed 50 MB copy, and empty required rows. Galaxy OS uses its configured
limits, canonical Project/Customer/FileAsset/UploadSession/Required Document
data, and backend authorization.

## Reference details relevant to implementation

- Header: blue `STAGE 1` badge, uppercase title, compact `GĐ 1`–`GĐ 5`
  switcher.
- Context: one Project select and one `Phân quyền Dự án` action.
- Initiation: Project name, expected investment, funding source, and
  investor/representative are the four approved Galaxy OS inputs.
- Navigator: five equal horizontal cards with strong selected blue and
  completed pale green.
- Detail: title and responsible department are concise; no owner/due/debug
  metadata appears in every step card.
- Upload: one document type select, one submitting-officer field, a large
  dashed drop zone, one primary upload action, then a compact submitted list.
- Density: cards use roughly 16 px corners, 16–24 px internal spacing, compact
  headings, restrained status colors, and no database-administration layout.

## Proven reference defect not to copy

In the Step 1 capture the selected detail says `CHI TIẾT BƯỚC 1`, while the
completion action says `Hoàn Tất & Nghiệm Thu Bước 2`. Galaxy OS must derive
both title and action label from the same selected URL step.

## Captures inspected

- `.artifacts/pms-reference/stage-1-simple/stage-1-overview.png`
- `.artifacts/pms-reference/stage-1-simple/step-1.png`
- `.artifacts/pms-reference/stage-1-simple/step-2.png`
- `.artifacts/pms-reference/stage-1-simple/step-3.png`
- `.artifacts/pms-reference/stage-1-simple/step-4.png`
- `.artifacts/pms-reference/stage-1-simple/step-5.png`

All six captures were inspected against the approved simplified scope. The
reference is authoritative only for hierarchy, density, and visual treatment;
its sample data, legal claims, raw status codes, and signature claims are not
Galaxy OS requirements.

## Final Galaxy OS comparison

The final simplified implementation matches the useful reference hierarchy:
light canvas, compact white cards, strong Stage/section headings, blue active
states, pale-green completed states, five concise steps, one selected-step
workspace, one multi-file drop zone, and one actual-file list. It intentionally
does not copy the reference's stale selected-step/action mismatch, fixed upload
limit, SmartCA implication, legal-routing diagnostics, empty matrix rows, or
raw status output.

Seventeen final Galaxy OS captures were regenerated after browser acceptance and
opened at original detail:

- `.artifacts/stage-1-simple/1536x864/01-stage-header.png`
- `.artifacts/stage-1-simple/1536x864/02-four-field-initiation.png`
- `.artifacts/stage-1-simple/1536x864/03-five-step-navigator.png`
- `.artifacts/stage-1-simple/1536x864/04-step-1-selected.png`
- `.artifacts/stage-1-simple/1536x864/05-multi-file-queue.png`
- `.artifacts/stage-1-simple/1536x864/06-upload-in-progress.png`
- `.artifacts/stage-1-simple/1536x864/07-uploaded-document-list.png`
- `.artifacts/stage-1-simple/1536x864/08-missing-document-error.png`
- `.artifacts/stage-1-simple/1536x864/09-completed-step.png`
- `.artifacts/stage-1-simple/1536x864/10-step-5.png`
- `.artifacts/stage-1-simple/1536x864/11-completed-stage-1.png`
- `.artifacts/stage-1-simple/1536x864/13-forbidden-state.png`
- `.artifacts/stage-1-simple/1536x864/responsive-layout.png`
- `.artifacts/stage-1-simple/1440x900/responsive-layout.png`
- `.artifacts/stage-1-simple/1280x800/responsive-layout.png`
- `.artifacts/stage-1-simple/390x844/12-mobile-layout.png`
- `.artifacts/stage-1-simple/390x844/responsive-layout.png`

The mobile `responsive-layout.png` captures the uploader and actual-file cards
after responsive step-navigation and queue-control checks; the full-page mobile
capture supplies the complete header-to-list view. Inspection found and
corrected one desktop form-density issue (funding selector stretched to the
taller investor row), then reopened the complete final capture set after the
post-review 12/12 and 16/16 browser runs. No clipping, duplicate document
renderer, horizontal overflow, raw code, long matrix, or old administration-
dashboard treatment remains in the Stage 1 workspace. The mobile full-page
capture proves the same single uploader and actual-document cards remain usable
at 390×844.
