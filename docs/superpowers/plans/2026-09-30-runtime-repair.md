# Galaxy local runtime repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bản nội bộ localhost/LAN chạy độc lập Codex, mở đúng workspace cùng Project và giữ dữ liệu; chuẩn bị domain sau nghiệm thu.

**Architecture:** Một owner systemd cho từng Web/API/Edge, artifact riêng khỏi source. Giữ LAN3000 và đường Node TLS Edge hiện có, exact HTTP origins theo yêu cầu chủ dự án; không bật public trước gate nội bộ.

**Tech Stack:** Next16.2.10, NestJS, Node20.20.2 ở WSL (Node22 riêng của bridge Windows), Python stdlib, systemd249, Windows PowerShell/Task Scheduler; không dependency mới.

**Spec:** [Điều tra, thiết kế và owner correction](../../galaxy-os/handoffs/2026-09-30-runtime-repair.md).

## Global Constraints

- Cùng DB galaxy_os/schema83/storage/session; không migrate/seed/reset/restore dữ liệu.
- Local `http://localhost:3000`, LAN `http://192.168.1.80:3000` dùng trực tiếp.
- Domain `https://os.galaxycentre.vn` chỉ public sau ổn định; không đổi DNS/router chưa được duyệt.
- Một source writer Sol; Astra review và controller service/network; parent controller Chrome/docs/verification.
- TDD, focused/full relevant checks, Ponytail/correctness/security/auth/UX review; chỉ commit local file đã review.
- M3/provider/Figma và business stages không thuộc phạm vi sửa; giữ rollback artifacts.

## Review Focus

- Service active nhưng sai release/config hoặc API/DB chết: không READY giả.
- LAN giả Host/forwarded headers: không vượt qua ranh giới Edge hoặc sửa IP auth.
- HTTP cookie xử lý login/logout đúng host; HTTPS không mất Secure/HttpOnly/CSRF.
- Up/stop/log-follow từ hai shell hoặc parent thoát: chỉ systemd sở hữu app.
- Mạng lỗi/thiếu capability: giữ nháp và báo lỗi thật, không thành công giả hoặc tự về legacy.

### Task 1: Navigation và chẩn đoán HTTP thật

Files: `apps/web/app/projects/page.tsx`, `apps/web/app/projects/[projectId]/page.tsx`,
`apps/web/app/health/route.ts`, `apps/api/src/health.controller.ts`, tests tương ứng.

- [x] RED: entry links không hardcode stage-1; root route M2 bật→work, tắt giữ hành vi cũ; deep link nghiệp vụ vẫn tồn tại.
- [x] RED: health mỗi request có requestId khác, instance ổn trong execution context (Next middleware/BFF có thể khác trong cùng PID), release marker từ cấu hình đã kiểm; no-store và log tương ứng; không private config.
- [x] GREEN: sửa đúng entry callers, không xóa nghiệp vụ; dùng endpoint health/ready hiện có.
- [x] Kiểm fixture offline/capability hiện hữu; chỉ sửa khi test tái hiện thất bại.

### Task 2: Host/Origin/cookie cho bản nội bộ production build

Files: `apps/web/host-config.ts`, `apps/web/proxy.ts`,
`apps/web/app/api/v1/[...path]/route.ts`, `apps/api/src/auth/auth.controller.ts`,
`apps/edge/src/edge.ts`, tests tương ứng.

- [x] RED: exact local HTTP origins được đọc/ghi đúng origin; host/port lạ, cross-origin và forwarded mismatch bị từ chối.
- [x] RED: public HTTPS cần Edge proof; header giả/thiếu bị từ chối; Edge overwrite cả HTTP upgrade và proxy headers.
- [x] GREEN: secret ngoài artifact/Git, server-only; local branch không tin client forwarded IP; giữ BFF same-origin.
- [x] RED/GREEN: Secure cookie API theo HTTPS public origin; BFF chỉ bỏ Secure của exact session cookie ở HTTP origins đã cho phép; HTTPS/logout giữ thuộc tính đúng.
- [x] API compiled local-main giữ guard an toàn hiện có nếu production env thiếu mail; không giả SMTP hoặc nới quyền.

### Task 3: Systemd là owner duy nhất

Files: `scripts/local-runtime.py`, `scripts/test_local_runtime.py`, `package.json`,
`infra/systemd/galaxy-os-{api,web}.service.example`, `infra/systemd/galaxy-os.target.example`.

- [x] RED: unit mode cần ActiveState/MainPID/cgroup khớp listener và manifest; stale state không READY.
- [x] RED: double-start giữ một owner; stop chỉ exact units, log-follow Ctrl+C không dừng app.
- [x] GREEN: thêm explicit systemdUnit mode, giữ fingerprint/schema/identity preflight. Không directspawn trong service mode.
- [x] Unit foreground artifact Node, bounded restart/backoff, PartOf target, control-group; DB readiness thật; không Compose/migrate mỗi restart.
- [x] `local:logs` dùng journal; root entry passthrough giữ runtime manifest cùng repo.

### Task 4: Release và cài đặt có kiểm soát

Files: recipe tối thiểu dưới `scripts/` theo entry hiện có, manifest/runtime private ngoài Git.

- [x] Dùng Next standalone hoặc build/start đã kiểm với artifact/dependencies riêng; không build lên live .next.
- [x] Ghi SHA/build/digest/schema compatibility; env/storage/keys không vào artifact. Test fixture tách main.
- [x] Chuẩn bị user units, Windows task đúng owner/distro, một keeper hữu hạn restart; refresh đúng ba portproxy bằng IP interface đã xác minh.
- [x] Chuẩn bị native Windows observer chỉ HTTP, không wsl.exe polling. Log request/release/instance, không cookie/credentials.
- [x] Review installer+rollback trước một thao tác sudo/UAC cần người dùng; không thay Windows login policy/reboot/logoff.
- [x] Smoke candidate, dừng đúng identity cũ, chuyển manifest/start systemd, kiểm lại; rollback giữ DB/schema và session.

### Task 5: Acceptance và bàn giao

- [x] Focused tests, full relevant package regression, lint/typecheck/build/format; không lặp campaign M2/migration/clock.
- [x] Windows HTTP localhost/LAN, Chrome Network cache/remote address và Project/work theo phiên hiện hữu. Main không có ChatRoom trong9Project; chat/file mutation chỉ fixture.
- [x] Test fixture auth/capability/offline; không mutation tài khoản người dùng.
- [x] Shell/test-stop survival tự động; observer Windows đã chạy và mẫu đầu đúng.
- [ ] DEFERRED_BY_USER: người dùng sẽ đóng Codex sau; khởi chạy lại native observer trước thử, rồi đọc log/journal sau resume.
- [x] LAN khác/login→Làm việc USER_VERIFIED; public domain DEFERRED_BY_OWNER. DNS/WAN discrepancy cần giải quyết đúng quyền trước public.
- [x] Ponytail/correctness/security/auth/UX review; CODE commit local exact files `264a195`.
- [x] Cập nhật STATUS/PROJECT_STATUS/handoff theo maintenance/browser main và checkpoint trước đóng Codex; docs commit local riêng.

### Task 6: Chẩn đoán đúng bản đang phục vụ

- [x] RED: `status` trả PARTIAL nhưng exit0; `prod:health` chỉ kiểm liveness; verifier đọc source build thay artifact được chọn và bỏ sót bundle thiếu/rò cấu hình.
- [x] Dùng chung controller/manifest; status không READY phải exit khác0, verifier kiểm đúng bundle và truyền lỗi.
- [x] CLI8/8, runtime30/30, release3/3; shell callers root/canonical và hai lệnh chẩn đoán chỉ đọc trên main đều đạt (4/4).
- [x] Review Ponytail/correctness/security đã chốt; tooling commit92df5d3, root adapters1a59665. Giữ app artifact264a195 nguyên trạng; không rebuild để thay metadata.
