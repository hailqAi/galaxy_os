> **E03-CP-r44 — R29_BUILT_NOT_DEPLOYED / MAIN_R28 / E03_OPEN, 2026-10-11T12:31:19.543304+00:00:** R29 `local-c60430df1783`, sourceDigestc60430df1783a4c4273a504991bc21e1a768e1c2134b410c679205a6f1a8f400/tree74926a7939f7445d674b60763d3c2610c841629b/WebIt\_-oHOmzUXsMFdbxHEZd/930inputs/schema93 built12:28:59Z. Exact narrow product review Ship binds5changed files and fresh151focused/type/lint0; JSON escape and legacy VERIFIED-opaque REDs retained and fixed. Initial Turbopack sandbox-bind failure/artifact preserved; same reviewed builder rerun succeeded with local-bind permission. Fresh frozen full/browser/native/cutover/owner trials pending. Main remains R28; its two exact PDF answers FAILED, question+attachment/reload/SHA retained, SHORT text10/10FULL/public7searches/one page read/no quote artifact. Separate unfrozen B helper43PASS, precise-fragment service89PASS, saved-FINAL partial recovery3unitPASS, fresh current type/lint0; source-only finalizer/migration SQL Ship. Migration94 unapplied; exhaustive planner/real-DB FINAL/follow-up/whole quote/full36 remain OPEN. [Handoff](/home/galaxy_os/prompt/E03_CONTEXT_FILES_AUTOSEARCH_HANDOFF.md).

> **E03-CP-r43 — R28_OWNER_PDF_FAILED / LOCAL_STREAM_FIX_IN_REVIEW / E03_OPEN, 2026-10-11T12:12:31.475212+00:00:** Main remains R28 `local-86802643ae6b`, schema93. Both exact-owner UI trials failed: OLD CHATGPT_RESPONSE_TOO_LARGE after5accepted SIWC/18tools; SHORT INPUT_BUDGET_EXCEEDED after7accepted/37tools. Both preserve the exact question, attachment, original checksum and one message after ACK/terminal reload. SHORT extracted text10/10FULL and ran7authorized public searches/one page read; no quotation artifact. Model/effort receipts are gpt-6.1-sol/max requested/sent/provider-reported; whole-document model reading and account capacity remain UNKNOWN. Galaxy cumulative SSE512KB guard is reproduced by a valid repeated stream; canonical fix retains bounded frames/unique output. Encrypted continuation is separately bounded, never certified as ordinary text tokens. REDs retained; focused61PASS and private saved-text plus explicitly synthetic opaque control1PASS. Neither fix is deployed; exact failed wire was not captured. Unfrozen reader/security13G00PASS and coverage-final RED remain separate; migration94 is source-reviewed but unapplied. Full36/quotation/exhaustive validation remain OPEN. [Handoff](/home/galaxy_os/prompt/E03_CONTEXT_FILES_AUTOSEARCH_HANDOFF.md).

> **E03-CP-r42 — R28_DEPLOYED / EXACT_OWNER_PDF_RUNNING / COVERAGE_FINAL_RED / E03_OPEN, 2026-10-11T11:41:18.648917+00:00:** Main R28 `local-86802643ae6b`, sourceDigest86802643ae6b15a33088c6bf797f82c85e492d295037c4d8216d9d2537261be3/tree8e5fcccd94ea9b1ffae89c25907d93891f02fb2c/WebFilOteXhHd-3f-oudI24O deployed2026-10-11T11:39:16.087547+00:00. Actual up/status/artifacts exit0, unchanged schema93, app-only R27 fallback; private backup2265449B/115storagefiles retained. Fresh five checks2425PASS+1skip/browser29/native2/artifact1 PASS. Native recovery now exercises34completed tools/32exact calculations/fiveMAX requests with one native media, fixed1800s and saved-source/SHA/reload/no-duplicate proofs; provider is synthetic, observed effort UNKNOWN. Narrow packing preserves protected native pairs and losslessly compacts completed nonmedia records; limits unchanged. Exact owner PDF1405052B/SHA1ab519… is being retried through UI in old and new-short conversations; OLD user ACK201/question+attachment after ACK reload confirmed, quotation/terminal/SHORT pending. Both R27 actual failures and exact65→14item checkpoint replay retained. Unfrozen B current type/lint PASS; stronger PDF/XLSX decode-time fences8 plus invalid cursor5 =13real-G00 PASS. Whole-document premature-final test is actual RED (COMPLETED after only page1 of3); selected-page counterpart PASS. Authoritative exhaustive planner/final completeness/money validation and new nondeadline PARTIAL migration remain unfinished; no B reader/cursor delta is in R28. Actual public manufacturer, quote artifacts/images/totals, dense-large-file coverage and all36 remain OPEN. No context entitlement/MAX raise, Workspace, new stack, reset or commit. [Handoff](/home/galaxy_os/prompt/E03_CONTEXT_FILES_AUTOSEARCH_HANDOFF.md).

# E03 Implementation Plan

### Task5 bugfix — no-file queued deadline, 2026-10-11T14:24Z

Actual authorized owner metadata identifies one NORMAL run without attachments: queued13:16:44Z, deadline13:21:44Z, terminal13:44:20Z, attempts0/providerRounds0/providerStartedAtNULL/acceptedReceipts0. It waited behind the13:11Z DEEP run. The current worker awaits an entire run under workerBusy and the SIWC claim gate permits only one running job per owner. A real-G00 regression independently reproduces NORMAL remaining QUEUED while a different-conversation DEEP provider is held.

Reuse the existing dispatcher and durable claims: permit at most two in-flight jobs in this process and two current leased jobs per SIWC owner under the existing connection transaction fence; serialize each conversation. Release the polling lock after dispatch, retain job identity until completion, and continue bounded expiry settlement while slots are occupied. Keep NORMAL300s/DEEP1800s deadlines, request model/effort, context/tool/round limits and uncertain-dispatch fencing unchanged. A stopped worker must abort a job whose claim finishes after shutdown. No additional queue, dependency or silent historical request replay.

Reach tickRuns/runChatGpt claims/shutdown, deadline answer and uncertainty, existing fake fixtures, actual independent-worker/held-run/expiry/Stop integration tests and current full/native/browser gates. Deadline text must distinguish an unstarted queue timeout from processing timeout; no-file turns must not assert missing document coverage. Preserve a committed FINAL text exactly. After a reviewed frozen deployment, verify actual no-file chat while a separate deep run is active, plus reload/Stop and the original PDF. The owner0-tool row and exact PDF failures remain historical evidence; G00 tests do not mark live acceptance complete.

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`, Codex CLI inline đã được owner chọn. Không commit/tag/push/PR. Checklist được cập nhật theo bằng chứng thực.

**Goal:** Exact PDF đọc được trên product runtime; message/attachment bền vững, large files theo coverage, safe Auto research, rich chat và durable deep runs.

**Architecture:** Reuse ChatAiAnswer/source index/FileAsset/UploadSession/P1-B và native public phase. Thêm phạm vi nhỏ trong orchestration/worker và sandbox reader; không parallel domain/queue/memory. Release A độc lập trước các delta lớn.

**Tech Stack:** Strict TypeScript, NestJS, Next.js/React, Prisma/PostgreSQL, file streams, existing bounded sandbox tools; Markdown/GFM dependency chỉ sau license/version check.

**Spec:** `E03_IMPLEMENTATION_DESIGN.md`, E03-SPEC-r1. Owner reply 2026-10-11: “duyệt tất cả thiết kế … tập trung hoàn thiện chức năng”; giữ Codex CLI inline, không hỏi lại functional design, Figma redesign sau. Original E03 443 lines/A01–A36 vẫn là yêu cầu chuẩn.

## Global constraints

- Decimal file cap10000000000B; no whole large binary in RAM/PostgreSQL.
- SIWC selected model/MAX pinned; no keyed-provider fallback/background field/credits/Workspace.
- UNKNOWN media/account capacity stays UNKNOWN; no guessed VERIFIED flag.
- Current backend ACL/version/checksum before read/egress/publish/download; no cross-Project.
- No resets/applied-migration edits/user-work deletion. New migration only production-safe prisma:migrate create-only+SQL review if schema extension necessary.
- Fresh full checks/review/browser/provider/artifact/deployed identities required for completion. Main/data-preserving rollback kept.

## Review focus

Provider JSON mimicking media must count as text; legacy saved budgets still readable. Uploaded original remains linked on failed/reloaded answer. Native search cannot receive private question/history/source/memory. Restart after uncertain provider dispatch cannot duplicate request or artifact. Exhaustive task cannot report full coverage from a few excerpts.

### Task1 — Exact PDF local guard and saved attachment bugfix (A first release)

Files: api `ai-chatgpt-plan.ts`, `ai-history.ts`, `ai-registry.ts`, `project-ai.service.ts` and focused tests; web `project-ai.tsx`/test. Interface: request wire unchanged, bounded media ledger extends legacy execution budget; view.attachments from already authorized refs.

- [x] Trace actual PDF/hash/version using existing legitimate rights; identify original PREPARED, third local guard failure after two accepted provider rounds.
- [x] RED original1.4MB transport vs256k text, media boundaries, provider JSON collision, executionMetadata roundtrip; minimal fix then GREEN50.
- [x] RED failed answer user attachment projection/UI; preserve original/current ACL then GREEN API43/web24.
- [x] Complete all existing attachment download route shapes; security UX review and focused checks.
- [x] Serial full lint/typecheck/test/build/format:check; build immutable A candidate and bind source/tests/tree/review hashes.
- [x] Backup/preflight no active run/uploadverification, unchanged schema91; candidate browser then app-only release with automatic safe rollback.
- [ ] Exact PDF in short conversation and failing conversation on domain; three privately verified facts, question/attachment after reload, original hash unchanged, accepted media/model/MAX evidence. No fixture substitute.

### Task2 — Upload/message ordering and large source reading

Files: web `project-ai.tsx`, existing uploader/test/browser; api `project-ai.service.ts`, `ai-native-source.ts`, `ai-decoder-sandbox.ts`, existing storage API/tests. Interface: upload returns immutable original sourceId; ask pins original before index; run performs bounded source work and persists coverage.

- [x] RED blocked index must not delay durable user POST, failed run retry cannot POST duplicate, upload pending cannot silently send text-only. Split upload completion from parsing; clear draft only after durable ack and refresh message before parse/run.
- [x] RED exact requested >8MB PDF page read: streamed original/checksum + sandbox read-only local input, page/range output caps; no Buffer limit raise. Validate source/path/hash/timeout/no-network and source lease claimed immediately before its work.
- [ ] Save page/sheet/row/byte coverage/derivatives. Exhaustive source planner iterates missing ranges, PARTIAL on failure/deadline and carries all coverage into final validator.
- [ ] Real uploads below/at/above50MB and50MiB, resume/duplicates/cancel/hash/quota/decimal10GB server boundary; separate validator simulation vs real transferred file receipts.

### Task3 — Safe automatic multi-source research

Files: `ai-web.ts` or focused policy beside it, DTO/registry/service/test; web composer preferences/tests/browser. Interface: AUTO pins server public intent/query policy proof; private phase has no native web, separate public phase has only policy-approved query.

- [ ] RED new session AUTO and existing explicitProject-only retained; currentprice/spec task searches without manual textbox/checkbox, simple task avoids unnecessary search. UI default/preference verified; currentprice/simple live acceptance pending.
- [ ] RED secret sentinels in question/history/memory/tool output never reach native search/publicfetch. Structured intent/templates + approved public terms; unsafe/unknown terms minimized, exact private disclosure approval only when required.
- [ ] Reuse isolated native web+local publicreader and current sources/memory/business ACL; Project-only forbids all outbound web. Tests missing connection/revoked permission/tampered policy/otherProject citations.
- [ ] Live official public manufacturer fact and price/spec query, attribution/coverage, retain private source original; don't add stack before measured gap.

### Task4 — Markdown and compact provenance

Files: web `chat-text.tsx`/test, `project-ai.tsx`/test/styles; stream parser citation metadata/tests if needed.

- [x] RED Vietnamese bold/link/table/code/escapedcontent/XSS/unsafeimage URLs; install smallest maintained pinned Markdown/GFM renderer after primary documentation/license check; disable rawHTML and preserve content/code.
- [ ] Visible clickable native web attribution, backend validated offsets retained if inline mapping supported. Collapse long references/details by default, preserve provenance/download routes.
- [ ] Browser stream/reload equivalence, inline source images and artifact preview/download, no diagnostics/reasoning/toolJSON user answer.

### Task5 — Durable normal/deep runs

Files: existing service/module/controller/DTO/schema if necessary, focused worker beside project-chat, same runtime lifecycle; web run polling/progress/Stop; integration/browser tests.

- [ ] RED /run returns runId without waiting provider; queue durable scope+actor/session+pins, normal300s/deep1800s deadlines. CAS claim/heartbeat/checkpoint persists current steps/source refs/tool identities, no binary or CoT.
- [ ] Worker resumes safe accepted checkpoint after restart/reload; uncertain dispatch UNKNOWN/no automatic replay. Existing provider reservation/quota/ten-round bound reused; per-tool bounded timeout/backoff, same model/effort every step.
- [ ] RED Stop/revoke/expired lease/late output duplicate artifact fencing; PARTIAL deadline with actual verified saved output/coverage, no invisible continuation.
- [ ] Live disconnect/reload and bounded worker restart, cancel/deadline; browser progress real phases, no fabricated percentage.

### Task6 — Inventory, whole regression, acceptance and handoff

Files: prompt memory/checkpoint/tool adoption/E03 handoff/acceptance; canonical/root STATUS/PROJECT_STATUS. No extra tools installed without need.

- [ ] Inventory all17 named candidates with observed version/install/executor/toolcall/artifact/resource/egress and precise lifecycle; retain ComfyUI BLOCKED, existing P1-B authoritative. Fresh runtime receipt for selected adapters.
- [ ] Exact PDF→publicmanufacturer→verified XLSX/PDF DRAFT with source images and matching totals; private artifacts in .runtime, no quote data/token/signedURL in Git.
- [ ] Independent whole diff Ponytail/correctness/security/authorization/UX review; all full checks and36acceptance recorded individually with evidence class and honest blockers.
- [ ] Freeze/deploy identity, domain acceptance/current source hashes, data-safe rollback; update prompt memory/checkpoint/matrix/handoff and STATUS, close temporary CDP bridge.

### Task2 detail — origin and locator accounting (approved E03 coverage scope)

Reuse typed ToolSource/runProgress/dependency domain:12distinct immutable source origins, up to existing64proof/citation handles. Reach saved reader, checkpoint schema, SIWC admit/research reserve/terminal merge, per-source PDF/Excel dependencies and focused/realDBtests. Keyed route12source cap retained. Create only a NEW reviewed migration via prisma:migrate --create-only; never edit applied SQL or main before gates. Bounded original validation needs one metadata locator; keep8MB/SHA/header/pdf safety and default derivative10 cap. RED origin/dependency/native/DB guards before GREEN; current EXHAUSTIVE planner/final validator still separate unfinished work.

### CP32 implementation evidence (2026-10-11; original acceptance checkboxes retain broad scope)

Task1 actual quote is reopened: R24 calculator-origin failure after six ACCEPTEDMAX rounds, exact original/question/attachment retained. R25 calculator engine grouping has valid RED/GREEN13-result INLINE+DEEP regressions; no origin/proof/call/round cap change. Source Ship report cef667671401bcde2643c65a4f6b284b4c2eb780cba84af7698c69d2fccf8b91; final focused gate d93116683e8545824bc05916d86edd50cdc89c786346f45fb39609354ff7049f. Task2 local PDF-page image Create now has135unit/9backend/actual process replay1 PASS on canonical; frozen full/main/owner pending. Exhaustive PDF/Excel planner remains unfinished. Task4 rich browser29 passed on frozen R24 synthetic source display; live manufacturer attribution/output remains open. Task5 queue/ACK/CAS/checkpoints/MAX/restart/Stop/deadline have scoped R24 full/browser/native runtime proof and canonical artifact replay; owner complete quote remains a separate gate. Task6 R25 built/fresh full running, exact owner harness and remaining ops review pending; no broad completion claim or 10GB live transfer.

## R27 — durable browser waiter, 2026-10-11

The original MAX browser expectation included queue/provider time in its default5-second DOM window. The owned G00 timeline retained RED: terminal at09:22:03.203Z, next authorized history/DOM at05.977/06.125Z after ask00.634Z on a visible, focused page. Reuse the existing bounded send() helper for A/B; retain exact model/MAX, reload and both sentinel assertions. Product timers, provider limits and ACL remain unchanged. Focused original PARTIAL reload plus corrected MAX both PASS; prior r3 PARTIAL reload failure remains unknown and retained. Freeze this one-file test correction on R26 into R27, run fresh full five/browser29/native2+artifact1 and reviewed app-only deployment on schema93, then resume the exact owner PDF old/short acceptance. Root evidence is private `.runtime/e03-20261011/r26-browser-{reload,durable-wait}-timeline-private-r{1,2}.json`; no fixture proof substitutes for owner PDF/quotation acceptance. Existing approval scope remains in effect.

### CP41 — actual tool-item budget bugfix and Task2 continuation

Owner R27 SHORT64item SAFE checkpoint plus exact already-executed calculator output reproduces65item snapshot failure. OLD58 persisted items exclude opaque reasoning, so that saved count is not its full wire item count. Fix the shared ai-history continuation packer, never the64item/text/media limits: preserve current question/history/memory/media/native pending calls, pack completed paired tool records losslessly as untrusted bounded JSON, validate duplicate/missing links and retain source/tool ledger and checkpoint proofDigest. Reach all existing packer callers, unit/p1 durable tests and fixtures; real owner trials remain failed until a new frozen reviewed release and retest. No provider replay or private payload in public search.

Finish Task2 verified-path XLSX/precisePDF cursor security and SAFE restart tests, then authoritative scoped document coverage/progress and final completeness/money validator using existing ChatAiAnswer/FileAsset/source index/dependencies. Exhaustive missing work must remain PARTIAL with actual saved output; existing bounds stay enforced. If PARTIAL needs a nondeadline reason, add a new reviewed production-safe migration; never edit applied migration. Compose these reviewed deltas, run fresh full/browser/recovery gates and owner quote acceptance before marking A02/A15/A29/A36.

### Task2 next verification — 2026-10-11, after CP41

Canonical tests now distinguish a three-page exhaustive request from an explicitly selected page. A premature provider final after page1 must either trigger the missing-page work or retain the useful answer as `PARTIAL / DOCUMENT_COVERAGE_INCOMPLETE`, with pages2–3 still named in the coverage ledger. The selected-page request may complete at its own scope while global document coverage remains partial. These tests are not executed or passing yet and are excluded from the five-file immutable R28 hotfix. No applied SQL or main/G00 schema was changed for them.

The reader security extension tests stale cursor version/original SHA/page SHA, a mismatched page, and an offset past the text, then verifies no additional coverage is published. The existing decode-time version/hidden/grant-revoke/Stop fence is tested for both PDF and XLSX. Run these serially when the R28 full suite releases G00, retain the actual RED/green logs, and keep SAFE process recovery and the exhaustive planner/final validator as separate required work. Public/API context capacity and accepted-original delivery do not replace these source-coverage checks.

### CP41 A-first release detail — R28 completed-tool packing hotfix

Freeze a narrow five-file override on immutable serving R27: ai-history.ts/test, ai-run.test, only the four protected-media packer calls in project-ai.service.ts, and only the new durable native-PDF/calculation regression in p1-project-ai.integration.test.ts. Preserve every other one of R27's930source inputs and schema93. The full canonical source retains the pending XLSX/cursor work; do not discard or include those unfinished hunks silently. Build the projected source as its own immutable reviewed candidate, run all five fresh gates/browser/native-process recovery and then controlled app-only cutover with owner PDF retest. No commit/reset or duplicate source domain.

The initial native backend-r1 checks item pressure but its calculator arguments were invalid and its oracle omitted OK/result validation; it cannot prove32successful calculations. Preserve that run and subsequent oracle RED. Use backend-r2 only if it verifies33/33OK, each exact Decimal2, one original media per payload, all four MAX rounds and saved FINAL proofDigest/reload. Unit62PASS and exact private SHORT checkpoint shape replay remain distinct from this durable service evidence.

### Task2 scoped finalizer implementation — CP42 RED

Actual G00 RED confirms whole PDF page1/3 incorrectly becomes COMPLETED; selected-page counterpart is correct. Implement within the approved exhaustive coverage/final-validation scope: pin required immutable PDF/XLSX originals in existing v4 request metadata for explicit whole-document or quotation-rebuild requests; keep negative/selected-page requests narrower. Derive completeness only from version/SHA-bound server reader coverage, never provider wording or original-delivery receipts. A premature final retains useful answer/artifacts as PARTIAL with a clear missing-coverage warning, including after FINAL checkpoint recovery. Add one new create-only reviewed migration allowing DOCUMENT_COVERAGE_INCOMPLETE under a nonempty v4 required-document pin while retaining deadline, completed, failed and null-answer invariants. No applied migration edits.

Reach request-schema parsing/hash/creation, existing tool coverage helpers/reader locators, finalizer and resumed FINAL, existing PARTIAL UI/download, focused negative/selected/missing-proof tests and real-G00 integration/SQL constraints. Next, reuse the same bounded source reader, saved progress and checkpoint to process missing page/range work within current quotas. Keep partial rows/pages/errors explicit at limit/deadline; no new queue/framework/provider fields or cap increases. R28 remains immutable and its actual owner run continues independently.

### Task1 local stream and opaque transport correction — CP43

Keep immutable R28/schema93 as baseline. Reach shared readChatGptStream, chatGptAccounting, historyBudget, persisted budgetSchema and focused callers/tests. SSE guard bounds frame/pending buffer/unique completed output rather than total repeated event bytes; preserve strict indexes/terminal/links/abort and110s/deep deadlines. Separate encrypted_content from known summary/text; retain unchanged256KB text,128K per encrypted item and a256KB aggregate opaque transport envelope using the existing bounded envelope,64items/8MBmedia. Unknown opaque/media tokens prevent VERIFIED even with a text-only profile. New wire-bound arithmetic follows separated byte components, not account-context entitlement. Freeze only this narrow delta on R28, excluding pending B reader/finalizer/migration94. Run fresh full/browser/native/Create gates and reviewed app-only deploy before owner old/short UI retests. No automatic provider replay or user question shortening.
