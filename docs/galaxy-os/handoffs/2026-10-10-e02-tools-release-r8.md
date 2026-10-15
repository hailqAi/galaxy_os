# E02 R8 — SIWC tools active, Workspace deferred

E02-CP-r44, 2026-10-10, Codex CLI inline. Supersedes CP-r43 for current runtime and acceptance; earlier approvals, failed attempts, source snapshots and rollback remain preserved. Functional E02-0 through E02-5 are deployed. Generative image remains **NOT_READY/BLOCKED**; advanced optional engines and the user's full UI redesign remain separate.

## Release and verified behavior

Main serves **local-2837e21d800f**, READY on web3000/API3001 and `https://os.galaxycentre.vn`. Workspace dispatch/poll/retry/fallback are disabled in the backend; the chat configuration form is hidden. SIWC, Create, files, drafts, jobs, history, Project Memory and backend ACL remain active.

| Identity                              | Exact value                                                           |
| ------------------------------------- | --------------------------------------------------------------------- |
| CODE_SHA / existing HEAD              | `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`                            |
| TESTED_TREE / frozen private snapshot | `d6ecacdfbea565e16f398782242fccd2db044d90`                            |
| Source digest                         | `2837e21d800fd771ae70b65c794e63c5b2ae0e283a7981438fd2b253c1086dfc`    |
| Web BUILD_ID                          | `OsFEVy_hpiJMo87CZtFxo`                                               |
| Deployed artifact                     | `/home/galaxy_os/.runtime/releases/e02-tools-20261010-r8`             |
| Canonical source                      | `/home/galaxy_os/.worktrees/m2-a-20260928`                            |
| Database schema                       | 91; R8 cutover app-only, no migration                                 |
| App rollback                          | R6 `local-0aee6608a27d`, schema91-compatible; do not restore/reset DB |

CODE_SHA is the existing commit, not a new commit containing the dirty changes. TESTED_TREE identifies the immutable tested source snapshot. Technical STATUS/handoff documents updated after freeze do not change that snapshot; final product-file fidelity check matches it, allowing only declared Next.js generated declarations. No commit/tag/push/PR was made.

The priority owner acceptance used stored, explicitly labelled synthetic price data and an authorized real PNG. In chat, GPT called `read_project_source`, three `calculate` calls and two `create_document` calls. One matched source-read error was returned honestly and the model continued. Seven accepted provider responses retained requested/sent/observed **gpt-6.1-sol/max**. The job completed in about149.3s; the previous R6 lease120s failure remains recorded, rather than recertified as success.

Both new files are real, private and available after reload, with preview200/download200 and wrong-Project404. Independent native readback/render verified code0007392, quantity2, VND, price125000.50, subtotal250001.00, tax25000.10 and total275001.10, plus the actual source image. This v1 workbook has zero formulas; the separate v2 workbook acceptance verifies structured formulas and cached results.

| Priority file | SHA256                                                             |
| ------------- | ------------------------------------------------------------------ |
| XLSX          | `90998066aaa68847adfecf0a3d9e1356faa736466738360184eb9fc0fe5643be` |
| PDF           | `e10ea376e70277efa2e3e4085a0ecb57ec8cbffd2f033cbf98b958f78d253240` |

Owner conversation: [synthetic quote](http://localhost:3000/projects/50000000-0000-4000-8000-000000000001/ai?ai=3276b58f-f105-4f37-ade5-4e4835e77342). Test records are labelled synthetic and retained; no customer records were used or deleted.

## Fresh checks and evidence levels

Fresh R8 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check` all exited0 between13:35:55Z and13:47:14Z. **2305 passed**: API1702, Web597, edge5, inactive document-service placeholder1. One opt-in physical10GB case is skipped in the standard suite and was run separately. No unhandled errors in the final run. Frozen R8 browser **14/14 passed**, including exact-question/Markdown/history, MAX, Project isolation, late jobs, public-query confirmation, original upload/resume/promote and native PPTX preview.

| Evidence level                                                                                | Receipt in ignored `/home/galaxy_os/.runtime/e02-20261010`                                                                 |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Full source checks / frozen browser                                                           | `final-checks-r17.json`, `final-r17-*.log`, `candidate-p1-browser-r8.log`                                                  |
| Owner current account/catalog, image unavailable, old Office after app restart                | `main-catalog-durability-r8.json`, `main-domain-browser-r8.json`                                                           |
| Current owner GPT quote / strict model-effort-tool trace                                      | `main-quote-r8.json`, `main-quote-r8-trace.json`                                                                           |
| New native XLSX/PDF validation and private previews                                           | `main-quote-r8-validation/validation.json`, `main-quote-preview-r8.json`                                                   |
| Current Markdown exact saved text, caveat, sources, versions, artifact links, reload and ACL  | `main-markdown-r8.json`, `main-markdown-r8.md`                                                                             |
| Current two-page scan, raster-only hidden marker on page2, exact media hash and page citation | `main-native-inputs-r8.json`, `native-trace-r8.json`                                                                       |
| Current native public search plus separate local PAGE reader / citations                      | `main-web-page-r8.json`, `main-web-page-r8-trace.json`                                                                     |
| Current general knowledge at second Project, exact question/MAX/no web                        | `main-general-r8.json`, `main-general-r8-trace.json`                                                                       |
| Current two-tab/two-Project private memory, v2/provenance, stale409, foreign404 and reload    | `main-memory-two-projects-r8.json`                                                                                         |
| Current main72MB pause/reload/reselect/resume/SHA/download/promoteDRAFT                       | `main-upload-promote-r8.json`                                                                                              |
| Separate actual physical decimal10GB transfer                                                 | `full-10gb-r6-receipt.json`, `full-10gb-r6.log`, `unchanged-upload-r8.json`                                                |
| Original GPT native DOCX/PPTX/v2XLSX/revise and native readback                               | `main-office-r5.json`, `main-revise-r5.json`; original release scopes retained                                             |
| Final runtime/readiness/artifact/source identity                                              | `final-main-status-r8.log`, `final-main-artifacts-r8.log`, `final-main-guards-r8.json`, `final-source-fidelity-r8.json`    |
| Independent review / one parent repair pass / exact bindings                                  | `review-r7-r1.md`, `review-deadline-r1.md`, `review-r8-r1.md`, corresponding closure files, `review-r8-final-binding.json` |

The 72_351_744-byte main test used a real browser File generated from labelled deterministic synthetic bytes, passed through the unmodified UI/uploader/proxy/storage. Playwright's50MB CDP buffer-upload limit required test-data construction through DOM File/DataTransfer, not a product bypass. Part attempts were1,2,2; committed part1 was not resent. After reload, full-byte SHA matched and a permitted promote created a DRAFT with provenance, not approval.

The separate physical10GB proof used dense **10_000_000_000 bytes**,150parts of64MiB, actual isolated Nest restart, two retained parts, missing-part-only resume, full readback/SHA, checksum/current ACL/idempotency/cancel and bounded derivative checks. Peak RSS **890_163_200 bytes**, below1GiB. It ran against frozen R6; seven uploader/parser component hashes remain identical in R8. Current R8 frozen browser plus main72MB acceptance cover the present integration. This is not a claim that a new10GB transfer ran through main or that the whole file is supplied to GPT. Derivatives remain bounded and PARTIAL is explicit.

The final [28-row matrix](/home/galaxy_os/prompt/E02_ACCEPTANCE_MATRIX.md) records **27 PASS and A23 BLOCKED**, with unit/mock, real DB integration, frozen browser, provider live, native file and deployed evidence separated. Download revocation, cancellation, abort-ignoring provider and late-output fencing have actual DB/controlled transport tests; no live SIWC credential was revoked/disconnected to manufacture a green test. Original R5 Office generation is not described as a new R8 provider call; byte hashes/private previews/download after R8 app restart and full/native/browser regression establish retained behavior.

Failed full-r15 synthetic fetch leakage and full-r16 concurrent Supertest ECONNRESET fixtures were reproduced and repaired only in tests. Full-r17 passed afterward. Private helper relative URLs, cache assertion, CDP file-size limit and numeric web-search-count assertion were corrected after inspecting the real contracts; failed helper logs remain. None required a product fallback, ACL bypass, lost MAX field or credential change.

## Source retained, separated and disabled

The dependency map is [approved design §3](/home/galaxy_os/prompt/E02_IMPLEMENTATION_DESIGN.md). Classification is by callers/domain, not the word workspace.

| Class                               | Final treatment                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Workspace provider/configuration | Disable new prepare/dispatch/tick/retry/connector authorization and AUTO fallback; remove lifecycle polling and chat provider/config requests. Return `WORKSPACE_DEFERRED_BY_USER`. Keep dormant configuration/job/grant/schema/history and authorized view/cancel. No destructive provider cleanup. |
| B: Shared AI/jobs/artifacts/files   | Keep existing registry/dispatcher, durable answer queue/progress/cancel/results, Artifact/FileStorage, original/hash/version, resumable upload/quota/cleanup and backend ACL. No replacement engine/domain.                                                                                          |
| C: SIWC/Project/File/Draft          | Keep `create_document`, `revise_draft`, source retrieval, context/history/P1 memory, citations, Create, file/image cards, previews/download. Markdown export uses the existing owned answer/current ACL and no extra provider job.                                                                   |

Decoder sandboxing now uses one shared fixed executor for untrusted Poppler/Sharp: cleared environment, no network, read-only whitelisted runtime, isolated temp paths, bounded bytes/pixels/time/CPU/FD and cancellation. No arbitrary model-selected host shell. Transient decoder-busy requeues refund only that attempt; actual failures retain bounded retry. The AI job has a300s overall deadline,110s per-provider round and360s worker lease, with330s client transport; continuation keeps exact model/effort, call IDs and current authority. Maximum10 provider rounds,4 calls/response and3 artifacts remain bounded.

The narrow final R6-to-R8 reviewed delta is16 files, manifest SHA256 `5fc712e435725e3fa1acae05ced438dffaf22e8802691a678d1ea2fdc2460741`, patch SHA256 `faeca402ce2cadfcb0fb4fb9075bfc9fd6a76e28f14b5bd03ac92d67fad1e313`. Exact paths/hashes: `changed-files-r8-final.json`. The broader baseline-to-release inventory in `source-delta-r3-r8.json` includes carried-forward E01 changes and is not attributed solely to E02. Technical docs updated after freeze are separately recorded.

## Tool decisions and actual remaining limits

Canonical [adoption matrix](/home/galaxy_os/prompt/GALAXY_AI_TOOL_ADOPTION_MATRIX.md) records GAP → reuse/adapter → sandbox → select/defer → integrate → live evidence. OfficeCLI1.0.156 is pinned to upstream699cafbc8f0b8a7841c6cca53dafd0c24e982f56/binary SHAa5ed6e4157fe9b24a099cd24ff30e89a4349b7a7d782d2b7de8d56294c7e1423, Apache2.0/.NET10/OpenXML3.4.1, fixed arguments and offline sandbox. Native PPTX uses upstream gitbrent/PptxGenJS4.0.1 commit3c9ec1b687c174952166f6a34b5e87ebf69fa469/MIT, exact lock and authorized image bytes; no remote media paths. Templates/native text, shapes, image, table and chart remain editable.

AnyDoc0.2.4 was sandbox-tested and deferred: whole-file read, no required page locator/local OCR and optional hosted OCR did not fill the current large/scan gap. PPT Master contributes workflow ideas only. No bulk repositories, paid APIs, raw SIWC token to libraries, second memory/auth engine or duplicated approval hooks. Other PDF/web/memory stacks remain conditional until a measured gap needs them.

**A23 real blocker:** no verified generative image engine/model/weights/license/workflow/resource benchmark. GTX1050Ti4GB is observed hardware, not readiness evidence. The image Create entry is visibly NOT_READY; input vision works separately. Video is a separate capability.

**Context capacity remains UNVERIFIED** under the previously approved P1 exception: conservative input packing, summaries/retrieval and complete original question remain enforced; byte bounds are not a tokenizer/context-token certificate. Seven actual selectable account models are exposed; unverified reasoning modes remain disabled. Owner SIWC is ready; staff provider entitlement remains OWNER_ONLY_STAFF_UNCONFIRMED. Do not reconnect SIWC to address context or buy/enable paused API-key providers.

No required code or acceptance remains pending for the deployed Office/web/file/memory scope. Next work is the user's UI redesign, or a separately justified verified image engine/advanced parser gap. Keep current auth, Project permissions, original artifacts and app rollback. The temporary loopback acceptance bridge and owned fixture servers were stopped; Edge window/profile and main services were preserved.

## Exact final R6-to-R8 files

- `PROJECT_STATUS.md`
- `apps/api/src/project-chat/ai-decoder-sandbox.integration.test.ts`
- `apps/api/src/project-chat/ai-decoder-sandbox.test.ts`
- `apps/api/src/project-chat/ai-decoder-sandbox.ts`
- `apps/api/src/project-chat/ai-document.ts`
- `apps/api/src/project-chat/ai-native-source.ts`
- `apps/api/src/project-chat/project-ai.service.ts`
- `apps/api/src/project-chat/project-chat.controller.ts`
- `apps/api/test/chatgpt-connection.integration.test.ts`
- `apps/api/test/p1-project-ai.integration.test.ts`
- `apps/api/test/p1-project-memory.integration.test.ts`
- `apps/web/features/project-chat/project-ai.test.tsx`
- `apps/web/features/project-chat/project-ai.tsx`
- `apps/web/next-env.d.ts`
- `apps/web/tests/browser/p1-project-ai.spec.ts`
- `docs/galaxy-os/05-IMPLEMENTATION-STATUS.md`

Broader frozen E01/P1 baseline-to-R8 paths/hashes are in [source inventory](/home/galaxy_os/.runtime/e02-20261010/source-delta-r3-r8.json); exact16-file frozen hashes are in [final delta](/home/galaxy_os/.runtime/e02-20261010/changed-files-r8-final.json). These ignored technical inventories contain paths/hashes only, not credentials. Current documentation changes additionally cover `/prompt/README.md`, memory/checkpoint/evidence/model matrix/acceptance/adoption/release handoff, root and canonical STATUS, and this handoff.

## Final cleanup and current HTTP limits

At 2026-10-10T14:39:40.742338+00:00, main web3000/API3001 were still200 and identified R8; fixture33001/33002/33003 and bridge33005 no longer listened. Final docs formatting/diff checks passed. HTTPS browser acceptance at2026-10-10T13:56:06.961Z returned200/currentR8. A later plain Python HTTPS probe returned Cloudflare403/error1010; it does not supply a fresh domain200 certificate. No edge/auth policy was changed to make a CLI probe green. `bridge-cleanup-r8.json` and `acceptance-closure-r8.json` retain these exact scopes.
