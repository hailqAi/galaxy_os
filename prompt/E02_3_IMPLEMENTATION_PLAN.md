# E02-3 — Implementation Plan r1

**OWNER_APPROVED** — owner “Duyệt E02-3-PLAN-r1”, approval SHA256 `995268248ae3fa0885497ce8191e8d1687cce8d0da2e579d023fb62342e808e7`, 2026-10-10. Spec owner approved “Duyệt E02-3-SPEC-r1”, original approval SHA25632b709c2ec27a59bdd8bbace1c79f7f0a49935585e93b088fb1d101be3f5de67, [design](E02_3_IMPLEMENTATION_DESIGN.md). Execution: Codex CLI inline, superpowers:executing-plans/TDD, one independent final reviewer theo repository workflow, no task implementer agents hoặc commit/tag/push/PR.

Goal: native public search/read/citations qua pha công khai có authorization, và PDF/Excel/DOCX/image chat inputs có bằng chứng đúng coverage. Extend engine/registry/File/P1 hiện hữu. Không OAuth/callback/refresh, API-key providers, paid fallback, Workspace, hosted unsupported tools hoặc storage/auth song song. Phát hành phần đạt riêng, capability thiếu ghi BLOCKED thật.

Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, CODE_SHA dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e, preserve dirty P1/E01/E02. E02 Office repair hiện còn full/build/live gate; không sửa caller dùng chung trước khi snapshot/release repair đã đóng băng. Main schema90, existing fixture PostgreSQL55785/Redis56382; guard isolation trước mọi test DB. Chưa migration mới trong plan này.

## Review focus

1. Project private sentinel không có trong public provider/fetch payload, kể cả memory/history/source/tool injection.
2. Mode/query/model/effort được pin và idempotent; auth/clientKey/query handle không đi sang Project/tab/job khác.
3. Codec hỗ trợ media theo model/account receipt thật; unsupported không fallback hoặc claim vision từ metadata.
4. Citation phân biệt snippet/page đã đọc, giữ page/sheet/range/version/hash/coverage và current ACL.
5. Cancel/revoke/timeout/partial stream và tool error không tạo late artifact/answer hoặc SUCCESS giả.

## Task0 — baseline và contract proof

Files: existing release/runtime scripts, ai-chatgpt-plan/siwc-capabilities, ai-native-source/ai-web, P2/P3 specs; private receipts only.

- [ ] Chờ E02-PLAN-r1 Office repair snapshot/acceptance hoặc ghi blocker cụ thể; kiểm manifest/artifact/schema/dirty delta hiện tại, không checkout/reset/stash.
- [ ] Đối chiếu official SIWC models/inference/preview limitations và media shape; đọc current DTO/request metadata/history/model UI callers. Catalog thật đã có7selectable; không thay nó bằng sample list.
- [ ] Tạo corpus tổng hợp được phép PDF text2pages/scan, DOCX table, Excel2sheets/formula cached/leadingzero và known-content PNG. Independent parser/readback xác nhận trước model; không hồ sơ khách hàng.
- [ ] Owner live probe public native search bằng adapter hiện hữu trên selected model/high rồi MAX nếu đã granted. Media giữ UNKNOWN tới khi strict adapter Task4 đã qua unit/fixture rồi mới probe owner trước bật. Record generation/model/route/requested/sent/observed/status/terminal/action/annotations; không truyền raw token cho dependency. No reconnect hoặc paid fallback khi provider từ chối.

Produces: exact native search/media readiness receipts và source/parser fixtures. Không mở capability UI chỉ từ docs hoặc mock.

## Task1 — request v4, mode và public-query authorization

Modify: project-chat.dto.ts; request metadata Zod/types/hash trong ai-registry.ts; ProjectAiService.ask/view/check; project-ai.tsx và shared request callers/tests. Existing v1–3 semantics giữ. Interface: v4 searchMode AUTO/WEB/PROJECT_ONLY + current explicit approved query, server authorization hash/scope trong existing usage; không thêm domain table.

- [ ] RED DTO/strict/payload hash/replay409; v1–3 vẫn project-only và history/source pins giữ. Inspect mọi version===3 caller để v4 giữ job token/history/summary/ACL/lease, không mất provenance.
- [ ] Backend tạo authorization từ exact current public intent/verified identifier; ambiguous/private intent chỉ đưa query proposal, chưa consent zero network. Client không tự cấp queryId/policy/scope.
- [ ] GREEN mode/project/actor/connection generation/query tamper và PROJECT_ONLY zero outbound. UI mode/precise query confirmation/reload giữ đúng conversation; câu hỏi nguyên gốc không bị query thay thế.

Produces: validated v4 pin và scoped authorization for Task2; không tự advertise public search trong private inference.

## Task2 — public native search, page read và citations

Modify: ProjectAiService orchestrator trong existing SIWC route; ai-chatgpt-plan codec/web receipts; ai-web/publicTarget reuse; SourceDrawer/public source rendering/tests. Không thay legacy keyed search gate.

- [ ] RED capture outbound: private sentinel từ Project context/history/memory/attachments/injection không xuất hiện trong public phase. Chỉ query đã bind +selected model/effort+public instructions. Private phase nativeWebSearch luôn false.
- [ ] Native public call khi Task0 READY, retain completed web actions/URL annotations; validate unsafe/offset/unknown source. Keep provider call count/deadline budget, không extra hidden retry/model swap. Nếu budget hiện hữu không đủ, trình measured delta trước đổi bound.
- [ ] Feed bounded public evidence vào private phase như untrusted data. Same model/effort callback/mismatch/lease checks; final Project source/ACL recheck giữ.
- [ ] Page reader chỉ URL handle thật từ public results/authorized URL, dùng DNS/socket pin/private-address/redirect/time/bytes limits. Record coverage SNIPPET/READ_PAGE, title/url/publishedAt nullable/retrievedAt/content hash. Search và read statuses từ actual activity.
- [ ] Native blocked: mark capability correctly và continue Task3/4; evaluate one existing authorized free adapter only if actual gap/terms/live proof. Chưa có path hợp lệ thì WEB_SEARCH_LIVE BLOCKED, URL-only WEB_RETRIEVAL_ONLY. Không install whole stack cho test xanh.
- [ ] GREEN native mock terminal/actions/annotations +integration mode/auth/zero-egress +browser consent/citation/reload/mobile. Live public search/read nguồn chính thức, Project+web sentinel capture riêng, no fake prices/quotes.

Produces: real public source receipts and citations. UI settings không hiển thị SIWC lỗi chỉ vì search unsupported.

## Task3 — bounded document retrieval và correct coverage

Modify only proven gaps: ai-native-source, sourceTool/index/view/citations; parser tests/integration/browser. Reuse uploader/attachment original/hash/version, no10GB buffer/limit increase.

- [ ] RED PDF pages/partial scan/known text citation; DOCX table +coverage missing headers/footers; Excel2sheet/range/numbers/units/leadingzeros/formula vs cache. Parser data có locator thật, model tự khai locator không accepted.
- [ ] Existing source tools READY theo actual source capability; metadata-only không advertise as vision. Preserve image derivative dependency/revocation from E02 Office.
- [ ] Read/search/current ACL/source checksum/version/proof before output/provider/final/history/download; private file không automatically shared/promoted. Other Project/actor deny before snippet/count.
- [ ] GREEN actual upload→parse→source→GPT→citation on same candidate: PDF2pages, Excel2sheets/range, DOCX table. Exact values đọc từ source, no formula recomputation claim. Existing single-sheet/no-formula output v1 remains compatible.

Produces: verified derivative/excerpt input path even if Task4 media unsupported.

## Task4 — native image/file input adapter, capability evidence

Modify: existing SIWC codec/connection/capabilities; ProjectAiService mediaContext/source selection; ai-native-source scanPages; image/file UI notices/tests. Interface uses validated bounded input_image/input_file envelope of selected model/route; no Files upload API hoặc library with raw tokens.

- [ ] RED strict media shape/allowed MIME/byte-pixel-page cap/checksum/source-version/current scope; malformed oversized input denied before network. Rebudget actual envelope, không tự bỏ field hoặc silently resize/full-read claim.
- [ ] Sau strict adapter unit/fixture GREEN, probe ảnh/file tổng hợp nhỏ bằng owner account thật trong candidate; chỉ enable khi receipt accepted đúng model/route/generation và nội dung khớp corpus. Maintain original/hash; derivative resize/scan page metadata includes dimensions/page/coverage. Same model/effort/reasoning continuation/cancel/lease checks.
- [ ] If current256KB wire bound cannot safely carry smallest useful image, measure actual envelope and propose specific tested replacement in review; do not increase blindly. File cap remains actual parser/runtime limit, not10GB.
- [ ] GREEN small known image content actually recognized by provider, PDF scan selected pages recognized with original citation. Receipt distinguishes original sent/derivative sent/text excerpt/metadata-only. Unsupported model displays reason, no fallback or forced general hallucination about source.

Produces: true VISION/FILE_INPUT READY or explicit account/resource/schema BLOCKED; Task3 text remains usable independently.

## Task5 — verification, review và incremental release

- [ ] Focused TDD checks serially, then full pnpm lint/typecheck/test/build/format:check in verified fixture. Unit/mock, real DB/executor, browser, provider live and artifact/source validation receipts kept distinct.
- [ ] Independent final correctness/Ponytail/security/authorization/UX review of actual delta/connected callers. Fix Important via RED→GREEN; no unnecessary abstractions/dependencies/copy engine.
- [ ] Freeze CODE_SHA/TESTED_TREE/source digest/build artifacts; native model/effort/tool/citation/input proof on candidate. New source uses fresh checks, not E02 Office PASS counters.
- [ ] Backup/restore rehearsal/unchanged schema compatibility/app rollback under existing release workflow. Cutover only passing parts, no DB reset/restore/drop. Main/domain/two-Project/two-tab/reload/source ACL smoke.
- [ ] Update prompt matrix/checkpoint/memory/README, canonical/root STATUS/PROJECT_STATUS/handoff, exact changed files/receipts/blockers. E02-A11/A15-write/A20/A21/A23 remain later scope or resource gates, không whole E02 completion.

## Self-review

Every spec contract maps to Task0–5: privacy1/2, file3/4, current engine/ACL/model all tasks, verification/release5. No speculative dependency or migration. Explicit fallback disposition does not enable paused key provider. New-plan approval is asked once; approved Office/P1 work continues. After approval execution remains current CLI, no new method gate.
