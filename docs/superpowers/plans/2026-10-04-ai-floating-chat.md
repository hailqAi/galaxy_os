# Popup AI và typography — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: dùng superpowers:executing-plans INLINE theo lựa chọn chủ dự án; TDD mỗi task, một review độc lập cuối.

**Goal:** Hỏi AI toàn Project mở popup, giữ thread/nháp/request qua presentation, cải thiện chữ và kích hoạt provider có key qua ứng dụng.
**Architecture:** Một owner ở PortalShell giữ ProjectAi theo actor/Project/scope/context; React portal chỉ chuyển presentation, controller không remount. Context list lấy từ request metadata hiện hữu; không migration hoặc bộ nhớ thứ hai.
**Tech Stack:** Next16/React19/CSS container queries, NestJS/Prisma, Vitest/Playwright, CLI Python và release tooling sẵn có.
**Spec:** [Handoff — quyết định chủ dự án](../../galaxy-os/milestones/M3/ui-figma/HANDOFF.md), prompt duyệt hiện tại và DESIGN hiện hữu.

## Global Constraints

- Tiếng Việt; popup560px, expanded1100px/content760px, chat16/26, composer16/24–26 cao112px→200px.
- Non-modal desktop; mobile sheet dynamic viewport/safe area; native dialog khi khóa nền.
- Nháp RAM actor/Project/conversation; không storage nháp, provider mới/dependency/migration.
- Giữ backend ACL/revoke/egress/SYNTHETIC_PUBLIC_APPROVED; không dữ liệu9Project thật gửi vendor.
- Root là source writer, Chrome/service controller duy nhất; reviewer cuối chỉ đọc.
- Commit local đúng scope; không push/merge/public; build artifact riêng và rollback code giữ dữ liệu.

## Review Focus

- Response A tới sau khi đổi Project/actor: không render hoặc ghi URL của B.
- Chuyển panel/page trong lúc gửi hoặc đọc nguồn: giữ request key/thread và scroll, không nhân polling.
- Hai scope giống group nhưng khác room/file/version: list và history không chọn nhầm thread.
- Keyboard IME/Escape/source dialog và mobile keyboard: không gửi ngoài ý muốn, không mất focus/composer.
- Vendor có key nhưng disabled/quota/policy: trạng thái đúng, không tự fallback hoặc bật media chưa kiểm.

### Task 1: T2 — context và owner/presentation

**Files:** API project-ai.service.ts + test/m3-project-ai.integration.test.ts; Web project-ai-context.ts/test, project-ai-surfaces.tsx; project-ai.tsx; portal-shell/layout; ProjectWorkspaceHeader; project-chat/project-ai-workspace; products/EntityFiles entrypoints; browser m3-ai-floating.spec.ts.
**Interfaces:** AiContext hiện hữu; aiSessionKey(projectId,scope,context); owner open(scope/context), mount(spec,target); ProjectAi nhận portalTarget/active/presentation callbacks, giữ hooks/request keys. List API trả context từ answer đầu tiên, không thêm model/schema.

- [ ] RED: context key phân biệt Project/room/fileversion; API list context được pin; browser header mở popup không đổi URL, cùng launcher, dock↔float↔page giữ thread/nháp và chỉ một send.
- [ ] Chạy targeted Vitest/API integration và Chrome test mới; Expected: assertions đỏ do chưa có behavior.
- [ ] Code owner + React portal cho phần view; scope/history filter đúng; mọi URL update kiểm Project/page hiện hành; actor/logout/revoke clear.
- [ ] Chạy targeted unit/API/browser. Expected: PASS, một controller mỗi session; checkpoint và commit local.

### Task 2: T3 — typography, composer, responsive và nguồn

**Files:** globals.css; project-ai.tsx, project-chat.tsx; chat-text.tsx/test, chat-composer-input.tsx/test; source-drawer.tsx + EntityFiles; browser m3-ai-floating.spec.ts.
**Interfaces:** dùng owner Task1; textarea value/onChange/onSend với composition guard; source drawer dùng native dialog; renderer chỉ React escaped nodes, không raw HTML/fetch URL.

- [ ] RED: computed16/26, textarea16px cao112px→200px, IME không gửi, Shift+Enter newline; source close/scroll anchor; viewport không tràn.
- [ ] Code CSS scoped tokens và container breakpoint:220–240 + min520 +380–420; thu danh sách trước/AI overlay khi thiếu chỗ. Popup560/max760h; expanded1100/content760; mobile dynamic/safe area.
- [ ] Composer ghim, nguồn picker/chips từ index được phép, Enter/Shift+Enter, nút44px, scroll mới không giật; render paragraph/list/table/code an toàn.
- [ ] Targeted unit + Chrome1366×768/1440×900/1920×1080/390×844, zoom200%, visual viewport keyboard và focus/Escape. Expected: PASS; checkpoint/commit.

### Task 3: T4 — activation provider đủ điều kiện

**Files:** không dự kiến source; ACTIVATION/evidence riêng, canonical store qua configure-ai.py hiện hữu.
**Interfaces:** CLI status/key/enable; API settings/test synthetic, config revision và capability evidence.

- [ ] Kiểm một lần metadata3provider/API. Nếu thiếu: WAITING_FOR_LOCAL_SECRET_INPUT, hướng dẫn input ẩn một lần, tiếp tục UI.
- [ ] Có key mới: bật từng provider bằng enable đã xác minh; kiểm API nhận revision, admin synthetic text test qua Chrome hiện hành, không bypass gate.
- [ ] Live Việt/text nguồn/câu nối tiếp qua ứng dụng; provider độc lập, giữ request/model/status/usage/citation evidence an toàn. Chỉ fixture được duyệt, không chín Project thật.
- [ ] Ghi PASS hoặc lỗi vendor cụ thể; không retry loop/fallback/mua credit; image/PDF giữ tắt nếu chưa có live test riêng.

### Task 4: T5 — hồi quy, review, release và bàn giao

**Files:** docs hiện hữu; artifacts/env/recipe ngoài Git.
**Interfaces:** Tasks1–3; pipeline prepare-local-release.py + recipe cutover sửa lock/rollback đã kiểm ở T1.

- [ ] Full lint/typecheck/API/Web/Edge/document/Python/build/format; Chrome AI/pages và popup matrix. Expected: PASS hoặc blocker thật được ghi.
- [ ] Fresh Astra/high review toàn diff: correctness/security/auth/isolation/UX/Ponytail; sửa Important/Critical bằng RED→GREEN rồi suite.
- [ ] Commit local scope, build snapshot sạch riêng, verify artifact, stage env chỉ đổi release marker và giữ store; cutover đúng Web/API, giữ Edge/keeper.
- [ ] Chrome localhost3000, LAN/public gate/session và store/revision sau cutover; docs hiện hữu và STATUS/handoff cập nhật kết quả thật; commit docs riêng.

Kế hoạch đã tự review: Task2 chỉ dùng owner/context Task1; Task3 dùng3adapter đã có,
không phụ thuộc UI để lấy credential. Task4 dùng cùng artifact/codeSHA đã kiểm.
Chủ dự án đã chỉ định INLINE và chỉ hỏi ngoài phạm vi; không thêm vòng xác nhận plan.
