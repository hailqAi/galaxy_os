# Runtime, P04 và quản trị ChatGPT — kế hoạch tiếp tục

> **For agentic workers:** Use superpowers:executing-plans. Một người ghi source, một review độc lập cuối.

**Goal:** Phát hành P04 và Hệ thống → Kết nối ChatGPT trên localhost/LAN, bảo toàn nghiệp vụ và provider pause.

**Architecture:** Mở rộng Settings/IAM, navigation và ProjectAi hiện hữu. Không thêm engine, role, credential store hoặc registration giả. UI trạng thái độc lập với grant SIWC.

**Tech Stack:** Next.js/NestJS/Prisma và immutable local release hiện hữu.

**Spec:** `/home/galaxy_os/prompt/GALAXY_OS_RECOVERY_UI_ADMIN_CHATGPT_PROMPT_2026-10-08.txt`, rồi MEMORY/addendum/master cùng ngày theo thứ tự owner. Thiết kế trang `/settings/chatgpt-connection` đã được owner duyệt trong phiên: “Duyệt, triển khai ngay”. Thực thi INLINE theo yêu cầu hiện tại.

## Global constraints

- Chỉ SYSTEM + system.settings.read/update quản lý kết nối; guard nạp lại assignment từ DB mỗi request.
- Nhân viên không có CTA cấu hình; giữ Project/draft/history/ACL hiện hữu.
- ELIGIBILITY_UNCONFIRMED, grant/multiuser scope chưa xác minh: không inference/OAuth giả, không checkbox bật organization use.
- API-key providers PAUSED_BY_USER, không fallback/fees/public source/tunnel/reset.
- Phục hồi user manager là bước phê duyệt riêng; không tạo bus hay restart manager trước approval.
- Commit local được owner cho phép; không push/merge/tag.

## Review focus

1. Có system.settings.read nhưng scope ORGANIZATION/DEPARTMENT: menu/URL/API vẫn chặn.
2. Assignment bị revoke trong session: request tiếp theo không đọc/ghi metadata quản trị.
3. Grant/config chưa tồn tại: catalog rỗng, hành động kết nối disabled, checkedAt là kiểm local, không giả vendor live.
4. Lỗi load hoặc request muộn: giữ dữ liệu nháp Project; trang admin không lộ secrets.
5. Build/fixture PASS không thay release/main acceptance; bus vẫn lỗi thì ghi BLOCKED.

## Tasks

### Task 1: Chẩn đoán và gate vận hành

- [x] Xác minh linked worktree sạch HEAD14be03c, giữ root figma/prompt; đọc đầy đủ4prompt và handoff/maintenance.
- [x] INSPECT_ONLY host: manager470, API643395/Web643396, Edge308598, bus absent; pnpm dev exit1.
- [x] Bare Codex0.161.0 khởi động được, doctor/daemon versions đồng nhất; không restart hoặc đổi feature.
- [x] Resume phiên đã lưu 01a10f75 không gọi model, profile Astra high giữ; lưu evidence nhận diện host/daemon/control plane.
- [x] Rà recovery script/default inspect và rollback; chỉ trình thao tác cụ thể sau khi candidate/admin UI hoàn tất.

### Task 2: Trang quản trị và UX Project

**Files:** `apps/api/src/access-control/development-auth.guard.ts`, `apps/api/src/settings/settings.{controller,service}.ts`, `apps/api/test/sprint1.integration.test.ts`, `apps/web/app/portal-navigation{.test}.ts`, `apps/web/proxy{.test}.ts`, `apps/web/app/settings/chatgpt-connection/page.tsx`, `apps/web/features/project-chat/project-ai{.test}.tsx`, browser acceptance.

**Interfaces:** GET/POST `/system/settings/chatgpt-connection` trả metadata local đã che secret; đọc cần system.settings.read, kiểm tra cần system.settings.update, cả hai cần SYSTEM. Không nhận token hoặc scope từ request body. Không ghi setting có thể tự cấp provider entitlement.

- [x] RED: menu chỉ SYSTEM; member Project không CTA; API admin/member/stale session thực qua DB fixture.
- [x] GREEN: tái dùng SettingsService.systemOnly, trả status/identity/grant/scope/catalog/missing requirements/checkedAt và release metadata thật; POST kiểm local có audit.
- [x] GREEN: trang status luôn render với actor hợp lệ; buttons chưa khả dụng có lý do; Project thông báo ngắn, không metadata admin.
- [ ] Focused API/Web + browser fixture; full lint/types/tests/build/format một lần sau diff ổn định.

### Task 3: Candidate và release

- [ ] Build snapshot mới, đối soát tested tree/digests/config/pause/schema86; stage hai unit từ artifact bằng validator XDG riêng, rollback/data không đổi.
- [ ] Khi recovery được duyệt và đạt: cutover qua mechanism hiện hữu; kiểm localhost/LAN/API/Web release khớp.
- [ ] Main Chrome admin/member và năm P04, screenshot theo state/viewport/release; không gắn fixture thành main.
- [ ] Review độc lập correctness/security/auth/UX và Ponytail; sửa finding bằng RED→GREEN.

### Task 4: Backlog và bộ nhớ

- [ ] Kiểm delta tracker/memory/document/export/resume/registry trong plan trước; triển khai từng mốc độc lập qua thiết kế/TDD, không trì hoãn UI main đủ điều kiện.
- [ ] Cập nhật PROJECT_MEMORY, STATUS, PROJECT_STATUS, handoff và R01–R28 với evidence thật; nguồn thiếu ghi đúng blocker và bước tiếp.

## Ledger

2026-10-08: owner duyệt thiết kế trang quản trị và yêu cầu triển khai ngay. Plan bổ sung delta quản trị; kế hoạch cũ giữ nguyên lịch sử. Baseline HEAD14be03c/codee9a15df; main vẫn local-a0429faf5733. Không có recovery/cutover mutation.

2026-10-08: Review độc lập phát hiện ghép permission SYSTEM từ role ngoài scope. RED real-session200 thay403; sửa effective permissions ở guard chung để system.\* chỉ đến từ assignmentSYSTEM, /me/nav/proxy/canCheck đồng nhất. Full regression với Poppler hiện hữu đạt API1388/Web573/Edge5/document1;64Python PASS. Lượt thiếu Poppler thất bại không tính PASS. Bare/resume Codex0.161.0 đạt idle/exit0, không model turn; lỗi mismatch NOT_REPRODUCED. Build cần biến production bắt buộc, không nới validator.
