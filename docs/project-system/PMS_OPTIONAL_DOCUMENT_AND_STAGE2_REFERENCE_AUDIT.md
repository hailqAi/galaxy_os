# PMS optional-document and Stage 2 reference audit

Date: 2026-08-14  
Reference: `https://pms-2026-ek4i.vercel.app/`  
Authority: approved 2026-08-14 Galaxy OS optional-document and Stage 2 prompt

## Inspection method

The current browser connector could not expose an authenticated interactive
session. The audit therefore uses the previously captured, ignored reference
artifacts under `.artifacts/pms-reference/`, their DOM inventories, and the
approved prompt, as explicitly permitted. The captures are from the authorized
reference application and contain no password. No credential was written to a
tracked file, environment file, fixture, screenshot, or this audit.

Inspected captures:

- `stage-1.png` and `stage-1-tab-1..5.json/png`;
- `stage-2.png` and `stage-2-tab-1..3.json/png`;
- `stage-3.png`, `stage-4.png`, and `stage-5.png`.

## Stage 1 observations

- The page uses a light canvas, white rounded cards, a compact stage header,
  Project selector, and five-stage switcher.
- The initiation form precedes the document matrix. The reference form includes
  routing and SmartCA claims that Galaxy OS must omit because those integrations
  are not verified.
- The initial matrix contains exactly five rows and exactly these columns:
  document name, Step, submission status, attachment, and action.
- The five-step navigator is one horizontal row. Completed Steps are pale
  green; the selected Step is solid blue; inactive Steps are neutral.
- The selected-Step card places its completion action at the upper right,
  followed by one upload card and one actual-submission list.
- The reference currently contains mandatory-file copy and a mismatched
  selected-Step completion label. Galaxy OS follows its visual hierarchy but
  replaces those behaviors with optional files and one selected-Step source of
  truth.

## Stage 2 observations

- The header is followed immediately by three equal-width tabs. The active tab
  is solid blue and the others are white/neutral.
- Step 1 is a single baseline-plan card followed by one document card. The plan
  actions sit at the top right in this order: template, Excel upload, save.
- The plan table is dense but readable: a pale header, compact row height,
  right-aligned budget, and edit/delete actions at the far right. The DOM audit
  confirms seven columns and three reference-only sample rows; Galaxy OS must
  not ship those samples.
- `+ THÊM CÔNG VIỆC TIẾN ĐỘ MỚI` spans the plan-table width below the rows.
- The reference document card uses one type selector, officer/department field,
  file picker, and right-aligned upload action. Its missing-document cards,
  SmartCA label, fixed size claim, and physical PMS storage path are explicitly
  excluded from Galaxy OS.
- Step 2 and Step 3 demonstrate the same three-tab shell and card density.
  Existing real Galaxy OS functionality may remain; fake BOQ or approval
  content must not be introduced.

## Dimensions and density

- Reference full-page captures are 1536 px wide. Stage 1 is 2248 px high;
  Stage 2 Step 1 is 1391 px high.
- The content column starts after the fixed sidebar and uses roughly 20–24 px
  gaps between 16 px-radius cards.
- Primary cards use about 20–24 px internal padding. Tables use compact headers
  and approximately 44–52 px rows rather than large dashboard tiles.
- Buttons are grouped with the owning card, not placed in a global toolbar.
  Each context has one visually dominant blue or green action.

## Later-stage navigation

The captured Stage 2, Stage 3, Stage 4, and Stage 5 screens are independently
navigable from the same five-stage switcher. They do not show a whole-stage
`DỮ LIỆU KẾ THỪA` card or redirect to an earlier stage. Galaxy OS must match
that route behavior even when prior stages are incomplete.

## Galaxy OS adaptation decisions

- Keep: short hierarchy, five-row Stage 1 matrix, compact tables, button
  placement, selected/completed styles, and Stage 2 three-tab structure.
- Reuse: Project shell, Project selector, Project/Task/Department data,
  Required Document configuration/history, UploadSession, FileAsset,
  EntityAttachment, Activity/Audit, and current authorization policy.
- Change: all Stage documents are optional; show actual files only; use the
  configured upload limit; allow customization and multi-file queues; use real
  baseline rows and a real XLSX preview/confirm flow.
- Remove: routing panel, readiness/file counters, missing-file warnings,
  inherited-data cards, fake SmartCA claims, physical storage paths, and mock
  Stage 2 rows.

## Acceptance comparison

Final screenshots must be compared at 1536×864, 1440×900, 1280×800, and one
mobile viewport for hierarchy, table density, active/completed states, button
placement, horizontal overflow, clipping, raw codes, duplicate upload/list
surfaces, missing-file warnings, and inherited-data cards.

## Final acceptance comparison — 2026-08-14

The definitive pre-review fixture-backed acceptance suite passed 20/20 in 2.1
minutes after the copy/action/list fixes. It covers approved Flows A–I plus
dashboard/route compatibility and responsive checks. Evidence lives under the ignored
`.artifacts/optional-documents-stage2/` directory: states 1–15 at 1536×864 and
the responsive Stage 1 state additionally at 1440×900, 1280×800, and 390×844.
All 18 images were opened at original detail. Independent review subsequently
found that state 10 exposed an unordered shared Department label. The source
now uses an exact fixture-owned Department, but repeated local-socket approval
timeouts blocked the focused rerun before process creation; state 10 therefore
remains superseded evidence until recaptured.

Pixel inspection results:

- Stage 1: exact title/subtitle/action, Step 1–5 row order, exact five headers,
  `Chưa có file`, `-- Trống --`, `Đã tải lên`, filename plus `+ N tệp`,
  `Upload`/`Xem`, accessible secondary menu, centered edit dialog, navigator,
  queue, file drawer, and zero-file completion are visible without clipping or
  page-level horizontal overflow.
- Stage 2: exact three links styled as tabs, baseline title/subtitle/actions,
  readable seven-column plan, XLSX preview/confirm, exact four defaults, and
  optional upload are visible in the owning captures. The exact seven-column
  actual-file list is asserted after upload and reload; state 12 intentionally
  captures the pre-submit upload queue, not that list. The reviewer-department
  column honestly displays `--` because that relationship is not persisted;
  the date is the logical document's persisted creation time. State 10's old
  arbitrary Department option is not accepted final evidence; the deterministic
  fixture replacement is GREEN in source safety but awaiting browser recapture.
- Later stages and authorization: Stage 4 keeps its own generic Required
  Document surface but has no Stage 1 inherited card, redirect, or warning.
  The forbidden capture is terminal (`Bạn không có quyền thực hiện thao tác
này.`), not a loading placeholder.
- The selected-Step dropdown can still display legacy English business names
  such as `Project dossier`/`Kickoff approval`. They are persisted domain
  labels rather than raw enum codes and were not renamed automatically because
  the no-reseed contract preserves Project customization/history.

Apart from the superseded arbitrary Department label in state 10, no screenshot
shows a page-level overflow, clipped primary action, duplicate upload surface
for the same context, raw enum/debug code, missing-file blocker, or inherited-
data warning. Reference-only sample rows, SmartCA claims, fixed storage paths,
and mandatory-file instructions are absent. The mandated Stage 1 matrix title
still contains `BẮT BUỘC`; its exact optional subtitle, statuses, completion
behavior, and server rules carry the non-mandatory semantics.
