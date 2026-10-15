# PMS live reference audit

Date: 2026-08-08  
Reference: user-authorized read-only browser inspection of the PMS reference application  
Viewports: 1536 × 864 and 1440 × 900

## Method and boundaries

- Used a temporary Playwright browser session and the supplied test account.
- Navigated only dashboard, Project stages, tabs, detail panels, and the Project permission modal.
- Did not create, edit, upload, submit, approve, close, or delete data.
- Kept the temporary script and captures outside the repository under `/tmp`; no credential was saved in source, environment files, screenshots, logs, or this document.
- The reference is a single-page, button-driven application: the browser URL remains `/`, so the navigation paths below are UI paths rather than distinct URL routes.
- Reference sample records, statutory wording, signatures, financial values, and apparent automated routing are visual/workflow evidence only. They are not Galaxy OS business data or authoritative legal rules.

## Shared visual and interaction system

The inspected screens consistently use:

- a fixed white left sidebar, visually about 272–288 px wide;
- a fixed white top header about 76 px high;
- a very light gray-blue canvas with 28–32 px page padding;
- white cards with subtle borders/shadows and approximately 16 px corner radii;
- a five-stage Project switcher in the stage header;
- Project context selectors before stage-specific work;
- compact enterprise tables with pale gray-blue headers and status pills;
- blue primary actions, green success, orange warning, red danger, and purple progress accents;
- navy routing/control panels where the page communicates rule-derived workflow context;
- stable sidebar/header and vertically scrolling content at both inspected desktop sizes.

The 1440 × 900 captures preserve the same hierarchy without obvious clipped controls in the inspected views. Galaxy OS should reuse its existing `PortalShell` and theme tokens where equivalent rather than copy styles into a second theme.

## Login

**UI path:** unauthenticated `/`

**Purpose:** authenticate and establish the user context.

**Observed structure:**

- split-screen page;
- dark navy hero/brand panel on the left;
- white login panel on the right;
- compact product information cards in the hero area;
- email and password fields, a prominent blue login button, and secondary support copy;
- generous whitespace and a clear single primary action.

**Galaxy OS mapping:** retain the existing authentication service and session model. The reference supplies only layout and visual hierarchy; it does not authorize changing authentication behavior.

## Executive dashboard

**UI path:** sidebar → `Executive BI Dashboard`

**Purpose:** portfolio-level operating view and entry into a Project.

**Observed structure:**

- global sidebar and user/role header;
- large blue-to-indigo hero banner;
- four compact KPI cards;
- planned-versus-actual S-curve/chart card;
- Project table with status pills and a `Chi tiết` action;
- opening a Project navigates directly to its current stage, Stage 4 in the inspected example.

**Observed Project table columns:** Project code, Project name, group/classification, total investment, disbursed amount, current stage, status, action.

**Galaxy OS mapping:** `/projects` must become the default portfolio dashboard. Use real Project, contract, receipt/payment, schedule, approval, alert, and warranty data; permission-filter financial fields and aggregates. Do not reproduce the reference's sample figures or fake S-curve. Where no real baseline/actual series exists, render an honest empty state.

## Common Project stage frame

**UI path:** sidebar stage item or dashboard Project detail → selected stage

Every inspected stage includes:

- stage number badge and uppercase stage title;
- five stage buttons (`GĐ 1`–`GĐ 5`);
- Project selector below the title;
- Project permission action on the right;
- package selector where package context matters;
- horizontal workstream/step navigation;
- card-based content below the context controls.

**Galaxy OS mapping:** this corresponds to `ProjectPmsShell`, using real routes for each available stage. Project context must come from canonical Project data and authorization, not from a second Project store.

## Project permission modal

**UI path:** any stage → `Phân quyền Dự án`

**Observed behavior and layout:**

- centered modal over a blurred/dimmed backdrop;
- navy title bar and close control;
- current Project owner display;
- email/name entry and a list of assigned users;
- clear add/remove hierarchy.

**Galaxy OS mapping:** keep the modal hierarchy but use existing IAM: email is lookup/invitation only, while grants use `userId`, membership, permission, scope, target policy, delegation, and active status. Server-side authorization remains mandatory for direct URL and command access.

## Stage 1 — initiation, survey, proposal, finance, approval

**UI path:** sidebar → `GĐ 1`; then five horizontal step buttons.

**Purpose:** establish the Project, derive its operating route, collect required records, and obtain a gated kickoff approval.

### Overview and initiation

**Observed header/controls:** stage header, five-stage switcher, Project selector, Project permission action.

**Observed layout:**

- large initiation form on the left;
- dark navy automatic-routing card on the right;
- required-document matrix below;
- five-step navigator and selected-step detail;
- upload panel and submitted-document list.

**Observed reference form fields:** Project name, expected investment, classification, funding source, owner/representative, special-condition checkboxes, and a create/sign action.

**Galaxy OS mapping:** retain the layout, but use the approved Galaxy identity, responsibility, scope, date, and permission-protected financial fields. The navy panel must show deterministic template applicability, approvals, document count, risk, gate approver, blocker, and next action—never fabricated AI or copied public-sector legal routing.

### Required-document matrix

**Observed columns:** document type, execution step, submission status, attached file, action.

**Observed behavior:** five rule-derived rows in the selected sample, upload action per row, status presented inline.

**Galaxy OS mapping:** reuse the canonical Required Document domain and expand to the approved columns: name, step, workstream, required, status, current file, version, owner, due date, action. Preserve file history, checksums, immutable approved versions, and permission-protected downloads.

### Step 1 — assignment

**Observed purpose:** intake and assignment.

**Observed controls:** responsible unit/owner context, completion action, required-document type selector, submitter field, file input, signature checkbox, submit action, submitted-document table/empty state.

**Galaxy OS mapping:** `stage-1/initiation`. Use real Project membership, owner, due date, tasks, documents, approvals, blockers, next action, and activity.

### Step 2 — survey and organization

**Observed purpose:** survey and establish the working team.

**Observed controls:** selected-step detail, required survey/organization document choices, file upload, submitter, signature/submit controls, submitted-document list.

**Galaxy OS mapping:** `stage-1/survey`. Reuse survey data and Project membership. `not applicable` must be template-derived and authorized, not a free status edit.

### Step 3 — proposal and appraisal

**Observed purpose:** prepare and appraise the Project proposal.

**Observed controls:** proposal document type, submitter, file upload, signature/submit, status/detail, submitted-document list.

**Galaxy OS mapping:** `stage-1/requirements`, using Project proposal/scope records and Required Documents rather than copied reference legal forms.

### Step 4 — budget and funding plan

**Observed purpose:** establish funding/budget evidence.

**Observed controls:** funding-plan document choices, submitter, upload, signature/submit, status and submitted-document list.

**Galaxy OS mapping:** finance workstream under Stage 1, with all amounts and evidence protected by financial permissions at UI, server page, API, command, search/sort/export, and aggregate boundaries.

### Step 5 — Project approval

**Observed purpose:** final Project approval for Stage 1.

**Observed controls:** approval document selection, file submission, signature indicator, submission history and final approval-oriented action hierarchy.

**Galaxy OS mapping:** `stage-1/approval`. Use existing approval records, resolved approvers, decisions, comments, immutable approved evidence, audit activity, and structured gate blockers.

### Stage 1 gate mapping

The reference communicates sequential completion, but Galaxy OS must evaluate the approved gate server-side: identity, type, required Customer, PM/members, survey, proposal, financial plan when applicable, required documents, approvals, and no critical blocker. The result must be structured; users cannot directly edit the stage to complete.

## Stage 2 — planning, design/product/BOQ, review

**UI path:** `GĐ 2` → one of three main step tabs.

### Step 1 — detailed plan and resources

**Observed purpose:** establish the baseline plan.

**Observed table columns:** code, work item, department, start, finish, budget, action.

**Observed controls:** baseline table actions and document upload/list area.

**Galaxy OS mapping:** add the approved workstream, area/room, owner, dependency, permission-protected budget, status, and action fields. Use real schedule and resource records; do not create a fake Gantt data source.

### Step 2 — design, products, and BOQ

**Observed purpose:** select design type/consultant, capture BOQ lines, and manage supporting documents.

**Observed controls:** design-type selectors, consultant selection, BOQ quick-entry form, BOQ table, summary card, upload/list area.

**Galaxy OS mapping:** orchestrate existing Product Register and Estimate/Estimate Line records through subtabs for design documents, locations, products, materials/samples, configuration/dimensions, BOQ/estimate, and Customer approval. Product Register remains the canonical data source, not a competing Project home.

### Step 3 — review and approval

**Observed purpose:** departmental review and approval.

**Observed controls:** review department, reviewer, decision, comments, files/signing action, approval history, documents.

**Galaxy OS mapping:** use existing IAM and approval services. Record revision and decision history; enforce immutable approved records and server-side authorization.

### Stage 2 gate mapping

Require Stage 1 completion, applicable design and Customer/technical approvals, locations, configured Products, approved Estimate, required documents, and no critical blocker.

## Stage 3 — commercial readiness, supplier selection, contracts

**UI path:** `GĐ 3` → one of three submodules.

### Module 1 — implementation/site readiness

**Observed reference screen:** a readiness/GPMB-style household table plus a required-document area.

**Galaxy OS mapping:** do not copy the public-sector GPMB model. Implement the approved site-readiness table: area/room, planned and actual readiness, receiving party, access, delivery, installation, electricity, storage, protection, status, documents.

### Module 2 — package and Supplier selection

**Observed table columns:** package code, package name, expected value, method, selected bidder/Supplier, selected value, savings, action.

**Observed controls:** package table/detail actions, comparison-oriented information, document upload/list area.

**Galaxy OS mapping:** reuse PR, RFQ, Supplier Quotation, Comparison, and Selection. Link source Product Lines; retain real values, lead time, and approval state with financial permissions.

### Module 3 — contracts and signed records

**Observed purpose:** create/view contract information and its supporting evidence.

**Observed controls:** contract form, Supplier-capability panel, signed-contract cards, contract documents.

**Galaxy OS mapping:** reuse existing Customer Contract, Supplier contract/PO/PI, appendices, terms, delivery address, files, and approvals. Do not create duplicate contract records inside Project orchestration.

### Stage 3 gate mapping

Require an effective Customer commercial agreement where applicable, required advance, site readiness, Supplier selection, PO/contract/PI, complete required documents, and no production blocker.

## Stage 4 — contracts, payments, progress, daily execution

**UI path:** `GĐ 4` → four colored workstream tabs; Project and package selectors.

Tab accents are part of the visual hierarchy: blue for contracts, green for payments, purple for progress, orange for daily logs.

### Tab 1 — Project and contracts

**Observed purpose:** package/contract overview and drill-down.

**Observed controls:** contract KPI cards, contract list, selected-contract detail, BOQ lines, appendix tab/panel.

**Galaxy OS mapping:** reuse canonical Contract, Appendix, PO Line, Product, Production, Shipment, receipt, installation, and acceptance records. Show partial quantities through references, not copied acceptance BOQs.

### Tab 2 — advances and payments

**Observed overview:** payment summaries and package-payment table.

**Observed package detail controls:** payment-form type, requested amount, notes, sign/send action.

**Observed history columns:** record code, installment, requested value, cumulative submitted value, submission date, signature, status.

**Galaxy OS mapping:** provide Customer and Supplier payment views from real records, separated by financial permission. Use canonical payment evidence and audit activity; never infer payable/receivable authorization from frontend visibility.

### Tab 3 — progress and Gantt

**Observed purpose:** compare planned and actual progress and expose delay.

**Observed layout:** planned/actual progress cards, variance and health indicators, red-flag panel, milestone table.

**Galaxy OS mapping:** calculate only from real baselines, milestones, production/shipment/warehouse/installation events. Cover approved workstreams and render an honest empty state where inputs are missing.

### Tab 4 — execution and daily log

**Observed form fields:** date, weather/condition, personnel, equipment, work performed, GPS/location evidence.

**Observed quantity table:** accepted/executed quantities below the log.

**Galaxy OS mapping:** capture approved area, package, owner, deliveries, quantities, issues, instructions, and files. Derive delivered, installed, inspected, accepted, and payment-eligible quantities/values from authoritative records.

### Stage 4 gate mapping

Use applicability-aware production, QC, packing, shipment, customs, receipt, site delivery, installation, payment, document, and blocker rules. Completion remains a backend gate result.

## Stage 5 — handover, settlement, archive, warranty

**UI path:** `GĐ 5` → one of three main tabs.

### Tab 1 — acceptance and handover

**Observed purpose:** track acceptance/handover evidence.

**Observed table:** handover/acceptance document rows with status/action treatment.

**Galaxy OS mapping:** reuse Inspection, Acceptance, Punch List, Handover, Product/serial, manuals, CO/CQ, as-built, and warranty-document records.

### Tab 2 — settlement and liquidation

**Observed layout:** settlement summary cards and package/contract close table.

**Galaxy OS mapping:** show current contract value, paid, receivable/payable, retention, final payment, settlement, liquidation, and close state from real financial records and only to authorized users.

### Tab 3 — closure, archive, and warranty

**Observed layout:** digital-archive summary card, visually dangerous Project-closure card/action, and maintenance/warranty table.

**Observed maintenance table pattern:** asset/work item, service context/dates, provider, status/action.

**Galaxy OS mapping:** use FileAsset versions/checksums/signed records for archive; Customer Assets and Warranty Assets for warranty/service. Closure must evaluate acceptance, Punch List, documents, finance, inventory surplus, assets/warranty, and unresolved blockers. The danger styling communicates consequence but cannot replace backend controls.

## Reference-to-Galaxy authority rules

The live reference is authoritative for layout, density, navigation hierarchy, panel treatment, status colors, and interaction emphasis. Galaxy OS remains authoritative for:

- Project, Customer, User, membership, and IAM records;
- Product, Estimate, Quotation, Contract, PO/PI, Supplier, Shipment, Inventory, Installation, Inspection, Acceptance, Handover, Warranty, FileAsset, Approval, Activity, Comment, and Notification data;
- business applicability and stage-gate evaluation;
- financial precision and disclosure;
- document immutability and audit history.

Consequently, the implementation should adapt/reuse current domain pages and services behind a new PMS orchestration layer. It must not reproduce reference sample data, legal claims, fake automation, or a second set of business domains.

## Capture inventory

Temporary, untracked captures were produced for both viewports for:

- empty login and executive dashboard;
- dashboard Project detail/return;
- Stage 1 overview, steps 1–5, and Project permission modal;
- Stage 2 overview and steps 1–3;
- Stage 3 overview and modules 1–3;
- Stage 4 overview, tabs 1–4, contract detail, appendices, and package payment form;
- Stage 5 overview and tabs 1–3.

The captures were opened and visually inspected. They intentionally remain outside tracked source and contain no login password.

## 2026-08-08 continuation verification

The authorized reference remained reachable and was inspected again in a disposable Chromium session at 1536 × 864. The audit revisited the Executive dashboard, all five stage overviews, all 18 visible stage/workstream tabs, the Required Document/upload panels, the Stage 2 review panel, Stage 4 red flags/progress, Stage 5 archive/closure/warranty treatment, and the Project permission modal. No create, edit, upload, submit, approval, closure, or deletion action was performed. One session explicitly logged out; every browser context was then discarded.

Fresh captures are stored under the ignored local path `.artifacts/pms-reference/`. They contain the test account email visible in the reference header but no password. Visual inspection reconfirmed the fixed white sidebar/header, light canvas, five-stage switcher, horizontal tab cards, navy routing panels, compact tables, status colors, and full-page vertical composition documented above.

The continuation also reconfirmed two reference behaviors that Galaxy OS must not copy as claims: the sample app presents simulated S-curve/sample business data, and it labels SmartCA/signing as active. Galaxy OS may reuse the visual hierarchy only; it must show real series or an honest empty state and may offer signed-scan/external-signature metadata without claiming a digital signature provider is active.
