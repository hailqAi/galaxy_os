# Bộ nhớ phát triển Galaxy OS — 08/10/2026

Đây là checkpoint phát triển trong repository, không phải Saved Memory của ChatGPT hoặc bộ nhớ vận hành hồ sơ khách hàng. Trạng thái luôn đối chiếu [STATUS](05-IMPLEMENTATION-STATUS.md) và [handoff hiện hành](handoffs/2026-10-08-recovery-ui-admin-maintenance.md).

## Nguồn và phạm vi

Owner yêu cầu đọc đủ RECOVERY → PROJECT_MEMORY → PLAN_ONLY_ADDENDUM → MASTER tại `/home/galaxy_os/prompt/`, rồi AGENTS/READ-FIRST/STATUS/handoff. RECOVERY ưu tiên thay đổi; nghiệp vụ master giữ nguyên. Ponytail full, Superpowers, một source writer và review độc lập. Commit/release local được duyệt; không push/tag/merge/public/tunnel. Không reset main, thay applied migration, bỏ user work hoặc lộ secret.

Canonical source: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`. Root `/home/galaxy_os` HEAD1a59665 và untracked figma/prompt giữ; root commands chuyển tới canonical runtime. Luôn chỉ định workdir để tránh sửa checkout cũ.

## Main đã xác minh

Release `local-ce7fabf8ed1c`, immutable `/home/galaxy_os/.runtime/releases/recovery-ui-admin-20261008-r1`; CODE_SHA=TESTED_SHA `f2bdd2549a4d0b449a73e86b043d7f9007ef8d77`, tree `7dd89945e555e8e34fefd8f94fb1211bade997ea`. API722051/Web722052 READY; schema86, Edge308598, storage/account/session giữ; public CLOSED. URLs http://localhost:3000 và http://192.168.1.80:3000. Menu Hệ thống → Kết nối ChatGPT `/settings/chatgpt-connection`.

Frontend/API admin cần system.settings.read/update từ assignment SYSTEM; không ghép scope SYSTEM của role khác với permission ngoài scope. Member chỉ dùng AI theo quyền Galaxy trong Project, không có key/config CTA. Owner SYSTEM main200; admin status local/check/reload và1440/375 screenshots thật đã có. P04 work/ai main mở/reload giữ phiên,9Project hiện hữu; ảnh riêng trong `.runtime/recovery-ui-admin-20261008/main-browser/`. Member/revoke thật trên main chưa có phiên; chỉ fixture denial/revoke đạt.

## Vận hành và giới hạn kết nối

Codex0.161.0 CLI/daemon/app-server đồng nhất; doctor không fail; bare launch và valid saved resume đạt idle/exit0, không gọi model. Lỗi Codex mismatch NOT_REPRODUCED, không tuyên bố sửa nguyên nhân không quan sát.

Recovery cũ FAILED trước Reexecute, receipt giữ. Owner duyệt native packet mới+contingency; Reexecute một lần phục hồi private peer470. Cleanup ban đầu lỗi bus-client/private-peer khác protocol; native systemctl cleanup helper được review và chạy trong scope đã duyệt, đúng2runtimeunits/bus tạm đã xóa, không thêm Reexecute/signal/app restart. Không chạy lại hai script recovery. Root pnpm dev exit0 ALREADY_RUNNING_VERIFIED, app PID giữ. Historical auto-review rejection không bị bypass; lệnh dev được duyệt sau chứng minh READY/no-spawn.

SIWC NOT_CONFIGURED, inference NOT_GRANTED, provider multiuser scope UNCONFIRMED; Connect/Disconnect disabled. Check là LOCAL_CONFIGURATION_ONLY có audit, không OpenAI probe. Chưa có OAuth callback/store/refresh/revoke/catalog/dispatcher live. Bốn provider API key giữ PAUSED_BY_USER; CHATGPT_PLAN_ONLY chặn dispatch/fallback/fees. Không lấy Codex credentials hoặc coi admin Pro là quyền dùng chung. [Hồ sơ điều kiện cần xác minh](handoffs/2026-10-08-chatgpt-registration-eligibility.md).

## Mốc độc lập đang triển khai

Owner duyệt READ task_list/get/history + registry từ schema tool; chưa Task writes/CAS/schema mới. Reuse TasksService/Task/Activity, actor/Project server-bound, assignment task.read, omit tài chính và dependency ngoài Project. List totals/statusCounts/contributor IDs cùng snapshot, trần1000,1001 bị chặn trước outbound. Saved source lưu đủ contributor IDs cả page rỗng/ngoài page để revoke chặn history/citation/continuation.9integration focused và review correctness/security/authorization/Ponytail đạt. Registry metadata LOCAL_IMPLEMENTED/DISABLED, không connector framework mới.

Full tracker regression trước bị fixture connection/PDF config lỗi; log giữ. Isolation guard chỉ thêm connection_limit1..5, duplicate/unknownparams vẫn chặn; RED/GREEN15test. Full pool3/Poppler/8CPU PASS API1400/Web573/Edge5/document1/runtime64 và lint/types/format. Hai phase egress giữ assertion, mỗi phase5s (không giữ tổng budget cũ); hai M2 timeout trong run2CPU đạt khi full8CPU, không thay tests. Main r1 chưa chứa tracker/registry mới; không gán focused/fixture PASS thành main/live.

## Bước tiếp

1. Hoàn tất full checks, build exact candidate2, fixture Chrome admin registry/ACL/P04 rồi release đúng2app và nghiệm thu main mới; giữ r1 rollback.
2. Xác minh registration/grant/phạm vi nhiều người với OpenAI trước OAuth/inference; chưa gửi form hoặc mở kết nối.
3. Thiết kế/duyệt mốc Task write/source/idempotency/CAS riêng, durable crash resume; giữ một domain và12giai đoạn. Task hiện chưa canonical accountable owner/group/stage/blocker/result, không bịa mapping từ5stage cũ.
4. Kiểm main file/export/download/reload trong hồ sơ được phép; local parser/export tests không chứng minh model vision/OCR/main execution. DOCX/PDF/XLSX bytes/lineage/ACL đã có code; XLSX cached không recalculated. Missing binary baseline không được thay bằng file giả.
