# Galaxy Project PMS full replacement design

Date: 2026-08-07  
Status: approved by the user in the authoritative master implementation request  
Scope: Project portfolio, shared PMS frame, Stages 1–5, compatibility cutover, and deletion of obsolete Project UI

Continuation amendment (2026-08-14): Project documents are optional supporting
records in Stages 1–5. Missing files never block a Step, Stage, route, or
readiness state. Every authorized Project stage root is directly navigable,
regardless of earlier-stage status. Sections 33–34 are authoritative wherever
earlier sections mention document gates, inherited-stage warnings, or mandatory
file counts.

P0 amendment (2026-08-14): this amendment is authoritative wherever earlier
sections describe Project creation, the Stage 1 initiation card, the initial
document matrix, or upload limits. `/projects/new` is the only create mode and
creates a new Project; `/projects/:projectId/stage-1` is existing-project mode
and never creates another Project. Stage 1 uses the five-column matrix and the
server-authoritative 20 GiB chunked upload flow defined in Section 11.

Project workspace amendment (2026-08-22): this amendment is authoritative
wherever earlier sections conflict with the Project Dashboard, canonical detail
route, shared stage header, Stage 1 document separation, upload lifecycle, or
Stage 2–5 labels below. The user's 2026-08-22 implementation request is the
approved design; no earlier completion label overrides fresh verification.

### Portfolio and canonical navigation

- `/projects` is the permission-filtered dashboard for every Project visible to
  `CurrentActor`. It uses real aggregates only and omits financial selections,
  sorting, filters, exports, and aggregates unless the backend grants the exact
  financial capability.
- `CHI TIẾT` always opens `/projects/:projectId/stage-1`.
- `/projects/:projectId` redirects to `/projects/:projectId/stage-1`; it no
  longer resolves `currentStage` or `entryStage`.
- Every authorized Stage 1–5 root is directly navigable. Stage 1 completion is
  neither a route gate nor a large inherited-data blocker for later stages.

### One shared two-row stage header

`ProjectStageHeader` is the single Stage 1–5 header implementation. Row one
contains the `GIAI ĐOẠN X` badge, Galaxy stage name, compact status when useful,
and direct GĐ1–GĐ5 switcher. Row two contains the Project label and authorized
Project selector, code/name, and the Project-access action only when its backend
capability is true. Stage 4/5 package or contract selectors live below this
header and cannot change its dimensions.

Changing Project preserves the current Stage route while resetting selected
Step/tab, upload queues, recovered batches, and document targets. The Project
selector contains only Projects returned by the scoped backend read. Horizontal
stage scrolling and full-width mobile selection are native responsive behavior.

The authoritative Galaxy labels are:

1. `KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT`;
2. `THIẾT KẾ, SẢN PHẨM & DỰ TOÁN`;
3. `THƯƠNG MẠI, HỢP ĐỒNG & MUA HÀNG`;
4. `SẢN XUẤT, LOGISTICS, KHO & LẮP ĐẶT`;
5. `NGHIỆM THU, BÀN GIAO & BẢO HÀNH`.

### Upload P0 and same-origin transport

Browser code calls relative `/api/v1/...` URLs only. The Next route streams JSON
and binary bodies to the fixed internal API while preserving method, cookies,
CSRF, relevant upload headers, upstream status, response body, `Location`,
`Upload-Offset`, `Content-Range`, and `ETag`. The API remains loopback-only; the
Web development server binds for LAN access.

The real route is `POST /api/v1/uploads/initiate`. A route-level proxy rejection,
an unmatched Nest route, a scoped Project/target 404, and a permission response
remain distinguishable by status plus structured application category.

File selection immediately runs Phase A: initiate, checksummed bounded chunks,
confirmed-byte progress, and temporary `FileAsset` finalization to `AVAILABLE`,
presented as `Đã tải tạm — Chờ nộp`. HTTP LAN origins cannot assume
`SubtleCrypto`; the shared digest helper must retain the Web Crypto fast path and
a tested local SHA-256 fallback. `NỘP HỒ SƠ` runs Phase B only: it links existing
temporary FileAsset IDs idempotently, creates the logical attachment/version and
Activity/Audit, refetches, and survives reload without retransmitting bytes.

### Stage 1 Matrix and Workflow are separate document contexts

The visible order is shared header, compact initiation, Matrix, five-Step
navigator, selected-Step detail/upload, then that Step's submitted-document
list. The Matrix is never nested or repeated inside the Workflow.

The existing `ProjectRequiredDocument.initialMatrix` field is the canonical
Project-specific context discriminator and avoids a new document subsystem:

- `initialMatrix = true` means `STAGE_MATRIX_DOCUMENT`;
- `initialMatrix = false` means `STAGE_WORKFLOW_STEP_DOCUMENT`.

Every logical Project document derives its context from its persisted scoped
definition. Upload initiation sends the exact definition ID, Project, Stage,
Step/workstream, CurrentActor-authorized submitting-officer metadata, and stable
command key. Backend target resolution verifies that scope; frontend labels or
client-only IDs never authorize it. Moving a definition between Matrix and
Workflow is forbidden after any logical document, legacy version, current file,
or history exists. No FileAsset bytes are copied between contexts.

Matrix reads and attachment chips include only active or archived Matrix
definitions and documents whose persisted definition has `initialMatrix=true`.
The selected Workflow list includes only logical documents whose persisted
definition has `initialMatrix=false` and whose Step matches the URL-selected
Step. A Matrix upload can never appear in the Workflow list, and a Workflow
upload can never appear in a Matrix row.

The five Matrix defaults remain the approved Vietnamese rows. Matrix management
is Project-specific and capability-gated; rows with history archive instead of
deleting. Workflow types are independent Project definitions. Each Step always
offers upload, including after completion. `Hồ sơ khác` requires a bounded
custom Vietnamese business name, persists the definition/target before file
selection can initiate, and records that custom display name on the logical
document.

The shared `ProjectDocumentUploadQueue` remains the only resumable upload
worker. Matrix and Workflow may use thin context wrappers, but no stage-specific
uploader, FileAsset store, or physical-copy path is introduced.

### Stage composition

- Stage 1 uses the separate Matrix and five-Step Workflow described above.
- Stage 2 tabs are `KẾ HOẠCH & KHẢO SÁT`, `THIẾT KẾ, SẢN PHẨM & BOQ`, and
  `THẨM ĐỊNH & PHÊ DUYỆT`.
- Stage 3 tabs are `BÁO GIÁ & HỢP ĐỒNG KHÁCH HÀNG`, `NHÀ CUNG CẤP & MUA HÀNG`,
  and `PO, PI & KẾ HOẠCH THANH TOÁN`.
- Stage 4 tabs are `SẢN XUẤT & QC`, `LOGISTICS & HẢI QUAN`, `KHO & GIAO HÀNG`,
  and `LẮP ĐẶT & TIẾN ĐỘ`.
- Stage 5 tabs are `NGHIỆM THU & BÀN GIAO`, `QUYẾT TOÁN & THANH LÝ`, and
  `BẢO HÀNH & HẬU MÃI`.

Each tab composes only currently implemented canonical Galaxy domains. An
honest empty state replaces absent real data; no sample rows, fake files,
construction-law content, disabled placeholder CTA, or completion claim is
allowed. File preview is offered only for formats actually rendered safely;
all other types expose authorized metadata/download and existing preview
services only when present.

### Acceptance order

Implementation is gated in this order: reproduce/fix upload P0 on direct API,
localhost, and LAN; separate Matrix/Workflow contexts; dashboard; shared header;
Stage 1 Workflow; Stage 2–5 shell adaptation; obsolete-code cleanup. Each slice
uses a failing regression first, fresh targeted verification, and browser
evidence before the next dependent slice. No database reset, applied-migration
rewrite, destructive fixture cleanup, commit, tag, push, or PR is part of this
work.

## 1. Decision and authority

Galaxy OS will replace the current Project presentation, route orchestration, phase navigation, and Project home with one PMS-style operating experience. It will not retain a legacy Project mode or create a parallel Project system.

Authority is split deliberately:

- the inspected PMS reference and approved master specification govern visual hierarchy, navigation, density, status treatment, and workflow presentation;
- Galaxy OS Project and domain records/services govern business data, authorization, audit history, financial precision, and immutable evidence;
- server-side deterministic applicability and gates govern stage progress;
- this document supersedes the Stage 2–5 exclusions in the 2026-08-01 Slice 0/1 design without rewriting that historical record.

The live observations are recorded in `docs/project-system/PMS_LIVE_REFERENCE_AUDIT.md`; the safe-retirement decisions are in `docs/project-system/PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md`.

## 2. Current state

The branch already contains reusable Project foundations:

- a white 272 px `PortalShell`, 76 px header, light canvas, shared tokens, and permission-filtered navigation;
- `/projects/[projectId]` redirecting to canonical Stage 1 instead of query-string workspace routing;
- a shared `ProjectPmsShell` with Project header, five-stage presentation, context, summary/readiness/red flags, documents, steps, and navy routing panel;
- Stage 1 schema, API commands, deterministic routing, Required Documents, approval, gate, activity, notifications, members, files, comments, tests, and browser flow;
- canonical Product, Estimate, Quotation, Contract, Procurement, Production, Logistics, Inventory, Installation, Inspection, Handover, Warranty, FileAsset, Approval, Activity, Comment, Notification, and IAM domains.

The remaining gaps are product-level, not cosmetic:

- `/projects` still exposes raw legacy phase presentation and no real planned/actual visualization;
- Stage 1 is a large client monolith and lacks approved responsibility/milestone fields;
- Stage 2–5 Project route families do not exist, so the current switcher still
  violates the always-open navigation requirement;
- Project has no persisted `entryStage`, generic stage initialization, or
  authorized audited stage bypass decision;
- Stage 1 still exposes English section/action labels and sends formatted or
  empty preliminary-finance values through a raw regex DTO boundary;
- cross-stage task/settings routes are target-only;
- existing operational domains are not yet orchestrated through the five-stage Project frame;
- obsolete create/edit and wrapper presentation remains until verified replacement.

The `randomUUID` Stage 1 crash is a separate completed prerequisite. Command keys are now generated through a tested Web Crypto feature-detecting helper only when a user starts a command, retained across retries, and rotated after success.

## 3. Selected approach

Use a thin orchestration layer over authoritative domains.

- Keep the current Project record and legacy `ProjectPhase` values for history/compatibility.
- Map legacy phases and real domain state deterministically to five visual stages.
- Persist one `entryStage` on Project, defaulting to Stage 1. Creating a Project
  at a later entry stage initializes that stage without fabricating completion
  for earlier stages.
- Keep one `ProjectStageState` source for initialization, applicability, bypass,
  review, blocking, and completion. Add only missing reason/actor/time/approval
  audit fields; do not create a second stage-state model.
- Add only relations/state required for applicability, stage/workstream gates, blockers, or history that cannot be derived safely.
- Render existing domain records inside or link them from stage-specific adapters.
- Use immutable snapshots only where historical commercial/approval correctness requires them.
- Delete obsolete UI only after the replacement route is default and all callers pass.

Rejected approaches:

- retaining the old workspace underneath a new stage header;
- two Project modes or duplicated route trees;
- a generic no-code workflow/rules engine;
- copying Contract, PO, Shipment, Inventory, Installation, Handover, Warranty, File, Approval, or User data into Project-specific tables;
- scaffolding empty stages/tabs for future work.

## 4. Operating model

The user flow is:

`Portfolio Dashboard → Project → Stage → Workstream/Package → Business Record → Optional supporting documents → Workflow completion`

Each applicable stage page renders only the header, stage switcher, relevant
context controls, real workstream tabs, business forms/tables, optional upload
areas, and Activity/comments needed by that stage. It does not add a generic
readiness, Red Flag, inherited-data, or mandatory-document dashboard.

All five stage roots are direct links for an authorized Project user. Opening a
stage does not change `currentStage`. Missing or incomplete earlier stages are
neither warnings nor route guards. Commands may validate only their direct
record-level integrity and authorization requirements.

Stages and business records never become complete from a client-editable status field. Commands validate the current record/version and the backend returns completed state or structured blockers.

## 5. Project templates and applicability

A focused deterministic Project applicability service returns applicable stages,
workstreams, optional document definitions, approvals, finance requirements,
installation requirements, and closure requirements for:

- `DESIGN_AND_BUILD`: all stages/workstreams;
- `DESIGN_ONLY`: Stages 1–2 plus applicable archive/closure;
- `PRODUCT_SUPPLY`: Stage 1, Stage 2 product/configuration, Stage 3 procurement, Stage 4 production/logistics/warehouse/delivery, Stage 5 handover/warranty; installation defaults not applicable;
- `PRODUCT_SUPPLY_AND_INSTALLATION`: Stages 1–5 including installation/acceptance;
- `INSTALLATION_ONLY`: Stage 1, Stage 3 site readiness, Stage 4 receipt/installation/logs, Stage 5 acceptance/handover;
- `INTERNAL`: internal budget/procurement/warehouse/installation/acceptance; Customer commercial work may be not applicable;
- `RENOVATION_WARRANTY`: survey, repair scope, execution, acceptance, warranty/service;
- `CUSTOM`: authorized stored configuration constrained to supported workstreams.

This is typed Project logic backed by tested lookup tables and explicit custom configuration, not a workflow language. Non-applicability records actor, reason, time, and rule/configuration version.

Template applicability affects whether a stage is editable or read-only; it
does not hide the stage. A not-applicable stage remains viewable with its rule,
reason, actor, timestamp, and audit history. Bypass requires an explicit
permission and non-empty reason, records actor/time, may reference an approval,
and never implies that upstream business outputs exist.

## 6. Data ownership and traceability

Existing owners remain canonical:

- `Project`, Customer, Contact, User, `ProjectMember`, Department, permissions;
- Product Candidate/Line and immutable configuration revisions;
- material/sample and Customer/technical/commercial approvals;
- Estimate/Quotation/Customer Contract and lines;
- PR/RFQ/Supplier Quotation/Comparison/Selection;
- PO/PI, Production, QC, Package, Shipment, Customs;
- Goods Receipt, Inventory lot/serial, Site Delivery, Installation;
- Inspection, Acceptance, Handover, Customer Asset, Warranty Asset, Service Ticket;
- Required Document, FileAsset/version, Approval, Activity, Comment, Notification.

The implementation maintains references across the lifecycle:

`Requirement → Product Candidate → Configuration Revision → Material Sample → Customer Approval → Technical Approval → Commercial Approval → Estimate Line → Quotation Line → Customer Contract Line → PR Line → RFQ Line → Supplier Quotation Line → Supplier Selection → PO Line → PI Line → Production Order → QC → Package → Shipment → Customs → Goods Receipt → Inventory Lot/Serial → Site Delivery → Installation → Inspection → Acceptance → Handover → Customer Asset → Warranty Asset → Service Ticket`

Quantity-bearing links support partial quantities. Finalized commercial, approved, accepted, and handed-over records are immutable; later corrections create revisions or append-only decisions. Monetary values use existing Decimal handling and currency rules.

## 7. Authorization and disclosure

All access uses existing IAM and parent Project scope:

- email is lookup/invitation input only;
- grants use user ID, Project membership, permission, scope, target policy, delegation, active organization membership, and active dates;
- backend list/detail/command/file-download routes re-resolve the Project and specific business permission;
- direct URL, list, create, detail, edit, upload, decision, sorting, search, export, and aggregate operations apply the same policy;
- inaccessible Project resources do not leak metadata.

Financial capabilities are independent. Selling price, internal cost, Supplier price, discount, margin, receivable, payable, bank data, payment evidence, cashflow, guarantee, and landed cost are selected/serialized/aggregated only for actors with the exact capability. Frontend omission is a usability layer, never the authorization boundary.

## 8. Shared visual system

Reuse current theme tokens and shell:

- fixed white 272 px sidebar and 76 px top header;
- `#F4F7FB` canvas; 28–32 px page padding; 20–24 px section gaps;
- white cards, `#DCE4EE` borders, 16 px radius, light shadow, 20–24 px padding;
- primary `#1760FF`, navy `#0B1328`, success `#079B67`, warning `#D97706`, danger `#E10D1A`, purple `#8B16F4` plus existing equivalent shades;
- pale gray-blue compact table headers, status pills, right-aligned numeric data, real filter/sort/pagination;
- sectioned two/three-column forms, labels above controls, inline errors, and distinct Save/Submit/Approve/Complete actions.

Project stage navigation belongs inside Project context. At Stage 4 the workstream accents are blue contracts, green payments, purple progress, and orange execution logs. Navy panels are reserved for rule/routing context, not decorative content.

Primary visual acceptance is 1536 × 864; secondary is 1440 × 900. Both require screenshot inspection for proportions, overflow, clipping, form/table density, modal behavior, and status hierarchy.

## 9. Portfolio dashboard

`/projects` is the single Executive Project dashboard:

- title `TỔNG QUAN QUẢN LÝ DỰ ÁN` and blue/indigo banner;
- permission-filtered KPI cards for counts, contract value, receipts, receivable/payable, schedule health, approvals, critical alerts, and due warranty/service;
- planned-versus-actual visualization only when real series exist;
- red flags/health;
- paginated Project table with code, name, Customer, PM, current visual stage, planned handover, progress, health, flags, permitted financial status, and action.

Portfolio aggregates query the full authorized scope rather than the loaded page. Hidden financial fields cannot be requested as sort/filter dimensions. `/projects/mine`, `/actions`, and `/alerts` remain focused portfolio variants using the same authorization and canonical Project links.

## 10. Shared Project frame and routes

The Project header returns code, name, Customer, location, template/type, Sales owner, Project Director, PM, current visual stage, status, health, and planned handover. The context bar shows only selectors relevant to the stage: Project, area/room, work/package/order package, contract, and Supplier.

Canonical roots:

- `/projects/:projectId/stage-1/*`
- `/projects/:projectId/stage-2/*`
- `/projects/:projectId/stage-3/*`
- `/projects/:projectId/stage-4/*`
- `/projects/:projectId/stage-5/*`
- cross-stage `/members`, `/files`, `/tasks`, `/activity`, `/settings` only when backed by real complete screens.

The five switcher items always link to `/stage-1` through `/stage-5` for an
authorized Project user. `currentStage` remains dashboard/status metadata only;
navigation never mutates it. Project membership, permission, and template
applicability determine editable or read-only access. `/projects/:projectId`
always redirects to `/projects/:projectId/stage-1`.

## 11. Stage 1 design

Title: `KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT`.

There are two explicit modes. `/projects/new` is create mode and shows exactly
Project name, expected total investment in VND, funding source, and
investor/representative with `KHỞI TẠO & KÝ PHÊ DUYỆT DỰ ÁN`. Its dedicated,
idempotent create command authorizes `project.create`, validates organization
scope, generates a unique Project code, creates one new Project, adds the
CurrentActor as a valid Project member, initializes Stage 1, its five steps,
and the five initial matrix definitions in one short transaction, writes one
Activity/Audit trail, and returns the new Project ID, code, and
`/projects/:newProjectId/stage-1?step=1`. Browser retries with the same command
key return that Project; they never update the currently selected Project.

`/projects/:projectId/stage-1?step=1..5` is existing-project mode. Its first
card is `THÔNG TIN KHỞI TẠO DỰ ÁN`, displays the saved four values, and exposes
separate authorized `Chỉnh sửa` / `Lưu thay đổi` behavior. It never renders a
create CTA and never calls the create command. `Project.name`, Decimal
`Project.estimatedValue`, `Project.customerId`, `Project.primaryContactId`, and
the typed Stage 1 funding source remain canonical; CRM remains the sole
Customer/Contact store.

The existing-project page order is the shared Stage header, compact information
card, Matrix, five-Step navigator, selected-Step detail/upload, and the selected
Step's submitted-document list. Matrix and Workflow are separate logical
contexts and separate visible sections while both reuse the single shared
upload queue/transport. Routing diagnostics, Red Flags, readiness percentages,
preliminary finance, and raw technical state are not rendered on the primary
screen.

The five server-owned steps remain the existing canonical enum values but use
the approved Vietnamese labels: tiếp nhận/phân công; khảo sát/thiết lập bộ máy;
lập và thẩm định hồ sơ đề xuất; xác định nguồn vốn/kế hoạch; phê duyệt dự án.
Step selection is stable URL state. Completion validates only Project
existence/access, Step-completion permission, valid state, and cross-Project
integrity. It never checks files, document types, approval documents, finance,
governance, responsibility notes, or hidden Required Document state.

Project Required Document rows remain the Project-scoped definition and
legacy-history authority; all definitions are optional. Exactly five defaults
are created once per new Project: `Văn bản chủ trương / Quyết định giao nhiệm
vụ`; `Báo cáo khảo sát & Phương án nhân sự`; `Hồ sơ Báo cáo Kinh tế - Kỹ
thuật`; `Văn bản xác nhận / Cân đối nguồn vốn`; and `Quyết định phê duyệt Báo
cáo Kinh tế - Kỹ thuật`, assigned in order to Steps 1–5. Initialization never
re-seeds renamed, reordered, hidden, or restored rows. One matrix-level `QUẢN
LÝ LOẠI HỒ SƠ` drawer supports Project-specific add, rename, Step assignment,
description, order, deactivate, and restore. Rows with file history are never
physically deleted.

The visible Matrix is titled `MA TRẬN DANH MỤC HỒ SƠ CHỦ CHỐT`; its columns
are exactly `TÊN LOẠI HỒ SƠ`, `BƯỚC THAM CHIẾU`, `TRẠNG THÁI`,
`TỆP ĐÍNH KÈM`, and `THAO TÁC`. Empty cells show
`-- Trống --`; actual authorized file links/chips render directly in the
attachment column, with two visible chips and `+ N tệp` for overflow. Each row
shows exactly one action: `TẢI LÊN` when empty or `THÊM TỆP` when files exist.
There is no row overflow menu. Statuses use only `Chưa có file`, `Đang tải`,
`Đã tải lên`/`Đã tải N tệp`, and `Lỗi tải lên`; raw enums never render.

The existing UploadSession, chunk storage, checksum, FileAsset, logical Stage 1
document, EntityAttachment, authorized download, Activity, and Audit path is
canonical. One definition has zero-to-many logical document attachments and
each logical document retains its append-only version history; adding a file
does not replace a different attachment. Cross-Project and cross-organization
links are rejected.

`UPLOAD_MAX_FILE_BYTES=21474836480` is the one server-side total-file limit.
Startup rejects invalid values. The API exposes the effective decimal-byte
value, and the Web formats it as `DUNG LƯỢNG TỐI ĐA MỖI TỆP: 20 GB`; the Web
has no independent 20 GiB constant. `FileAsset.sizeBytes`, UploadSession byte
fields, DTO serialization, storage validation, and completion support the full
range. The existing bounded chunk size remains a per-request limit; no layer
accepts, buffers, or posts a whole 20 GiB request.

The row-scoped multi-file queue progresses `QUEUED → INITIALIZING → UPLOADING
→ FINALIZING → COMPLETED`, with bounded retry plus failed, aborted, and resumable
states. Clicking upload immediately leaves `Chờ tải`; initialization errors
become actionable `Lỗi`. Progress is confirmed uploaded bytes divided by total
bytes and shows transferred/total bytes. Temporary readiness is not shown until
FileAsset finalization succeeds. Permanent completion is shown only after
explicit `NỘP HỒ SƠ` links the existing FileAsset into the selected Matrix or
Workflow context, invalidates the read model, and survives reload. Link retry
reuses the finalized FileAsset without retransmitting bytes. Missing files never
block Step or Stage completion; completing all five Steps completes Stage 1
even with zero files.

## 12. Stage 2 design

Title: `THIẾT KẾ, SẢN PHẨM & DỰ TOÁN`.

The canonical route is `/projects/:projectId/stage-2?step=1..3` with these
reference-style tabs:

1. `KẾ HOẠCH & KHẢO SÁT`;
2. `THIẾT KẾ, SẢN PHẨM & BOQ`;
3. `THẨM ĐỊNH & PHÊ DUYỆT`.

This slice fully implements Step 1 and preserves existing real Step 2/3
functionality without mock content. The baseline table reuses canonical Project
Task data because it already owns Project, department, description, start, and
finish. Add only nullable task code, baseline version, and allocated Decimal
budget fields plus a scoped unique constraint. Rows support authorized inline
CRUD, validation, persistence, and finance-field omission for actors without
the exact permission.

Template download uses the installed ExcelJS utility and produces a valid XLSX
with the six approved Vietnamese columns. Excel preview uses the existing
bounded import parsing pattern, rejects formulas/malformed headers/duplicate
codes by default, stores row errors and an idempotent confirmation summary, and
persists valid rows only after explicit confirmation.

Below the plan, Project Required Document definitions provide four optional
Step 1 document types with Project-scoped add/edit/hide/restore/reorder. Uploads
reuse UploadSession, FileAsset, EntityAttachment, Required Document versions,
download authorization, and Activity/Audit. The list shows actual uploaded
records only. An empty plan and zero documents never block Step or Stage
completion.

## 13. Stage 3 design

Title: `GĐ 3 — CHỐT THƯƠNG MẠI, LỰA CHỌN NHÀ CUNG CẤP & MUA HÀNG`.

Main modules:

1. commercial terms and implementation readiness;
2. Supplier plan/selection;
3. contract, appendix, PO, and PI.

Commercial reuses approved Estimate, Quotation, Customer acceptance, Contract, Appendix, payment schedule, advance, and guarantee. Site readiness uses area/room, planned/actual readiness, receiving party, access, delivery, installation, electricity, storage, protection, status, and documents; it intentionally replaces the public reference's GPMB content.

Supplier selection reuses PR, RFQ, Supplier Quotations, comparison, and selection for packages sourced from Product Lines. Contract/PO/PI views reuse canonical records and optional supporting documents. Missing files and prior-stage state never block the route or completion.

## 14. Stage 4 design

Title: `GĐ 4 — SẢN XUẤT, LOGISTICS, KHO, LẮP ĐẶT & THANH TOÁN`.

Context may include Project, package, contract, Supplier, and area/room. Main tabs:

1. Project/contracts: contract/PO summary, value/appendices/lines/Products and production-to-acceptance quantities;
2. advances/payments: Customer scheduled/invoiced/received/outstanding/overdue/retention and Supplier PI/milestone/paid/outstanding, all separately permissioned;
3. progress/Gantt: planned/actual/variance/delay/health/red flags and milestones from real events;
4. execution/daily log: date, area, package, owner, condition, personnel, equipment, deliveries, work/quantities, issues, instructions, files.

Quantity summaries derive delivered, installed, inspected, accepted, and payment-eligible amounts from canonical line/event relations. No acceptance BOQ copy is introduced. Missing supporting documents and prior-stage state never block the route or completion.

## 15. Stage 5 design

Title: `GĐ 5 — NGHIỆM THU, BÀN GIAO, QUYẾT TOÁN & BẢO HÀNH`.

Main tabs:

1. acceptance/handover: inspections, acceptance, Punch List, handover, Products/serials, manuals, CO/CQ, as-built and warranty evidence;
2. settlement/liquidation: current contract value, paid, receivable/payable, retention, final payment, settlement, liquidation, close;
3. Project closure/archive/warranty: file versions/checksums/signed records/language/archive status plus Customer/Warranty Assets and service schedule.

Closure remains a high-consequence backend command for direct business-record,
finance, inventory, and authorization integrity only. Missing supporting files
do not block closure. Success writes audited closure state; retry is idempotent.
Archive export and file download retain confidentiality and exact permission
checks.

## 16. API and state boundaries

Each stage receives a bounded summary endpoint and focused commands. The server page/client fetches one stage read model instead of issuing per-card/per-row requests. Domain-specific list/detail routes remain canonical for full records.

The shared stage endpoint also returns entry stage, current stage,
initialization state, applicability/read-only state, and permitted commands. It
does not calculate or return whole-stage upstream-completion warnings.
Generic initialize/bypass commands are Project-scoped, permissioned,
idempotent, and audited. They never accept client-supplied completion or current
stage values.

Commands follow these rules:

- validated DTOs at every external boundary;
- Project visibility plus action permission before record lookup/mutation;
- optimistic version or immutable-state checks;
- one idempotency key per pending command, reused for retry and rotated after success/new command;
- transactionally consistent Activity/Notification/decision side effects;
- structured 422 errors for direct business-record or integrity failures;
- 404/forbidden behavior consistent with existing non-disclosure policy.

No new dependency is introduced where TypeScript, React, Prisma, CSS, Web Crypto, or installed packages already solve the need.

## 17. Error and state design

Every completed screen has distinct loading, empty, fetch-error/retry, validation, forbidden, and immutable states. Empty states provide only real actions. Permission-hidden data is absent rather than rendered then concealed. Modals trap focus, close by explicit control/Escape where safe, identify their title, and restore focus.

Tables implement real filter/sort/pagination only for allowlisted backend fields. Numeric data is aligned and formatted without converting Decimal values through unsafe binary arithmetic.

## 18. Cutover and deletion

Replacement proceeds one vertical slice at a time:

1. add failing route/behavior/authorization tests;
2. complete the new route using existing domains;
3. verify direct links, notifications, browser flow, and screenshots;
4. make the route the default;
5. retain the smallest compatibility redirect;
6. search all callers;
7. delete only zero-reference obsolete UI/orchestration;
8. rerun Web typecheck/build and Project regression.

Likely retirement targets are the duplicate `project-form`, legacy raw-phase/query navigation, the Stage 1 monolithic rendering body, monolith-only files/members/activity switches, and verified dead CTA/placeholder or duplicate summary components. The audit found no concrete Project-only stylesheet or obsolete Project feature flag, so shared CSS and generic navigation flags are not deletion targets. Authoritative schemas, migrations, records, services, and audit history are never deleted by UI cutover.

## 19. Test and visual strategy

Every behavior change follows red-green-refactor. Tests cover:

- Project isolation and direct URL protection;
- create/list/detail/edit and immutable transitions where applicable;
- validation, upload, approval, activity, notification, loading, empty, error, and forbidden states;
- financial omission from data, markup, sort/filter/export, and aggregates;
- direct business-command validation, success, idempotency, and side effects;
- route/notification compatibility and no dead CTA;
- API/database integration for cross-record/transactional behavior;
- Playwright Flow 0 and Stage Flows 1–5 using real fixture/database records;
- unexpected console errors and hydration warnings.

For each completed stage, Playwright captures the requested overview, major
form/table, optional upload/list, modal, empty, error, and forbidden states at
the approved viewports. A human/agent opens the captures and compares
sidebar/header proportions, switcher, context, tabs, cards, tables, forms,
colors, spacing, overflow, and clipping against the reference.

## 20. Performance and query constraints

- No N+1 summary, member, document/file, owner, approval, flag, readiness, or financial query.
- Portfolio and stage summary reads use bounded queries and bulk maps.
- Project/package selectors are searched/paginated.
- Tables page/filter/sort server-side using allowlists.
- Required Document matrices return current version summaries; history loads on detail.
- Hidden financial values are not selected.
- Charts are computed only from real, bounded series.

## 21. Delivery sequence

1. Completed prerequisite: secure Stage 1 command-key runtime repair.
2. Completed design input: live-reference audit and cutover matrix.
3. Immediate defects: always-open stage access, persisted entry stage,
   initialization/bypass audit, Stage 1 connected navigation, finance
   normalization, Vietnamese command semantics, and current runtime errors.
4. Project dashboard and shared frame cutover.
5. Complete and decompose Stage 1.
6. Complete Stage 2.
7. Complete Stage 3.
8. Complete Stage 4.
9. Complete Stage 5.
10. Delete obsolete Project UI after route/caller verification.
11. Full Project regression and visual acceptance.

Each stage is its own vertical checkpoint with targeted/full verification,
browser evidence, code review, Ponytail, status update, and exact next task.
Every authorized stage route remains open; only unsupported business actions or
fake tab content stay absent.

## 22. Design self-review

- Authority: reference layout is separated from Galaxy business data and IAM.
- One system: no parallel Project route tree or duplicated domain is proposed.
- Applicability: the eight approved templates have deterministic, bounded behavior; no workflow engine is introduced.
- Routes: all five authorized stage roots remain navigable; an uninitialized
  root is a real state-management screen, not a placeholder. Unbacked
  workstream tabs/actions remain absent.
- Progression: `entryStage` and `currentStage` are distinct; navigation mutates
  neither, and prior-stage or document state never controls route access.
- Finance: display formatting, canonical Decimal serialization, derived margin,
  optional-value handling, and Vietnamese field errors are explicit.
- Security: backend Project/action/file scope and financial non-disclosure are explicit.
- History: immutable snapshots/revisions are used only where business history requires them.
- Cutover: replacement precedes redirect and deletion; migrations/data are outside UI deletion.
- Testability: every command, gate, direct route, financial boundary, and visible state has an observable check.
- Visual match: both required desktop sizes and the inspected reference hierarchy are explicit.
- Placeholder scan: no TODO/TBD, fake data, fake chart, AI claim, or unspecified alternate mode remains.

## Historical amendments

Earlier continuation amendments are preserved in dated implementation plans and
handoffs. They are intentionally omitted from this normative specification
because their mandatory-document, readiness, inherited-data, approval-gate, and
Stage 2 exclusion rules conflict with the approved 2026-08-14 design.

## 33. 2026-08-14 optional documents, upload repair, and Stage 2 plan amendment

This amendment implements the approved 2026-08-14 prompt and is authoritative
for Project documents, Stage 1 completion, Stage 2 Step 1, and Stage 2–5 route
access.

### Optional document semantics

Every Stage 1–5 document definition is supporting metadata. Its persisted
`required` value is false for the covered workflows and no completion/readiness
service may infer a blocker, red flag, warning count, navigation restriction,
or status from missing files. Existing approved/history records remain
immutable and downloadable; optionality changes workflow gating, not history.

### Configuration and persistence

Reuse `ProjectRequiredDocument` as the Project-scoped definition store. Add
only display order, description, active/archive state, and initial-matrix
membership when current columns cannot represent them. The initiation command
creates the exact five matrix defaults once under one initialization marker;
ordinary reads never reseed deleted, renamed, moved, or hidden defaults.
Duplicate active normalized name/Step pairs are rejected unless an explicit
confirmation command is later approved.

Reuse the existing `ProjectStageOneDocument` logical submission/version tables
for Stage 1 and widen that same relation with a stage/workstream discriminator
for Stage 2. The legacy Stage 1 enum becomes nullable only for non-Stage-1
rows; existing rows retain their values. This production-safe widening is
smaller than introducing a second logical document table and supports multiple
attachments plus explicit later versions in both stages. Required Document
definitions remain the configuration link. No Stage-specific uploader,
FileAsset store, or base64 payload is introduced.

### Upload root-cause boundary

The client queue survives refetch/rerender and sends one stable idempotency key
per file. UploadSession owns transfer, resume, retry, abort, checksum, and
finalization. It creates or reuses exactly one FileAsset and returns a stable
projection; the authoritative 2026-08-18 amendment below separates that byte
finalization from logical document/version/attachment linkage, Activity, and
Audit. A failed file never rolls back successful peers.

### Stage 2 planning boundary

Baseline rows reuse `Task` with a Stage 2 baseline discriminator rather than a
duplicate planning table. Add only code, baseline version, allocated Decimal
budget, and the scoped uniqueness needed by the approved table/import. The
API scopes every query/command to organization, Project membership, active
department, permission, and financial disclosure. The XLSX parser is bounded,
never evaluates formulas, previews row errors before confirmation, and treats
retry as idempotent.

### Routes and cutover

Stage 1 and Stage 2 use query-state Steps. Legacy Stage 1 routes redirect to
the matching Step. Stage 2–5 remove the entire inherited-data UI and upstream
warning copy; server summaries no longer calculate earlier-stage completion as
a route or status input. Record-level links remain only inside the business
screens that directly need them.

## 34. 2026-08-14 design self-review

- Placeholder scan: no TBD, mock plan rows, missing template link, fake
  SmartCA/provider result, or unimplemented visible action is authorized.
- Consistency: document definitions remain editable/history-preserving while
  file presence is explicitly excluded from every covered completion command.
- Scope: Stage 3–5 change only by removing inherited-data UI/warnings; their
  business workflows are not expanded.
- Reuse: one Project, Required Document configuration, UploadSession,
  FileAsset/version, Task, Activity/Audit, and IAM policy remain canonical.
- Security: Project membership and exact permissions protect metadata, bytes,
  upload, download, type management, completion, plan CRUD, template, and
  import; finance is omitted server-side when unauthorized.
- Data safety: migrations are additive and production-safe; no applied
  migration, business row, file history, or approved evidence is rewritten.

## 35. 2026-08-18 independent Project workspace and two-phase dossier amendment

Historical record only. The 2026-08-22 Project workspace amendment at the top
of this document supersedes this section wherever Project entry, canonical
detail routing, shared headers, Matrix/Workflow context, or stage composition
differs.

### Project entry and independent Stage state

`/projects/:projectId` renders `TỔNG QUAN TIẾN ĐỘ DỰ ÁN`; it does not redirect
to Stage 1. The overview reads the existing Project, `ProjectStageState`,
`ProjectStageStep`, and established Stage workstream records and renders five
independent cards with the approved Vietnamese title, objective, status,
truthful progress, latest update, next action, and direct Stage route. Project
list actions target the overview. Existing Stage and notification deep links
remain valid.

The five Stages are peer work areas. Opening a Stage is read-only with respect
to status. Stage completion, pause, attention, and progress use only that
Stage's records and never start, complete, block, or redirect another Stage.
Stage 1 progress is completed Stage 1 Steps divided by five. A later Stage
without a defined denominator displays a record-backed summary or `Chưa có
tiến độ được ghi nhận`; it never fabricates `0/5`.

### Authoritative upload actor and capabilities

Nest authentication constructs `CurrentActor` from the active authenticated
user, active organization membership, live role assignments, scope, and
delegation. Every upload, submit, preview, download, type-management, and Step
command authorizes this actor. `submittedOfficerId` is separately validated
business metadata: self by default; another active Project member only when the
actor holds the existing Project-member management authority. It never replaces
`CurrentActor.userId` in Project access, UploadSession ownership, FileAsset
ownership, idempotency, Activity, or Audit.

The Stage response exposes server-derived document capabilities. Web controls
consume those flags and do not reconstruct authorization from role labels.
Backend guards and scoped target lookups remain mandatory. Existing
`file.upload`, `project.document.manage`, read/download, Step, and Project
member permissions are reused unless a focused authorization test proves a
missing distinct capability.

### Phase A — temporary upload

File selection or drop validates and immediately starts the existing resumable
transport. One typed queue moves through queued, initializing, uploading,
retrying, temporary finalization, and `READY_TO_SUBMIT`. Chunk progress uses
server-confirmed bytes only. UploadSession remains owned by CurrentActor and
bound to organization, Project, definition, Stage/workstream, draft logical
document, and submitting officer.

`POST /uploads/:id/complete` verifies bytes and creates or reuses exactly one
FileAsset, but does not create an EntityAttachment, document version/current
pointer, submitted Activity, or Audit. Existing `AVAILABLE` is the canonical
temporary-ready equivalent unless a focused migration proves a separate enum
value necessary. The response is safe, recoverable, and displays `Đã tải tạm —
Chờ nộp`.

Temporary-ready sessions remain recoverable for the same actor and context
until expiry. Closing a panel offers continue, keep-and-close, or abort. Abort
never creates a permanent attachment. Expired unsubmitted sessions are hidden,
marked expired, and cleaned through the existing storage cleanup boundary;
submitted FileAssets and historical versions are never removed by draft
cleanup.

### Phase B — explicit dossier submission

`NỘP HỒ SƠ` sends one stable-key batch command containing only temporary
session identifiers; it never retransmits bytes. The service locks and
reauthorizes each actor-owned temporary session and target, verifies the
FileAsset and Project/organization binding, then creates the existing unique
EntityAttachment, immutable document version/current pointer, Activity, and
Audit. The command is idempotent: retries return already-linked results and
never duplicate attachments or versions. A link failure retains the temporary
FileAsset so only the business command is retried.

The queue displays `SUBMITTING` and `SUBMITTED`; submitted items move to the
canonical document query after refresh. Permanent lists never include an
unsubmitted draft. All supported Stage panels reuse this transport and command
rather than adding Stage-specific uploaders.

### Stage 1 composition and shared Stage documents

Stage 1 renders the five-column Project-specific Required Document matrix and
the five-Step workflow as separate sibling sections. Matrix definitions reuse
`ProjectRequiredDocument`; archived definitions with history are never
physically deleted. Matrix files and Step files share FileAsset storage but are
separate logical records unless an explicit link is commanded.

The five Step cards preserve `?step=1..5`. Each selected Step always displays
the shared two-phase document panel and submitted-file query, including after
completion or reopen. Completing Step X updates only Step X, writes
Activity/Audit, and selects X+1 without completing it. Step 5 completes only
the Stage 1 workflow. The same shared panel maps onto established Steps/tabs in
Stages 2–5; no fake Steps or per-Stage uploader classes are introduced.

Each Stage exposes one consolidated query over the canonical attachments with
the approved filters and columns. It creates no copied bytes or parallel file
truth. PDF, safe images, MP4, and supported text may be inline; unsupported or
unsafe formats use authorized download/metadata. Responses never expose storage
keys and set safe content headers.

### Delivery order and safety gates

Delivery remains vertical and test-first: authorization evidence, temporary
upload, explicit submit, Project overview, Stage 1 separation/workflow, shared
Stage panels, consolidated lists/preview, then cutover. Each slice receives
targeted verification before the next. Schema changes are additive only after
a failing contract proves they are required; applied migrations, shared data,
FileAsset history, and uncommitted user work remain untouched.

## 36. 2026-08-18 design self-review

- Placeholder scan: no TBD, fake percentage, fake Step, hidden submit, one-step
  upload, role-label authorization, or unsupported preview is authorized.
- Consistency: `AVAILABLE` denotes temporary bytes; permanent attachment and
  submitted UI state occur only after the explicit batch command.
- Reuse: ProjectStageState/Step, ProjectRequiredDocument,
  ProjectStageOneDocument, UploadSession, FileAsset, EntityAttachment,
  Activity/Audit, and IAM policy remain the only sources of truth.
- Independence: no Stage route/status/progress/completion depends on another
  Stage's completion.
- Security: CurrentActor owns and authorizes every command; submitting officer
  is validated metadata; target, organization, Project, and file ownership are
  rechecked server-side.
- Data safety: failed linkage retains temporary bytes; abort/expiry cannot
  delete submitted history; no database reset, applied-migration rewrite, or
  parallel storage system is permitted.

## 37. 2026-08-24 accepted workspace amendment implementation note

The 2026-08-22 prompt supersedes the older overview behavior: `/projects` is
the all-Project Dashboard and `/projects/:projectId` redirects to Stage 1. One
shared header supports direct GĐ1–GĐ5 navigation and Project switching. Stage 1
Matrix and Workflow are separate logical contexts over one FileAsset/storage
truth, and explicit dossier submission never retransmits bytes.

The implementation keeps the existing UploadSession, FileAsset, Project access
resolver, Required Document, Stage document/version, Activity, and Audit models.
The sole new migration is additive and repairs legacy default classification;
it does not delete or rewrite applied history. Terminal draft cleanup may
tombstone an unreferenced FileAsset but preserves its row and UploadSession
history, and it removes physical bytes before releasing capacity.
