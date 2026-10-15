# Bộ nhớ phát triển Galaxy OS — 08/10/2026

> **09/10 — nguồn đọc hiện hành:** kiến trúc AI và bộ nhớ phát triển mới chuyển nguồn chuẩn sang [README `/prompt`](/home/galaxy_os/prompt/README.md) và [memory dài hạn](/home/galaxy_os/prompt/GALAXY_OS_LONG_TERM_MEMORY.md); tiến độ/approval/bằng chứng ở [checkpoint AI-CP-20261009-r1](/home/galaxy_os/prompt/GALAXY_AI_PLAN_AND_CHECKPOINT.md) và STATUS/handoff mới nhất. Toàn bộ nội dung 08/10 bên dưới được giữ làm lịch sử; các đoạn CONNECT_FIRST/pending OAuth/runtime cũ không là hiện trạng hay task mới. Giữ quyết định nghiệp vụ/UX còn hiệu lực, không di chuyển hoặc sửa spec/plan/hash đã duyệt.

Đây là checkpoint phát triển trong repository, không phải Saved Memory của ChatGPT hoặc bộ nhớ vận hành hồ sơ khách hàng. Trạng thái luôn đối chiếu [STATUS](05-IMPLEMENTATION-STATUS.md) và [handoff hiện hành CONNECT_FIRST](handoffs/2026-10-08-chatgpt-connect-first.md).

## CONNECT_FIRST — phạm vi hiện tại, 08/10

Owner giao tập trung kết nối ChatGPT thật cho actor SYSTEM liên kết tại Windows/WSL host. Đã đọc đầy đủ CONNECT_FIRST; prompt này ưu tiên phạm vi so với RECOVERY/MASTER. Không tiếp tục CAS/Task writes/runtime daemon/Graphify/plugin trừ trực tiếp chặn connection. Scope/member grant không chặn dynamic begin-auth hợp lệ; owner inference và serving nhân viên kiểm riêng, SYSTEM khác không mặc định dùng token owner. Không dùng credential/clientID/auth.json Codex, không API-key/fallback/fees/purchased credits.

S0 source trace: frontend Connect/Disconnect disabled literal, SettingsService canConnect:false/metadata cố định; chưa begin/callback/OAuth/credential/refresh/revoke/catalog HTTP/dispatcher, Project UI unified filter OpenRouter. Discovery OpenAI HTTP200 + official dynamic docs xác nhận route/client issued sau callback; chưa request authorize/token/models/responses/revoke hoặc refusal. Galaxy private/local owner pilot không giả OSS/personal, provider admission chưa xác nhận. Thay bước cũ “xác minh hồ sơ/grant/multiuser trước OAuth” bằng ba gate của [spec cụ thể](../superpowers/specs/2026-10-08-chatgpt-owner-connection-design.md).

VERIFIED_THIS_RUN: canonical đầu lượt HEAD07708c5 sạch, root figma/prompt giữ; product diff từ a5e82d8 rỗng. Fresh localhost/LAN/API health200/cùng local-a3eb571a7fcc. Chrome Windows154/Win32 tới API127.0.0.1:3001 được200; mới chỉ existing API loopback, callback14555 NOT_IMPLEMENTED/cổng trống. Galaxy /me/admin401→login, ảnh fresh là login; không coi ảnh admin trước thành acceptance mới. Existing codec/pause unit8/8 PASS1.32s; full1400/573/5/1/64 và Chrome8/8 là checkpoint trước, chưa mới OAuth. Evidence private `.runtime/connect-first-20261008/s0/`; các app/DB/data/provider config/public policy không bị mutation.

WRITTEN_SPEC_REVIEW_PENDING: spec local commit449435a, sửa thêm exact pending-registration/actor helper/no-paid-credit boundary và caller map trước review; user đã nhận câu hỏi review cụ thể theo AGENTS/Superpowers. Chưa product implementation/plan hoặc release mới. Chưa USER_AUTH_PENDING vì main/callback chưa ready. Sau approval thật: writing-plans + written plan review INLINE → TDD lifecycle/catalog/dispatcher/UI/375launcher → regression/reviews/artifact cutover → probe Windows callbackmain → owner tự auth/MFA → real model + Project completed + task_list loop/reload. L01–L20/S0–S4 hiện hành ở handoff. Member scope UNCONFIRMED riêng; chưa tool live nào.

## Nguồn và phạm vi

Owner yêu cầu đọc đủ RECOVERY → PROJECT_MEMORY → PLAN_ONLY_ADDENDUM → MASTER tại `/home/galaxy_os/prompt/`, rồi AGENTS/READ-FIRST/STATUS/handoff. RECOVERY ưu tiên thay đổi; nghiệp vụ master giữ nguyên. Ponytail full, Superpowers, một source writer và review độc lập. Commit/release local được duyệt; không push/tag/merge/public/tunnel. Không reset main, thay applied migration, bỏ user work hoặc lộ secret.

Canonical source: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`. Root `/home/galaxy_os` HEAD1a59665 và untracked figma/prompt giữ; root commands chuyển tới canonical runtime. Luôn chỉ định workdir để tránh sửa checkout cũ.

## Main đã xác minh

Release `local-a3eb571a7fcc`, immutable `/home/galaxy_os/.runtime/releases/recovery-tracker-registry-20261008-r1`; CODE_SHA=TESTED_SHA `a5e82d80129cc698860c501683b844b404c7f33b`, tree `3e04b19306cece71605018e419ee87caab221922`. API736608/Web736609 READY; schema86, Edge308598, storage/account/session giữ; public CLOSED. URLs http://localhost:3000 và http://192.168.1.80:3000. Menu Hệ thống → Kết nối ChatGPT `/settings/chatgpt-connection`.

Frontend/API admin cần system.settings.read/update từ assignment SYSTEM; không ghép scope SYSTEM của role khác với permission ngoài scope. Member chỉ dùng AI theo quyền Galaxy trong Project, không có key/config CTA. Owner SYSTEM main200; admin status local/check/reload và1440/375 screenshots thật đã có. P04 work/ai main mở/reload giữ phiên,9Project hiện hữu; ảnh riêng mới trong `.runtime/recovery-tracker-registry-20261008/main-browser/`. Admin registry12contract gồm3READ tool, tất cả DISABLED/CHATGPT_NOT_CONFIGURED. Overview/products/files1440/375 và AI selected5width đều không overflow,0API mutation, answer16/26/composer112px. Launcher nổi còn che một phần đoạn giải thích admin375; chưa sửa trong mốc READ. Member/revoke thật trên main chưa có phiên; chỉ fixture denial/revoke đạt.

## Vận hành và giới hạn kết nối

Codex0.161.0 CLI/daemon/app-server đồng nhất; doctor không fail; bare launch và valid saved resume đạt idle/exit0, không gọi model. Lỗi Codex mismatch NOT_REPRODUCED, không tuyên bố sửa nguyên nhân không quan sát.

Recovery cũ FAILED trước Reexecute, receipt giữ. Owner duyệt native packet mới+contingency; Reexecute một lần phục hồi private peer470. Cleanup ban đầu lỗi bus-client/private-peer khác protocol; native systemctl cleanup helper được review và chạy trong scope đã duyệt, đúng2runtimeunits/bus tạm đã xóa, không thêm Reexecute/signal/app restart. Không chạy lại hai script recovery. Root pnpm dev exit0 ALREADY_RUNNING_VERIFIED, app PID giữ. Historical auto-review rejection không bị bypass; lệnh dev được duyệt sau chứng minh READY/no-spawn.

Owner xác nhận “Chưa có hồ sơ chấp thuận”. SIWC NOT_CONFIGURED, inference NOT_GRANTED, provider multiuser scope UNCONFIRMED; Connect/Disconnect disabled. Check là LOCAL_CONFIGURATION_ONLY có audit, không OpenAI probe. Chưa có OAuth callback/store/refresh/revoke/catalog/dispatcher live. Bốn provider API key giữ PAUSED_BY_USER; CHATGPT_PLAN_ONLY chặn dispatch/fallback/fees. Không lấy Codex credentials hoặc coi admin Pro là quyền dùng chung. [Hồ sơ điều kiện cần xác minh](handoffs/2026-10-08-chatgpt-registration-eligibility.md).

## Mốc READ/registry đã phát hành

Owner duyệt READ task_list/get/history + registry từ schema tool; chưa Task writes/CAS/schema mới. Reuse TasksService/Task/Activity, actor/Project server-bound, assignment task.read, omit tài chính và dependency ngoài Project. List totals/statusCounts/contributor IDs cùng snapshot, trần1000,1001 bị chặn trước outbound. Saved source lưu đủ contributor IDs cả page rỗng/ngoài page để revoke chặn history/citation/continuation.9integration focused và review correctness/security/authorization/Ponytail đạt. Registry metadata LOCAL_IMPLEMENTED/DISABLED, không connector framework mới.

Full tracker regression trước bị fixture connection/PDF config lỗi; log giữ. Isolation guard chỉ thêm connection_limit1..5, duplicate/unknownparams vẫn chặn; RED/GREEN15test. Full pool3/Poppler/8CPU PASS API1400/Web573/Edge5/document1/runtime64 và lint/types/format. Hai phase egress giữ assertion, mỗi phase5s (không giữ tổng budget cũ); hai M2 timeout trong run2CPU đạt khi full8CPU, không thay tests. Exact immutable artifact đã build, Chrome8/8 PASS cùng artifact; digest API/Web/Edge/deps sau browser giữ nguyên. Candidate đã cutover đúng2owned app units; localhost/LAN và main admin metadata200 cùng release local-a3eb571a7fcc. Main không gọi Task tool qua model vì grant chưa có; READ roundtrip/ACL/revoke mới là integration mock, không gán thành vendor live. Rollback giữ r1 local-ce7fabf8ed1c và rollback-cutover0700. Fixture3process đã cleanup đúng ownership; Chrome/CDP/Edge giữ.

## Bước tiếp

1. Mốc READ/registry đã release và nghiệm thu main metadata/P04; mở lại STATUS/handoff/manifest để xác minh trước mốc kế. Giữ r1 rollback, không chạy recovery lịch sử.
2. CONNECT_FIRST thay bước cũ này: hoàn thiện route dynamic/begin-auth/callback theo spec duyệt; registration và owner grant là kết quả OAuth, scope phục vụ nhân viên gate riêng. Không yêu cầu partner dossier/issued client ID trước attempt động; chưa provider refusal. Hiện chờ written-spec review bắt buộc, không chờ hồ sơ chấp thuận.
3. Thiết kế/duyệt mốc Task write/source/idempotency/CAS riêng, durable crash resume; giữ một domain và12giai đoạn. Task hiện chưa canonical accountable owner/group/stage/blocker/result, không bịa mapping từ5stage cũ.
4. Main đã GET/download4file PDF/DOCX/XLSX/PNG hiện hữu và tải lại sau reload,200/SHA/kích thước giữ/session200/0mutation; chỉ binary transport, chưa parser/render hoặc export mới. Tiếp tục main file/export mới trong hồ sơ được phép; local parser/export tests không chứng minh model vision/OCR/main execution. DOCX/PDF/XLSX bytes/lineage/ACL đã có code; XLSX cached không recalculated. Missing binary baseline không được thay bằng file giả.

## Điểm tiếp chưa duyệt

08/10 11:28: main owner rooms của9Project đều200 nhưng0accessible room; selected human/read-only main chưa có dữ liệu, không tự tạo. Mốc CAS bounded đã gửi trong chat, USER_APPROVAL_PENDING: expectedVersion nguyên dương/409, conditional authorized write và atomic audit/assignment/notification, concurrency/rollback PostgreSQL. Callers không gửi version vẫn gọi được; đây chỉ foundation generic update, chưa Task tool writes/source idempotency hoặc fulltracker. Chưa product code; chờ câu trả lời thật, không coi elapsed time là duyệt. Khi có approval thì ghi nhận và tiếp tục theo AGENTS/Superpowers, không xin lại quyền local release/UI đã có.

E02-r22: kiến trúc AI/checkpoint hiện hành tại /home/galaxy_os/prompt/README.md và GALAXY_AI_PLAN_AND_CHECKPOINT.md; owner đã duyệt toàn scope chức năng E02 và defer UI redesign. Main R2 Office live còn FAIL, source E02-3 mới đang verify; không suy PASS từ docs/lịch sử.
