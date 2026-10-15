# ChatGPT owner pilot — implementation and live acceptance

Ngày 2026-10-08. User đã phê duyệt phạm vi và INLINE. Không commit/push.

## Source và phạm vi

Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; baseline clean. Root branch `g00/build-test-isolation-20260914` và untracked `figma/`, `prompt/` được bảo toàn. Old runtime `local-a3eb571a7fcc`, API736608/Web736609; schema86.

Bản chốt thay điều kiện spec cũ: bắt đầu đăng ký với dynamic_agent_client không đòi grant/client/model có trước; staff admission độc lập owner pilot; không yêu cầu phê duyệt phí mới cho đường plan đã được user chốt; chỉ task_list, không RAG/artifact/write. User chọn dùng Project thật; Project được allowlist là Showroom Galaxy Centre (`50000000-0000-4000-8000-000000000003`).

## Đã triển khai

- Existing Settings controller + auth/CSRF guard; SYSTEM permission checked again at begin/activation. Loopback14555 riêng Galaxy, state/nonce/PKCE và server pending actor/session, không cần cookie callback.
- Registration/subject/grants/models tách biệt; jose verifies signature/issuer/audience/exp/nonce. Key0700/0600 ngoài artifact, AES-GCM records trong SystemSetting private namespace; không browser/log secrets.
- Rotating refresh serialized bằng advisory transaction lock; terminal revocation reconnect; network ambiguity không replay refresh. Disconnect local durable, remote revoke confirmation riêng.
- Existing Project chat/task domain; owner and Project allowlist + actual IAM, Responses official SSE completed, only read task_list, task-source lineage qua history, final transaction fence chống late disconnect.
- UI giữ Hệ thống → Kết nối ChatGPT, localhost/LAN URL như yêu cầu, bốn API-key provider paused.

## Kiểm chứng đang tiến hành

Windows Chrome session đã200 thay báo cáo401 cũ; disabled literal được tái hiện trước sửa. Targeted50 PASS gồm Postgres fence thật và OAuth mock. Full tests/lint/typecheck/format/build và artifact/browser/live sẽ được ghi kết quả cuối bên dưới. Không lấy mock làm bằng chứng OpenAI thật.

A session PASS ở baseline; B–I live NOT_RUN; J artifact mới NOT_RUN.

## Khôi phục sau reboot WSL — 08/10/2026, 16:16 +07

Đây là checkpoint tiếp tục, chưa phải nghiệm thu live. Phạm vi đã duyệt giữ nguyên; không commit/push, không sửa AGENTS/skill. Bằng chứng bền vững: `/home/galaxy_os/.runtime/siwc-recovery-20261008/` (private, không đưa backup/env vào Git).

### Source và bảo toàn

- Source 854 file đã đối chiếu khớp TESTED_TREE trước crash `0a720817bab0989abb6447d3b5135d7239daad99` bằng cách tính lại Git tree từ byte và mode. Object tương ứng trong Git có kích thước 0; không sửa/xóa object, reset, clean hay stash.
- `checkpoint-source/source.tar.gz` giữ source trước sửa sau reboot, gồm file task chưa tracked; SHA256 `5b164422171037b45caa7f5329af518682854a9fb19ef10ce1905f976e285973`. Không chứa .env/token/dữ liệu nghiệp vụ. Root `figma/`, `prompt/` nguyên trạng.
- Review sau reboot đã sửa: SYSTEM bị thu hồi thì owner không inference; lưu refresh marker trước HTTP để crash không replay token cũ; lưu token xoay vòng dù mất grant; late response không xóa marker; disconnect đang rotation giữ remote UNCONFIRMED; refresh không ghi đè VERIFYING_IDENTITY. Mỗi lỗi có test RED/GREEN.
- CODE_SHA / TESTED_SHA base `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` + dirty task changes. Không có commit mới. Snapshot được kiểm thử: `snapshot-sha256:5015bd81b6b10a82e34685945d0239a3417481fc99c795f3c2e3f346fed94728`; TESTED_TREE `bf683acdde07008c3a3952818bc3fcc351eca7a1`. `tested-source.tar.gz` SHA256 `f21e2b43888b1d7449a0cf24f0240c5a23f01f3f3736d360844da5164a3d8412`. Phần ghi nhận kết quả trong tài liệu được thêm sau snapshot; code không đổi.

### Docker và database

Context `default`, socket `/var/run/docker.sock`, engine Docker Desktop `docker-desktop` 29.4.3. Inventory chỉ chọn labels/image/mount/port, không dump env/secret.

| Nhóm                                   | Vai trò/căn cứ                                                | Volume / storage                                                | Cổng loopback               | Trạng thái sau khôi phục                                                     |
| -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `galaxy_os`                            | Runtime nghiệp vụ theo manifest/env đang phục vụ              | `galaxy_os_galaxy_postgres_data`, `galaxy_os_galaxy_redis_data` | 5432,6379; Mailpit1025/8025 | Đã chạy sẵn khi inventory; giữ nguyên                                        |
| `galaxy_os_g00_20260930m3`             | Test: Compose g00, guard DB/user/ports/path và synthetic seed | tmpfs Postgres/Redis                                            | 55435,56382                 | Chỉ bật hai service này; DB sau reboot rỗng, prepare guarded chỉ vào DB test |
| `galaxy_os_g00_20260930m3restore`      | Receipt diễn tập restore, g00 config                          | tmpfs                                                           | 55436,56383                 | Giữ dừng, không cần cho tác vụ                                               |
| `galaxy_os_g00_20260928m2a` / nhóm m2a | Fixture cũ theo g00 labels/config                             | tmpfs                                                           | 55433,56380                 | Giữ dừng                                                                     |
| `galaxy-local-rehearsal-20260930`      | Lịch sử diễn tập nâng cấp/restore, không suy từ tên           | `galaxy-local-rehearsal-20260930-data`                          | 55434                       | Giữ dừng, bảo toàn volume                                                    |

Database nghiệp vụ đã pg_dump nhất quán vào `business-before-siwc.dump`0600; SHA256 `f257de82c82ba08939134f272d44ec50b51158b8cb11fd0eabf0f9f8aa7eeab0`, TOC1526 mục. Không migrate/seed/reset database nghiệp vụ. Không xóa container/volume. RAM available5.5GB/disk886GB lúc kiểm; chưa có bằng chứng crash do hết RAM.

### Runtime và Windows Chrome

- Main vẫn `local-a3eb571a7fcc`, source `a5e82d80129cc698860c501683b844b404c7f33b`, API PID1232/Web1553 tại lần kiểm sau reboot; health READY/schema86. Startup không tự migrate/seed.
- Windows LAN vẫn `192.168.1.80`; WSL `172.31.138.252`; portproxy3000 trỏ đúng WSL. Hai URL yêu cầu giữ nguyên. Bốn provider paused, policy CHATGPT_PLAN_ONLY.
- Chrome Windows154.0.8037.98 dùng lại profile riêng `C:\Users\Admin\AppData\Local\GalaxyOS\ChromeDev`, CDP Windows127.0.0.1:33004 → stdio Windows Node22.23.3 → WSL127.0.0.1:33005. Không mở CDP LAN, không đóng Chrome cá nhân/đọc cookie/token; không đổi config MCP. MCP chính thức1.10.1 và cú pháp đã kiểm; automation dùng Playwright có sẵn qua cầu nối CDP cũ.
- `chrome-main-before.json`08:35:34Z: thấy URL/DOM Galaxy, click menu vô hại, `/me`200/SYSTEM, metadata200, API/Web đúng marker main. `project-read-before.json`08:42:11Z: Project AI200, Tasks200/4 task. Đây là browser thật trên Windows, chưa phải candidate acceptance.
- Candidate build API/Web/Edge PASS: `local-5015bd81b6b1`, WebBuild `SlHlV_dyAVwODcCCf2yTX`, `/home/galaxy_os/.runtime/releases/siwc-owner-recovered-20261008-r1`. Source/hash/env delta/schema86/unit validator isolated XDG PASS. Chỉ staged, chưa cài unit/cutover. `release-validation.json` giữ `releaseAllowed:false`.

### Kiểm thử mới và blocker có bằng chứng

- Focused SIWC52/52 PASS; typecheck/lint/format/document1 PASS, build3package PASS; review correctness/security/Ponytail không còn finding SIWC. Lint còn hai warning UI từ baseline.
- Full đầu sau reboot: API1437 PASS/1 FAIL appendix404; Web573/Edge5 PASS. Full sau sửa: API1424 PASS/20 FAIL trong hai file M2/M3; Web573/Edge5 PASS. Hai ca hợp đồng riêng2 PASS; recheck trọn hai file140 PASS/5 FAIL với vị trí lỗi thay đổi. Không gọi full regression PASS.
- Observer native45s có444 samples, 4 bước lùi drift−539/−674/−529/−672ms (`clock-baseline.json`). WSL timesyncd đang active, Hyper-V implicit sync bật; Windows W32Time STOPPED, `w32tm /query` lỗi `0x80070426`. Chưa chứng minh tác nhân trực tiếp chỉnh clock.
- DB test ghi nhận grant effective09:04:34.408Z nhưng revoke tiếp theo09:04:33.635Z; index worker09:04:04.719Z nhìn grant09:04:05.042Z là tương lai. Với legacy OpenRouter fixture, export được tạo sau nhưng createdAt09:08:53.368Z < predecessor09:08:53.370Z, khiến history cutoff bỏ lineage quyền tài chính; download trả200 sau revoke. Đây là ảnh hưởng thật của thời gian không đơn điệu, không được bỏ qua chỉ vì retry xanh. Không sửa nghiệp vụ/ACL để né lỗi.
- Thử Start-Service W32Time bằng quyền hiện tại bị Windows OS từ chối (`CouldNotStartService`); không phải auto-review rejection. Bước đang chờ chủ máy: PowerShell **Run as administrator**, `Start-Service W32Time`, rồi `w32tm /resync`. Không xin mật khẩu; không đổi NTP source/tolerance, giờ thủ công hoặc disable timesyncd.
- Điểm nghẽn tiếp theo duy nhất: khôi phục và xác minh clock ổn định bằng quyền OS hợp lệ. Sau đó observed regression → artifact Chrome fixture → cutover có rollback → Chrome main/callback14555 → OAuth thật. Không chạy lại OAuth vô hạn; hiện chưa gọi authorize live.

| Chặng live                          | Kết quả hiện tại | Bằng chứng/điều kiện                                                        |
| ----------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| A Galaxy session SYSTEM             | PASS             | Windows Chrome `/me`200, Project/tasks200 trên main hiện tại                |
| B authorize thật                    | BLOCKED          | Chưa cutover candidate vì clock; main cũ còn gate                           |
| C callback/token exchange           | NOT_RUN          | Chưa có OAuth live                                                          |
| D identity/registration/grant       | NOT_RUN          | Không dùng mock/discovery thay bằng chứng                                   |
| E catalog                           | NOT_RUN          | Chưa có credential Galaxy                                                   |
| F câu hỏi vô hại completed          | NOT_RUN          | Chưa inference                                                              |
| G chat Project                      | NOT_RUN          | Chưa inference                                                              |
| H task_list và câu trả lời cuối     | NOT_RUN          | Task domain read200 riêng chưa là tool live                                 |
| I cancel/refresh/restart/disconnect | NOT_RUN live     | Automated regressions PASS; không gộp thành live                            |
| Runtime candidate local/LAN         | BLOCKED          | DEPLOYED=`local-a3eb571a7fcc`; candidate `local-5015bd81b6b1` chưa activate |

Không có bằng chứng OpenAI từ chối ứng dụng, grant hay quota trong lượt này. Điểm chặn nằm ở clock/WSL trước OAuth. Script tiếp tục và toàn bộ log giữ trong recovery directory; backup/env không đưa vào Git.

### Kết quả đối chứng clock tiếp theo — 16:30 +07

- Chủ máy đã chạy thành công Start-Service W32Time + w32tm /resync. Windows Time RUNNING, Leap0/Stratum5, nguồn `time.windows.com,0x8`; đồng bộ thành công16:16:05. Tuy nhiên observed runner `7ff9dc0e` vẫn CLOCK_CONTAMINATED_BASELINE; test NOT_RUN.
- Chủ máy tiếp tục dừng tạm `systemd-timesyncd.service`; đã xác minh inactive/dead. Observer `13505f80` vẫn có bước lùi tối đa1103ms, test NOT_RUN. Không kết luận timesyncd là nguyên nhân duy nhất.
- Đo đồng thời nhưng độc lập bằng native wall/monotonic: Windows590 samples,0jumps>100ms,max1.20ms; WSL644 samples,2jumps−360.79/−490.29ms tại09:25:15Z/09:25:44Z. Lỗi được khoanh tại thời gian WSL, tác nhân chỉnh chưa xác định. WSL2.7.3/kernel6.6.114.1-1/Windows10.0.22631.6199; chỉ Ubuntu22.04 và docker-desktop chạy.
- Tài liệu [Ubuntu time sync](https://ubuntu.com/wsl/docs/stable/explanation/time-sync/) giải thích NTP/Hyper-V có thể xung đột. [WSL issue11790](https://github.com/microsoft/WSL/issues/11790) có mô tả bước lùi định kỳ tương tự; đây chỉ là đối chiếu triệu chứng, không chứng minh cùng tác nhân hay có bản sửa phù hợp. Không sửa kernel/.wslconfig, cài NTP mới, shutdown/unregister/reset Docker hoặc chỉnh Date/expiry/ACL.
- Candidate API33001/Web33002/TLS33003 đã khởi động trên test DB để chuẩn bị; đã dừng đúng ba launcher của tác vụ khi clock gate tiếp tục FAIL. Chưa chạy candidate browser test. Hash API/Web/Edge/dependencies vẫn khớp artifact build; code hiện tại khớp tested snapshot, chỉ ba tài liệu cập nhật sau snapshot.
- Chrome Windows kiểm lại09:29:02Z: localhost settings/me200/SYSTEM, click menu được; LAN mở login vì chưa có session riêng cho origin LAN, `/me`401. Cả hai origin API/Web health200 cùng `local-a3eb571a7fcc`. Không sao chép cookie để chữa401. Browser automation PASS; candidate/main mới/OAuth chưa PASS.
- Đã yêu cầu hoàn nguyên phép thử tạm bằng `sudo systemctl start systemd-timesyncd.service`; đang chờ xác nhận tại thời điểm ghi. Windows Time giữ running. Không coi thao tác hoàn nguyên là cách sửa clock.

**Điểm chặn hiện tại:** WSL wall clock vẫn lùi định kỳ và đã làm sai chronology/ACL trong dữ liệu test. Chưa thể đưa candidate vào runtime và nghiệm thu OAuth/chat an toàn với điều kiện này. Cần xử lý nguồn thời gian WSL ở tầng OS, chứng minh observer sạch rồi mới chạy lại hồi quy/browser/cutover. Không còn yêu cầu lặp Start-Service/resync như một lần thử sửa mới; chưa có bằng chứng provider admission/grant/quota. Ma trận A–I phía trên giữ nguyên; nhãn BLOCKED của B/runtime là local clock, không phải OpenAI.

Hoàn nguyên đã xác minh lúc 2026-10-08T09:34:17.355156+00:00: `systemd-timesyncd` active/running; không còn thao tác hoàn nguyên đang chờ. Main controller READY/API1232/Web1553; fixture33001/33002/33003/14556 không còn listener. Windows Chrome và CDP bridge được giữ. Nhóm Docker đang chạy: main Postgres/Redis/Mailpit và test m3 Postgres/Redis; các nhóm restore/m2a/rehearsal vẫn dừng. Không có thay đổi schema/data nghiệp vụ hoặc cutover trong phiên.
