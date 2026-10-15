# Kế hoạch triển khai UI PDF và kích hoạt AI

> Thực thi task bằng superpowers:executing-plans, inline; TDD và review cuối độc lập.

**Goal:** Đưa S01 và workspace Project theo PDF lên localhost3000, kích hoạt từng AI có bằng chứng.
**Architecture:** Dùng các read/write service và domain hiện hữu. Một khung UI chung; giữ private conversation/source/ACL. Không migration dự kiến.
**Tech Stack:** Next16/React19/Tailwind3, NestJS/Prisma6, Node fetch, Python CLI, Vitest/Playwright/Chrome.
**Spec:** [DESIGN](DESIGN.md), chỉ đạo đầy đủ của chủ dự án trong phiên04/10.

## Ràng buộc chung

Tiếng Việt; SYNTHETIC_PUBLIC_APPROVED; không quota ngày mới; không secret vào output/Git.
Một source writer, một controller browser/service. Baseline962c79a giữ mọi thay đổi hợp lệ.
Không public/push/merge/reset. Commit local chỉ file đúng scope đã review.

## Review focus

- Thiếu quyền tài chính phải không có payload tiền; lọc scope trước aggregate.
- Back/forward/đổi Project/actor khi fetch chậm không giữ dữ liệu cũ hoặc sai context.
- Dropdown đổi khi retry không đổi request đã chốt hoặc nhân answer.
- Provider ready nhưng nguồn bị cấm phải báo policy; quản trị test không nới egress.
- Nguồn thiếu binary/version/revoke không trả answer hoặc preview giả.

### Task 1: F00/S01

Files: portal-shell.tsx, globals.css, app/page.tsx; dashboard.controller/test.
Consumes: /me và permission policy. Produces: dashboard snapshot có asOf, scope và tiền theo currency; khung dùng chung.

- [x] Characterization Web; RED regression payload thiếu quyền/currency và drilldown.
- [x] Code shell/sidebar/mobile và S01 KPI/priority/health/operation; giữ menu hiện hữu.
- [x] Targeted Vitest API/Web, Chrome1440/375, review diff, ghi checkpoint.

### Task 2: P01/P02/P03

Files: projects/page.tsx, projects controller/service; project workspace header và overview route.
Consumes: Task1 styles, projects/list/dashboard/workspace-summary/tasks/timeline. Produces: cùng Project ID, URL lọc/sort/page và bốn tab.

- [x] RED lọc/sort/scope/giữ ID và empty không suy cam kết từphase.
- [x] Code danh sách, giữ form tạo/xóa, overview read view trên domain hiện hữu.
- [x] Targeted tests và Chrome navigation/Back/Forward; review/checkpoint.

### Task 3: P04/AI01

Files: project-chat.tsx, project-ai.tsx và tests; AI route dùng cùng component.
Consumes: Task2 header; existing chat/AI contracts. Produces: chat3cột, panel private, scope/context và model selector không mất hội thoại.

- [x] RED scope/panel/state refresh; giữ characterization send/retry/lock/revoke.
- [x] Code room search/nhóm/pinned task, AI collapse/fullscreen/suggestions/draft và nguồn.
- [x] M2/M3 targeted và Chrome desktop/mobile, review/checkpoint.

### Task 4: P05/P06

Files: products/page/detail, files/page, EntityFiles; bổ sung read projection hiện hữu khi cần.
Consumes: Task2 header và Task3 AI context. Produces: hạng mục/file/version có liên kết cùng IDs.

- [x] RED filter/sort/pagination/race, binary/source/version và permission.
- [x] Code table/detail/file source, giữ uploader và writes có quyền.
- [x] Targeted tests/Chrome preview/history/missing binary; review/checkpoint.

### Task 5: Kích hoạt AI

Files: ai-registry/provider/service/controller, configure-ai.py và tests khi cần.
Consumes: CLI secret hiện hữu, model contracts chính thức và Task3 UI. Produces: metadata/config/reason chính xác, admin synthetic test và capability evidence.

- [x] RED phân loại lỗi, admin first test, config race và policy.
- [x] Code phần thiếu; kiểm đường secret → API → registry → UI không lộ secret.
- [ ] Khi có khóa: live tiếng Việt/nguồn fixture/multi-turn/model switch/citation; Gemini ảnh/PDF riêng. Thiếu khóa chỉ block live tương ứng.

### Task 6: Hồi quy, review, release

Files: docs hiện hữu, release artifacts/metadata ngoài Git.
Consumes: Tasks1–5. Produces: local release mới và handoff có evidence thật.

- [x] Full lint/typecheck/test/build/format, Python runtime/CLI, Chrome/M2/M3 phù hợp source.
- [x] Reviewer độc lập Astra/high read-only: correctness/security/authorization/egress/UX; Ponytail diff review. Sửa finding bằng RED→GREEN.
- [x] Commit local scope; build snapshot riêng, schema/artifact/readiness; cutover recipe systemd hiện hữu, rollback giữ dữ liệu.
- [x] Kiểm localhost/LAN/session/Edge closed/logs; cập nhật STATUS/PROJECT_STATUS/VERIFICATION/HANDOFF, commit docs.

Kế hoạch đã tự review: Tasks2–4 cùng header và IDs; Task5 dùng registry/adapter, không tạo provider thứ hai.
Chrome MCP hiện không tìm executable Windows trong sandbox; kiểm đường CDP/Chrome đã có trước khi chọn fallback.

Checkpoint trước phát hành: API1272/Web557/Edge5/document1, Python37 PASS; lint/typecheck/format/build PASS. Chrome28 đã đạt theo nhóm cùng build: M2 21, M3 3, PDF 4; giữ room-only breadcrumb, URL room/Back/Forward và mobile. P02 tạo thật trong fixture cần cả project.create và estimate.create. Live provider chưa chạy vì store không có credential.

Phát hành: code/tested de274d3, tree030849c; local-49bd3faf2e63 READY. Hậu kiểm Chrome chính/Windows LAN/public503/session/log follower PASS. Chỉ live provider còn blocked; [handoff](HANDOFF.md) là điểm tiếp tục.
