# SIWC live và domain — 08/10/2026

Owner đã kết nối ChatGPT chính thức trên MAIN; chat Project và `task_list` chỉ đọc đã chạy thật. Runtime đã phát hành `local-bf73047fa0ee`, phục vụ localhost/LAN/HTTPS cùng artifact. Người dùng xác nhận truy cập domain từ mạng ngoài LAN hoạt động. **Còn nghiệm thu chat và login/logout qua HTTPS bằng phiên Galaxy trên domain; Chrome CDP hiện ở trang login, `/me`401.** Không yêu cầu kết nối ChatGPT lại.

Phạm vi được user duyệt là owner pilot, domain cũ và Task chỉ đọc. Không commit/push/PR, không reset/clean/stash, không migration/schema change, không đổi quyền để làm test xanh, không mở API-key provider hay nhân viên dùng chung. Tài liệu này thay checkpoint đang chờ clock/OAuth trước đó; bản checkpoint giữ trong evidence `handoff-before-final.md`.

## Source và artifact

- Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`.
- CODE_SHA commit nền `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` + thay đổi chưa commit. Không có TESTED_SHA commit mới.
- TESTED_TREE `c7590f6cdd97d2b5b8c75f8331069301629b1bc4`.
- Source snapshot SHA256 `bf73047fa0eec2ce787c5406d8e8b3cf27acd64b721c7e52fd5bd4a01f66b021`.
- Archive SHA256 `5802590b6144925f48f56d022879456cdda781a73d0d19bc0c4737bb6b6e4d1e`.
- Deployed artifact `/home/galaxy_os/.runtime/releases/siwc-stream-items-20261008-r4`, release `local-bf73047fa0ee`, Web build `Pvj1ciiD8AMIbC9YJQJu7`.
- Edge giữ `local-f93ef7df2fbc`. Main API/Web chạy systemd, production bundle; API loopback3001, Web3000. Dev auth false, ChatGPT plan only, bốn API-key provider paused.
- Snapshot/tested tree được đóng trước cập nhật tài liệu này; ba file code cuối không đổi sau snapshot. Không gọi snapshot digest là commit SHA.

Evidence dưới đây tương đối với `/home/galaxy_os/.runtime/siwc-live-20261008/`; thư mục private0700, credential/backup0600. Không đưa token/code/key/cookie vào tài liệu.

## Nghiệm thu hiện tại

| Mục              | Trạng thái | Bằng chứng và giới hạn                                                                                                                                                                 |
| ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLOCK            | PASS       | `clock/single-owner-confirmation/summary.json`:659,988 giây RAW, Windows/WSL/DB không bước lùi, gồm idle và204test dưới tải                                                            |
| REGRESSION       | PASS       | `stream-items/full-regression.log`: API1457/Web573/Edge5/document1; build/typecheck/lint/format đạt                                                                                    |
| DOMAIN_HTTPS     | PASS       | `stream-items/route-checks.json`: Windows Chrome HTTPS200 đúng r4; `domain/outside-lan.json`: user xác nhận4G/5G. Authenticated domain chat còn chờ login                              |
| CHROME           | PASS       | Reuse CDP33005; MAIN UI gửi/nhận/refresh/cancel thật, không cấu hình lại Chrome                                                                                                        |
| OWNER_OAUTH      | PASS       | MAIN loopback14555, official authorize/callback/token/identity, dynamic registration verified,6scope,catalog7model; `main-owner-oauth-r2.json`, `stream-items/main-catalog.json`       |
| OWNER_INFERENCE  | PASS       | `stream-items/main-hello.json`, `main-data-evidence.json`: câu trả lời khác rỗng và terminal `response.completed`                                                                      |
| PROJECT_CHAT     | PASS       | MAIN Showroom Galaxy Centre, actor/INVOKE grant hiện hữu; browser localhost nhận COMPLETED và reload còn câu trả lời. HTTPS browser acceptance còn BLOCKED_USER_LOGIN                  |
| TASK_LIST_LIVE   | PASS       | `stream-items/main-task.json`, `main-data-evidence.json`:2provider rounds, Task source4IDs, quyền project.read/task.read, Task hash trước/sau không đổi                                |
| LIFECYCLE        | PASS       | MAIN browser refresh, API restart giữ credential, catalog refresh, cancel201/CANCELLED; fixture disconnect201/CONFIRMED. Chưa ép refresh token OAuth live; không sửa expiry để giả thử |
| DEPLOYED_RUNTIME | PASS       | `stream-items/cutover.json`, `route-checks.json`: localhost/LAN/domain cùng `local-bf73047fa0ee` và instance IDs                                                                       |

Đây là pilot owner. Dữ liệu Task trong MAIN Project hiện có tên **“Công việc mẫu…”**; test chứng minh Task domain/quyền thật, không khẳng định đây là hồ sơ nghiệp vụ thật. Các tin kiểm thử có nhãn `[KIỂM THỬ LIVE 08/10/2026]`; không sửa/xóa tin người dùng. Không mở rộng Task writes hoặc Project khác.

## Clock: nguyên nhân, sửa và rollback

Windows11Pro22631.6199, WSL2.7.3.0, kernel6.6.114.1, Ubuntu22.04. API/Ubuntu/Postgres cùng boot/time namespace. Thu mẫu native Windows/WSL20ms, DB `clock_timestamp()`50ms và paired ping thường trú; đối chiếu UTC/monotonic/RAW, không lấy thời gian gọi PowerShell chậm để suy offset.

Ftrace xác định `initd` Docker Desktop gọi `do_settimeofday64` khoảng30giây; global WSL VM chronyd dùng PHC/dev/ptp0 và Ubuntu timesyncd đều hiệu chỉnh tốc độ. Admin diagnostic thành công, đã đóng debug console. Chrony trước thử có correction7299,55ppm slow. Trial NTP-off cũ chỉ64,818giây không đủ hội tụ. Trial mới có rollback12phút:659,988giây,6bước lùi nhỏ đầu166giây,494giây cuối không lùi,Chrony về12,958ppm. Timer bật lại timesyncd lúc18:21:05 thì offset/residual tăng lại.

Theo bằng chứng và [tài liệu Ubuntu WSL](https://ubuntu.com/wsl/docs/stable/explanation/time-sync/), đã disable/stop **riêng Ubuntu systemd-timesyncd**, giữ globalChrony/WindowsTime/Hyper-V/Docker/clocksource/kernel. Rollback: `systemctl enable --now systemd-timesyncd.service`. Không cron/date/hwclock/tick/kernel workaround.

Final confirmation659,9879171giây RAW: WSL32643deltas,maxdrift7,839ms; Windows21859,max3,045ms; DB12882,max7,864ms; cả ba0bước lùi. Windows−WSL−33,421..+22,231ms, sai số tối đa2,727ms; DB−WSL−0,233..+7,044ms. Ngưỡng100ms gốc không đổi,204test dưới tải đạt. Không yêu cầu0ms và không nới token validation. Gate tự tính từ samples, không đặt PASS thủ công. Sau reboot/suspend mới, nên đo lại nếu triệu chứng quay lại; không mặc định bằng chứng này bao phủ mọi lần bảo trì tương lai.

## Regression và sửa tối thiểu

`regression-analysis.md` phân loại26failure occurrences/25test lịch sử, assertion/code path và mức chắc chắn. Tách clock thật, cascade fixture và lỗi code; chưa thấy bằng chứng fake Date leak. History dùng `createdAt < current` mất lineage khi timestamp bằng/lùi: đã pin IDs các turn completed dưới Project lock, kiểm quyền toàn bộ pin, giữ provider window8/6. Missing/self/duplicate/legacy không chứng minh được thì fail closed. Không backfill timestamp hoặc đổi nghiệp vụ/quyền. Legacy history thiếu bằng chứng có thể bị từ chối; không xóa dữ liệu.

Lần MAIN user gửi “test” thất bại `CHATGPT_STREAM_REQUIRED` được giữ trong `main-user-inference-failure.json`. Wire thật từ official Responses cho HTTP200 thiếu Content-Type, SSE hợp lệ; message/tool hoàn tất ở `response.output_item.done`, terminal `response.completed.output` rỗng. Không phải OpenAI từ chối Galaxy.

Delta r4 so với r2 chỉ ba file: `ai-chatgpt-plan.ts`, test của nó, và điều kiện cảnh báo trong `project-ai.tsx`. Thiếu header đi qua cùng bounded UTF8/SSE/schema parser; explicit non-SSE vẫn chặn. Giữ item.done đã validate theo output_index, chỉ trả sau completed, chặn index trùng/thiếu, tool namespace/args sai và dữ liệu mâu thuẫn với terminal output. Không lấy delta text/HTTP200 làm PASS. UI bỏ cảnh báo “AI chưa kích hoạt” khi đã có model available.

TDD RED/GREEN cho cả hai wire bug; reviewer yêu cầu matching/conflicting terminal-output test và đã thêm trước freeze,13/13PASS. Full cuối API1457/Web573/Edge5/document1, static/buildPASS; `stream-items/review.md`, `review-rulings.md`. Dùng fixture regression **riêng** `galaxy_os_g00_20261008stream`, PG55436/Redis56383; không seed/reset suite trên fixture33002 đã có OAuth hoặc business volume. Các nhóm restore/m2a/rehearsal giữ dừng.

## Domain và TLS

DNS thực tế Cloudflare proxy A/AAAA, không phải DNS-only lịch sử. Public IPv442.113.20.127, WindowsLAN192.168.1.80, WSL172.31.138.252; portproxy80→8080/443→8443 đúng, Windows443 thuộc IP Helper. Không đổiDNS/router/firewall/nameserver, không VPS/tunnel/Caddy/Nginx mới.

Certbotstandalone tranh8080 với Edge là nguyên nhân renewal fail. Đã chuyển cơ chế có sẵn sang dedicated webroot nối challenge hiện hữu; stagingPASS, live renewal đúng một lần. Cert hostname/chain/key/runtime khớp, expires2027-01-06T09:49:13Z, fingerprint3f93a8220bb433a9e892c6b07404b10121192e659d6eafa4f550ac2b510f2f1f. Root-owned0750 hook `/usr/local/sbin/galaxy-edge-renew-cert` kiểm chain/hostname/key, giữ mode/owner, rollback pair khi restart lỗi; timer hiện hữu giữ. `domain/renewal-verified.json`, `tls-after-renewal.json`.

Public Web/Edge gates đã mở sau release safety gate; first activation rollback vì systemd Type=simple trả trước bind8443, đã sửa private orchestration đợi bind có deadline, second activationPASS. `domain/activation.json`. Giữ exact Host/origin/proof, API cùng origin, dev authfalse. Fresh r4 anonymous+devheader401, forgedOrigin403. Source cookie Secure/HttpOnly/SameSite=Lax cho HTTPS; browser cookie/login/logout trên domain chưa có session nên chưa claim PASS.

Không mở Internet cho3000/3001/5432/6379/CDP. API đọc Responses SSE từ OpenAI; Project UI hiện nhận kết quả `/run` khi hoàn tất, không phải text SSE incremental trên browser. Cần gọi completed `/run` qua domain để nghiệm thu end-to-end TLS; health200 không thay bước này. Rate limiter API hiện dùng loopback bucket chung là giới hạn availability, không tự mở trust mọi forwarded header.

## MAIN owner và dữ liệu live

Kết nối fixture33002 đã consent thật rồi MAIN thực hiện riêng trên3000, callback127.0.0.1:14555/auth/callback; không chuyển tokenfixture. MAIN dynamic client `oaiapp_IJbi0bCsaExA3ZWWVBMtMl2j`, identity verified; scopeopenid/profile/email/offline_access/resource.invoke/chatgpt.tokens.use.direct. Catalog7model, thử gpt-6-luna. Không dùng token/client/cookie Codex, không đổi redirect thành publicdomain.

- Project `50000000-0000-4000-8000-000000000003` — Showroom Galaxy Centre.
- Main actor `cf9b5f15-5fa2-4910-b0a6-671f54d345e6`, INVOKE grant `da847eb9-a2d8-4bb5-87a9-c23802b7336b` hiện hữu.
- Hello answer `fd2a5d75-3112-4027-a6d9-d8de1646f1c6`: “Kết nối Galaxy hoạt động.”, COMPLETED/response.completed.
- Task answer `a6f32ba7-c1bb-4975-a612-e29847bcda04`:4bản ghi hiện hữu, Task list source,2provider calls đều completed; provider không trả request ID (null), không bịa ID.
- Task-row SHA256 trước/sau `7b671434ce871fd3d0402e989842db71f36e11da9dd60bf60ffcc851c7130cf9`.
- Cancel answer `ac8f7b32-ba6c-47cc-b419-fe53a556d075`: cancel vàrun đều201/CANCELLED, không phát hành text sau cancel.
- Fixture disconnect tách browser context: DISCONNECTED/models0/canInferfalse/revocationCONFIRMED, reload giữ; không ngắt MAIN. Fixture thiếu Project grant vẫn404, không cấp thêm quyền.

Refresh trang và catalog thực đã kiểm; restart API khi cutover giữ connection và hủy pending restart theo cơ chế hiện hữu. Không ép hạn token/thời gian để chạy rotation; live token rotation chưa nghiệm thu riêng. Staff dùng chung false/UNCONFIRMED; không chặn owner pilot.

Tài liệu chính thức đã đọc: [quickstart](https://developers.openai.com/siwc/quickstart), [sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms), [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [errors/recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).

## Backup, rollback và bước còn lại

`stream-items/business-before-cutover.dump`: customPG,1.436.383bytes,1542TOC,SHA256ac13be3c4f3c35f61158e0eb61fb14304097ee28b9b5c73ae48478dbb12cbbc9. Có backup host key private0600. Dump đọc/TOC/hash đã kiểm; không claim restore rehearsal. Schema86 không đổi. Rollback app giữDB/storage/credential: hai unit+manifest r2 ở `stream-items/rollback-cutover/`; cutover kiểm activeAI/ownership/readiness và tự rollback nếu lỗi. Key/provider env/policy/Edge PID không đổi. Fresh receipts `preparation.json`, `artifact-integrity.json`, `release-validation.json`, `cutover.json` trong stream-items.

Còn đúng phần cần user: đăng nhập Galaxy tại tab **https://os.galaxycentre.vn/login** của Chrome CDP, không kết nối ChatGPT lại. Sau đó chạy `stream-items/main-browser.cjs domain`, kiểm Task list qua HTTPS và Secure cookie, login/logout/session revocation. Không yêu cầu mật khẩu/OTP/code/token qua chat. Có thể dùng ngay AI tại localhost3000 → Showroom Galaxy Centre → AI; không mở mọi Project hoặc nhân viên.
