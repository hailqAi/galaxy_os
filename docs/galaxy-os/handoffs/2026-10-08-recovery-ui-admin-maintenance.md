# Phục hồi control plane và phát hành UI admin — packet hiện tại

Trạng thái hiện hành: UI admin/P04 + tracker READ/registry đã phát hành main `local-a3eb571a7fcc`; API/Web READY, control plane phục hồi, `pnpm dev` exit0/ALREADY_RUNNING_VERIFIED. Owner duyệt packet native mới và contingency cleanup; Reexecute đúng một lần, cleanup hoàn tất. SIWC chưa configured/grant và multiuser scope chưa xác minh. Các packet bên dưới là lịch sử, không chạy lại.

Baseline host kiểm lại08/10: manager UID1000/PID470, API643395/Web643396, Edge308598; bus path absent, private pathname không nối được; API/Web localhost trả `local-a0429faf5733`. Executor ngoài user-manager subtree. Main có0answer QUEUED/INDEXING/RUNNING tại thời điểm kiểm. Root worktree HEAD1a59665 và untracked figma/prompt được giữ; source canonical mới hơn tại linked worktree.

Candidate `/home/galaxy_os/.runtime/releases/recovery-ui-admin-20261008-r1`, release `local-ce7fabf8ed1c`, production CODE_SHA `f2bdd2549a4d0b449a73e86b043d7f9007ef8d77`, tested tree `7dd89945e555e8e34fefd8f94fb1211bade997ea`, WebBuildID `SVxXPHeDraVZDUpR1lDAv`. Commit harness `e37e570060e2d548ae0a4f6915cd6234d6c777c3`, browser tree `f10d5d53e8892cddcdebc53c23bd8990e234e375`; chỉ selector responsive, production không đổi. Full regression API1388/Web573/Edge5/document1 +64Python, lint/types/format/build PASS. Exact artifact Chrome admin/member/revoke/check/reload, Task pagination, P01/P03/P04/P05/P06/S01/popup có7PASS; member gate ban đầu chọn paragraph trong sidebar bị ẩn ở mobile, selector :visible giữ nguyên assertion rồi retest1PASS/5widths. Không báo single8/8 hoặc main/vendor PASS. Digests sau browser giữ nguyên.

Private evidence/units/env0600/backup0700 tại `/home/galaxy_os/.runtime/recovery-ui-admin-20261008/`: preparation.json, release-validation.json, artifact-integrity.json, staged/, candidate-env/, rollback-prepared/, checks/. Units được verify trong XDG riêng; inode/mtime private socket thật giữ nguyên. Schema86 giữ. Env delta API chỉ marker + CHATGPT_PLAN_ONLY; Web chỉ marker. Provider metadata và secret env không đổi;4API-key providers vẫn PAUSED.

## Thao tác cũ đã duyệt và thực thi — không lặp lại

Lệnh lịch sử:

```sh
python3 /home/galaxy_os/.runtime/chatgpt-plan-20261008/recover-user-manager.py --execute-approved
```

Đọc [packet recovery chi tiết](2026-10-08-runtime-maintenance.md). Phạm vi là **toàn manager UID1000**, rộng hơn2service Galaxy. Script pin manager pidfd; tạo1D-Bus child restricted EXTERNAL/UID1000 tại path đang trống, không activation/unit tạm; SIGUSR1 reconnect; xác minh name-owner PID; Manager.Reexecute một lần; kiểm SO_PEERCRED private socket. Không restart app/WSL/Windows/Codex, không sửa unit hệ thống, DB/storage/env/provider. Có rủi ro ảnh hưởng client dùng manager; không thể rollback RAM manager.

Receipt0600 atomic trước mutation; cleanup TERM/wait10s/KILL chỉ owned child/wait5s, unlink chỉ inode/UID khớp. SIGTERM/HUP/INT bắt được đều đi cleanup; crash/SIGKILL có thể ngăn cleanup. Procedure đối soát/cleanup orphan trong packet chi tiết; không tự chạy lại hoặc xóa path khi thiếu identity. Sau cleanup bắt buộc private control READY không dùng bus tạm, main API/Web/Edge giữ process identity và API/Web health. Script kiểm fingerprint/health API/Web, chỉ identity/cgroup Edge; helpers runtime không có wall-time hard bound. Nếu khác baseline hoặc lỗi, ghi receipt và dừng, không fallback.

Automatic approval review trước đây đã từ chối bus tạm vì tác động vượt2service và cleanup chưa rõ. Packet được review không thay thế user/environment approval. Không gọi mutation để thử lại nếu chưa được duyệt riêng.

## Cutover kế tiếp đã được owner cho phép trong scope local app

Chỉ sau recovery READY: `/home/galaxy_os/.runtime/recovery-ui-admin-20261008/cutover.py`. Script kiểm exact manifest/artifact/schema/private env/units, provider bytes, PID Edge và0job AI; lock runtime; backup units+manifest mới vào rollback-cutover0700; stop đúng Web ingress rồi drain rồi API, install đúng2unit+atomic manifest, reset-failed đúng2unit (tránh start-limit chặn rollback), start và readiness. Không chạy validator vào XDG thật. Gián đoạn2app dự kiến vài giây, readiness tối đa50s cộng probes. Thất bại/catchable interruption thì stop chỉ owned candidate unit, phục hồi unit/manifest/artifact/env cũ rồi readiness; không rollback DB hoặc provider pause. Không mở public/tunnel. Kiểm localhost/LAN và main Chrome sau release; chưa có session Galaxy hợp lệ thì owner đăng nhập qua UI bình thường, không đọc/in password hoặc bypass login.

Candidate đủ điều kiện UI không phụ thuộc SIWC: Hệ thống → Kết nối ChatGPT `/settings/chatgpt-connection`; SYSTEM source cho system.settings.read/update; check là local có audit, không OAuth/inference. ELIGIBILITY_UNCONFIRMED/NOT_GRANTED/UNCONFIRMED, catalog rỗng; Pro cá nhân không được suy thành grant nhiều người. Project không có setup CTA/API key.

## Kết quả thao tác đã duyệt và packet sửa nguyên nhân

Owner đã duyệt đúng recovery script ban đầu. Thực thi08/10 09:46 host exit1; receipt0600 `/home/galaxy_os/.runtime/chatgpt-plan-20261008/recovery-receipt.json`: FAILED/CONNECTING_MANAGER, không Reexecute; child715636 đã thoát, busPathAbsent=true. Inspect-only sau cleanup: manager470/API643395/Web643396/Edge308598 giữ nguyên. Không đổi manifest/units/provider. Automatic approval review của lần thực thi này đã cho phép; đây là lỗi thực tế, không phải lần từ chối mới.

Nguyên nhân được journal và source systemd249 xác nhận: SIGUSR1 chỉ reconnect nếu cả `dbus.socket` và `dbus.service` đang RUNNING; nếu không, nó start `dbus.service`. Host không có cả hai unit trong lookup paths. Daemon child được tạo bên ngoài manager không đáp ứng điều kiện này. Không chạy lại hoặc sửa receipt cũ. Source: [manager.c v249](https://raw.githubusercontent.com/systemd/systemd/v249/src/core/manager.c), [dbus.c v249](https://raw.githubusercontent.com/systemd/systemd/v249/src/core/dbus.c).

### Đề nghị bổ sung cần duyệt riêng

Lệnh duy nhất: `python3 /home/galaxy_os/.runtime/recovery-ui-admin-20261008/recover-native-user-bus.py --execute-approved`.

Packet0600 `native-recovery-packet.json` pin bootId, manager process identity, unit paths, SHA256 script/2unit/config. Script default inspect-only đã xác minh manager/app/Edge như trên, exact unit names và drop-ins đều absent trong các lookup paths thật (HOME/XDG allowlist của manager, không đọc token). Tạo **hai file mới absent-only** `dbus.socket` và `dbus.service` dưới `/run/user/1000/systemd/user/`, không install/enable package/OS unit. Socket `%t/bus`0600, RemoveOnStop=no, StopWhenUnneeded=yes. Daemon restricted EXTERNAL chỉUID1000, chỉ own systemd1 và gửi DBus/systemd1; `--address=systemd:` dùng LISTEN_FDS từ native socket; Restart=no/start limit1. File content được pin hash trước mutation.

Sequence: runtime lock/health/identity/manifest checks → receipt atomic0600 → exclusive-create2file → SIGHUP pidfd470 một lần (reload toàn user manager) → chờ journal Reloading. mới, barrier event loop systemd249 → SIGUSR1 một lần khởi động2nativeunit → pin daemon PID/command/cgroup, socket inode/UID, name-owner systemd1=470, FragmentPath và reverse stop dependencies → Manager.Reexecute đúng một lần → verify private SO_PEERCRED=(470,1000) → stop exact owned socket transaction (Requires propagates stop owned daemon), kiểm socket đã đóng và2nativeunit inactive/failed không còn Job (private), hoặc API StopUnit đã ack + socket đóng + daemon đã thoát; không coi bus pathname absent là đã hết pending start job; unlink chỉ inode/UID đã pin → unlink chỉ fingerprint2file → Reload qua private → verify READY không bus tạm và API/Web identity + health, Edge identity/cgroup giữ nguyên. Không cutover, restart app/Edge/WSL/Codex trong operation này.

Phạm vi **toàn user manager UID1000**, rộng hơn2service. SIGHUP reload cấu hình các user units; reexecute serialize/restore manager state. Không rollback được RAM manager; có thể ảnh hưởng client manager. Backup `rollback-prepared/` chứa manifest và2Galaxy units byte-identical với main; env/artifact cũ vẫn tồn tại. Không hứa backup này rollback manager; app cutover chưa diễn ra. Không DB/storage/canonical env/provider mutation,4API-key providers giữ PAUSED.

Cleanup failure: nếu private chưa lên nhưng bus name-owner470 hợp lệ, dùng bus để stop một transaction dbus.socket (native Requires stops daemon). Trước StopUnit bắt buộc kiểm owned file fingerprints/loaded FragmentPath và không có reverse RequiredBy/BoundBy/ConsistsOf/RequisiteOf/PropagatesStopTo ngoài owned dbus.service. Nếu **cả hai manager transports không thể dùng**, không có signal native để stop riêng2unit: ghi **FAILED_CLEANUP_PENDING**, giữ residue restricted kèm receipt/identity và dừng; không kill manager, tự lặp, unlink socket đang nghe hoặc dừng unit không chứng minh được ownership. Crash/SIGKILL cũng có thể để residue. Đối soát receipt mới/bootId/hash/FragmentPath/process/cgroup; chỉ khi manager transport hợp lệ trở lại mới review thao tác StopUnit owned socket → verify closed → fingerprint-unlink2unit/socket → Reload. Cleanup không bảo đảm khi manager mất phản hồi; contingency này là một phần phạm vi cần owner duyệt. Không coi file deletion/SIGHUP là stop socket đang active.

Verification chuẩn bị: native daemon FD activation với config restricted + GetId trên **socket /tmp riêng** PASS; validator2units trong XDG riêng PASS; không thử manager mutation. Reviewer yêu cầu ownership/drop-in/transport-failure corrections đã bổ sung; chờ review cuối; validator mới nhất exit0 + hashes được ghi native-unit-validator.json. Có watchdog timeout cho subprocess/các bước15–20s; shared runtime helpers không có overall hard wall bound. Không dùng timeout wrapper kill script giữa cleanup.

Candidate UI vẫn sẵn để cutover local2app ngay khi control READY; SIWC grant chưa đủ không trì hoãn UI. Main/live acceptance chưa chạy, không gán fixture screenshots thành main.

## Kết quả recovery, cutover và main đã thực hiện

Owner đã duyệt đúng packet native và contingency cleanup. Script native SHA256 `2113f28a0139d6a35757c3e2f2a69e3fde1b182b641001e76ea63f044044d6ed` tạo đúng2unit runtime đã pin, SIGHUP/SIGUSR1 tới470, Reexecute một lần. Private peer470 đã phục hồi; receipt `native-recovery-receipt.json` giữ trạng thái FAILED_CLEANUP_PENDING vì `busctl --address=private` dùng bus-client protocol trong khi socket private systemd cần peer protocol. Không lặp recovery và không sửa receipt lỗi.

Cleanup helper SHA256 `f75d24e29ee587ad08fa46371443ae5e4253989e6294b7299edd1df721199a69`, đã review trong contingency được duyệt, dùng native systemctl peer trước/fallback bus fail closed. Kiểm boot/receipt/process/cgroup/unit fragments/hash/stop dependencies; stop đúng owned dbus.socket/daemon, verify inactive/noJob/socketclosed rồi fingerprint-unlink đúng2unit/socket, daemon-reload. `native-cleanup-receipt.json`: RECOVERY_READY/FINISHED, 0signal/0Reexecute mới/0appRestart, privateWithoutSessionBus=true, ownedUnitsAndBusRemoved=true, appAndEdgeIdentityUnchanged=true. Không rollback RAM manager, không restart WSL/Windows/Codex/Edge.

`cutover.json`: READY, release `local-ce7fabf8ed1c`; API722051/Web722052; schema86/credential/provider bytes/Edge308598/public CLOSED giữ. Backup2units+manifest tại `rollback-cutover/`; artifact/env cũ giữ để rollback local2app. Health localhost API/Web và LAN192.168.1.80:3000 trả200/release khớp. CODE_SHA=TESTED_SHA `f2bdd2549a4d0b449a73e86b043d7f9007ef8d77`, TESTED_TREE `7dd89945e555e8e34fefd8f94fb1211bade997ea`. Harness-only e37 không thay production bytes.

Root `pnpm dev` lần đầu bị automatic approval review từ chối do lo parallel spawn/port conflict. Sau đọc entry/controller và chứng minh hai service READY nên nhánh ALREADY_RUNNING_VERIFIED không spawn/restart, chính lệnh này được review cho phép, exit0; PID722051/722052 giữ nguyên. Log `checks/pnpm-dev-main.log`. Đây là sửa control plane thật, không chỉ đổi thông báo lỗi.

Chrome main qua phiên Galaxy SYSTEM owner đăng nhập: `/api/v1/me`200; admin GET200; canCheck=true; canConnect/canDisconnect=false; check local10:31:58 được giữ qua reload. Desktop1440/mobile375 không overflow. Ảnh main thật: `main-browser/admin-main-1440.png`, `admin-main-375.png`, `p04-main-work-1440.png`, `p04-main-work-375.png`, `p04-main-ai-1440.png`, `p04-main-ai-375.png`. P04 cả2route không có setup link, history hiện hữu và session reload200,9Project accessible. Work mobile empty state ẩn panel AI theo layout hiện hữu; không suy thành lỗi grant. Member/revoke main NOT_RUN vì không có phiên member thật; fixture API/Chrome denial đạt, không đổi role main để dựng nghiệm thu.

## Lịch sử kiểm tra tracker read/registry trước release r2

Mốc đã duyệt:3READ tools task_list/get/history qua TasksService hiện hữu; Project/actor server-bound, task.read theo assignment, bỏ tài chính/dependency ngoài Project. Counts/statusCounts và contributor IDs lấy cùng RepeatableRead; snapshot tối đa1000task, đúng1001 trả TOOL_CONTEXT_LIMIT trước outbound. Page rỗng/ngoài trang vẫn lưu đủ contributors, revoke chặn saved answer/citation/continuation. History giới hạn, whitelist metadata version/status; HTTP get mặc định giữ đường đọc cũ. Registry từ schemas/policy thật, DISABLED/CHATGPT_NOT_CONFIGURED.

RED/GREEN và review cuối đạt9integration focused; schema/unit/admin focused PASS, lint/types PASS. Full lượt đầu dùng env fixture sai bị chặn; lượt M3 tiếp cạn connection/PDF config thiếu, không tính PASS. Pool3 ban đầu bị safety guard từ chối đúng thiết kế; bổ sung allowlist connection_limit1..5 với test RED1fail/14pass→GREEN15pass, giữ tất cả DB/host/storage checks và chặn duplicate/unknown query. Full pool3+GALAXY_AI_PDFINFO/PDF_LIBRARY_PATH đúng đang chạy; chưa ghi full PASS, chưa build/cutover tracker vào main. Main r1 chưa có registry mới.

Main bổ sung read-only: overview/products/files1440/375 và AI selected1440/1495/720/375/390 đã chụp, noOverflow=true,0API mutation. Selected/history được mở bằng session thật; chưa đủ error/read-only/device states của cả năm PDF. Evidence `main-browser/selected-acceptance.json`.

R01: `codex --no-daemon --no-alt-screen`0.161.0 mở idle GPT-6.1-Sol xhigh, Ctrl-C exit0, không gửi model turn/đổi approval/config; session01a119a2. Bare và saved resume cũng PASS_NO_MISMATCH nhưng root cause Codex mismatch NOT_REPRODUCED, không báo đã sửa daemon.

Owner xác nhận chưa có hồ sơ OpenAI chấp thuận. [Packet registration/grant/multiuser](2026-10-08-chatgpt-registration-eligibility.md) nêu topology và phần lifecycle chưa implement, không gửi form/đọc credentials. Full tracker pool3/PDF đạt1398API và1old egress timeout; targeted nguyên bản tái hiện5000ms. Tách cùng scenario thành2phase giữ50assertion, mỗi phase5000ms: focused2233ms/3558ms PASS; tổng5791ms là phân đoạn test, không cải thiện latency hoặc giữ cùng tổng budget. Reviewer không có Critical/Important, targeted phải chạy toàn bộ describe vì phase2 phụ thuộc phase1. Full mới đang chạy. Runtime Python lượt sandbox EPERM không được tính PASS; chạy lại host isolated tests đúng scope.

## R01–R28 — mức nghiệm thu hiện hành

Mốc đọc tracker đã qua full/build/exact Chrome8/8/release/main metadata. PASS dưới đây chỉ ở mức ghi trong evidence; không thay VENDOR_LIVE. Ảnh main từ runtime localhost, không phải Git branch main.

| ID  | Trạng thái                                         | Evidence / giới hạn                                                                                                    |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R01 | PASS CLI                                           | No-daemon0.161.0 idle/exit0, không model turn hoặc đổi approval                                                        |
| R02 | PASS CLI, nguyên nhân NOT_REPRODUCED               | Bare và valid saved resume không mismatch; CLI/daemon/app-server cùng0.161.0                                           |
| R03 | PASS MAIN                                          | Root pnpm dev exit0/ALREADY_RUNNING_VERIFIED, đúng manager/app PID                                                     |
| R04 | PASS MAIN + UNIT                                   | Hai owned user units tồn tại độc lập agent; up nhánh READY không spawn/restart; idempotence/owner tests                |
| R05 | PASS INTEGRATION/MAIN                              | Artifact template validator XDG riêng; native recovery đúng approval, Reexecute1; owned cleanup PASS                   |
| R06 | PASS r2 LOCAL RELEASE                              | Tested tree/exact artifact/digests/env/schema86/rollback đối soát; Chrome8/8 PASS                                      |
| R07 | PASS MAIN r2                                       | Localhost/LAN/API/Web200 cùng local-a3eb571a7fcc; root dev exit0 giữ API736608/Web736609                               |
| R08 | PARTIAL MAIN/FIXTURE                               | Empty/selected/direct/mobile có ảnh main,5width AI selected; error/read-only/all-PDF comparison chưa đủ                |
| R09 | PASS MAIN                                          | Login owner SYSTEM, menu Hệ thống→Kết nối ChatGPT, admin200/status thật                                                |
| R10 | PASS UNIT/INTEGRATION/FIXTURE, MAIN NOT_RUN member | SELF/ORG/DEPT và revoked403; Project không CTA; không thay role main để giả member                                     |
| R11 | PASS INTEGRATION access, OAuth NOT_IMPLEMENTED     | SYSTEM permission binding cùng assignment; mixed-role laundering/revoke chặn; chưa có OAuth finish                     |
| R12 | NOT_IMPLEMENTED                                    | SIWC attempt/callback/cancel/replay/identity lifecycle chưa nối                                                        |
| R13 | NOT_RUN                                            | Callback host/LAN/mobile chưa triển khai; không suy127.0.0.1 là host Galaxy từ mọi máy                                 |
| R14 | BLOCKED VENDOR_LIVE                                | Chưa registration/grant/catalog/completed response thật                                                                |
| R15 | PARTIAL CODE/MAIN metadata                         | CHATGPT_PLAN_ONLY chặn key dispatch mọi actor, không admin entitlement switch; SIWC non-owner gate chưa có dispatcher  |
| R16 | BLOCKED                                            | Owner xác nhận chưa hồ sơ multiuser; không chạy hai actor dưới Pro cá nhân                                             |
| R17 | PASS existing tests, MAIN NOT_RUN model            | Model/source/session guards đã có; catalog main rỗng, không bịa model                                                  |
| R18 | PARTIAL existing tests                             | Config/source revoke/late output đạt; SIWC refresh/reconnect revision race chưa implement                              |
| R19 | PASS CODE/FIXTURE + MAIN policy                    | Không API-key fallback;4providers PAUSED và policy bytes giữ qua cutover; không live quota retry                       |
| R20 | PARTIAL                                            | Task domain count/page/atomic update/audit/rollback và3READ tools focused đạt; full Task CAS/idempotency chưa hoàn tất |
| R21 | PARTIAL                                            | Task totals/status/assignees/deadline/version thật; chưa canonical4group/12stage/blocker/result                        |
| R22 | PASS existing INTEGRATION, MAIN AI NOT_RUN         | Source/answer/context Project A/B guards; model main bị grant gate                                                     |
| R23 | PASS existing INTEGRATION/FIXTURE, MAIN PARTIAL    | Private/financial/source/version/late revoke/artifact tests; main mới chưa đủ hai actor/download journeys              |
| R24 | PASS local parser/export tests, MAIN PARTIAL       | PDF/DOCX/XLSX native bytes/locators/cached status; scan render không chứng minh OCR; main export/reload mới chưa đủ    |
| R25 | BLOCKED VENDOR/MAIN                                | Tool roundtrip đọc→Task write→result chưa live; READ mock integration không thay vendor                                |
| R26 | PARTIAL existing tests                             | Cancel/timeout/lease fence/revoke đạt; crash checkpoint/resume và no-repeat Task writes còn thiếu                      |
| R27 | NOT_INSTALLED Graphify, REUSED skills              | Superpowers/Ponytail hiện hữu; rg/source đáp ứng mốc hiện tại, không cài mới hoặc semantic/network index               |
| R28 | PASS CHECKPOINT, master PARTIAL                    | STATUS/PROJECT_STATUS/PROJECT_MEMORY/handoff/manifest đúng r2; các phần chưa xong ghi riêng                            |

Full mới `checks/test-tracker-full-cpu8.log` exit0: API1400/Web573/Edge5/document1; Python64 `runtime-tracker-host-final.log` exit0. Pool3 giữ,8CPU đã có; không thay assertions/timeouts của hai ca M2 cũ từng timeout trong2CPU. Focused M2 proposal riêng404 vì phụ thuộc ca trước nên không được gọi regression product; full suite giữ đúng dependencies và PASS. Lint/types/format PASS. Main registry RED r1: heading chưa có, không bị báo GREEN giả. Đây là checkpoint lịch sử trước cutover r2; các gate build/exact Chrome/release đã hoàn tất trong mục r2 bên dưới.

Main selected chụp lại sau chờ history render (không dùng ảnh loading để báo selected): cả5width1440/1495/720/375/390 noOverflow, textarea112px, answer16px/26px,0mutation. Reference/main comparison standalone `design-review/comparison-main-r1.html`; đã đọc5design first-page render, không gọi pixel-perfect. Selected human conversation/read-only/error states chưa đủ main; giữ R08 PARTIAL.

## Release r2 hiện hành — nghiệm thu 08/10 11:16 ICT

- CODE_SHA = TESTED_SHA: `a5e82d80129cc698860c501683b844b404c7f33b`.
- TESTED_TREE: `3e04b19306cece71605018e419ee87caab221922`.
- DEPLOYED_LOCAL_RELEASE: `local-a3eb571a7fcc`.
- Artifact immutable: `/home/galaxy_os/.runtime/releases/recovery-tracker-registry-20261008-r1`.
- sourceDigest: `a3eb571a7fcc4d0f3a89502a8982b7593990a8d4748ab89cf465fd87139a8e04`; WebBuildID `tjp6cKNOGTQtsPYGiksmX`.
- URL main: http://localhost:3000 và http://192.168.1.80:3000. Menu Hệ thống → Kết nối ChatGPT, `/settings/chatgpt-connection`.

Canonical source tại `.worktrees/m2-a-20260928`, branch m2/project-chat-20260928; source sạch sau commit a5e82d8. Commit tài liệu tiếp theo không đổi CODE_SHA của artifact. Root checkout HEAD1a59665/untracked figma/prompt được bảo toàn. Không push/tag/merge.

Full source gate PASS API1400/Web573/Edge5/document1/runtime64, lint/types/format. Build exact artifact PASS `recovery-ui-admin-20261008/checks/build-tracker-artifact.log`. Chrome **single8/8** PASS/41.7s tại `recovery-tracker-registry-20261008/checks/browser.log`: admin registry/check/reload/SYSTEM/member/revoke; Task125rows/page/retry; P01/P03/P04/P05/P06/S01, private file/export/PDF/citation/revoke, popup và5widths. Đây là fixture với PostgreSQL riêng/mock provider, không main hoặc vendor live. Review cuối correctness/security/authorization/UX/Ponytail không còn Critical/Important. Trần tracker1000 vẫn là giới hạn có ghi chú,1001 chặn trước outbound.

Packet mới riêng `/home/galaxy_os/.runtime/recovery-tracker-registry-20261008/`: preparation/release-validation/artifact-integrity/cutover receipts, env0600/backup0700. Private socket inode giữ qua validator XDG cô lập. Digest API/Web/Edge/deps sau browser bằng sau build. Cutover READY chỉ2owned app units: API736608/Web736609. Env delta chỉ release marker, schema86/credential/provider bytes/storage giữ; Edge308598 giữ, public CLOSED. Rollback backup2units+manifest tại `rollback-cutover/`, artifact/env r1 local-ce7fabf8ed1c giữ. Không thêm manager recovery/Reexecute. Fixture wrapper736031/736054/736103 đã TERM/cleanup đúng identity; fixture-cleanup.json xác nhận hết3owned processes, không đóng Chrome/CDP/main.

Root pnpm dev mới exit0, ALREADY_RUNNING_VERIFIED giữ API736608/Web736609, đúng build/source/DB/storage. GET localhost Web `/health`, API `/api/v1/ready`, LAN `.80:3000/health` đều200/release local-a3eb571a7fcc. Health receipt `main-browser/health-local-lan.json`. Một probe ban đầu dùng sai `/api/health` trả404; probe đúng đường manifest đạt, không coi đó là lỗi runtime hoặc che lỗi bằng thông báo.

Main Chrome dùng session SYSTEM owner đã đăng nhập bình thường: /me200/adminGET200, registry12contract và đúng3READ tool task_list/get/history `PROJECT_AND_TASK`, DISABLED/CHATGPT_NOT_CONFIGURED. checkedAt `2026-10-08T03:31:58.780Z` giữ qua reload, Connect/Disconnect disabled, canCheck=true; metadata models[]/identitynull/NOT_GRANTED/UNCONFIRMED. Ảnh main mới **từ app đang phục vụ**, không fixture: [admin desktop](/home/galaxy_os/.runtime/recovery-tracker-registry-20261008/main-browser/admin-main-1440.png), [admin mobile](/home/galaxy_os/.runtime/recovery-tracker-registry-20261008/main-browser/admin-main-375.png), [AI selected desktop](/home/galaxy_os/.runtime/recovery-tracker-registry-20261008/main-browser/main-ai-selected-1440.png), [AI selected mobile](/home/galaxy_os/.runtime/recovery-tracker-registry-20261008/main-browser/main-ai-selected-375.png).

`main-browser/acceptance.json`, registry-acceptance.json, p04-acceptance.json, selected-acceptance.json và checks/main-\*.log ghi main r2. P04 work/ai1440/375, overview/products/files1440/375, selected AI1440/1495/720/375/390 giữ9Project/session/reload200; không setup/key link trong Project, không overflow, answer16px/26px/composer112px,0API mutation. Work mobile ẩn AI panel theo layout, không suy gate=false thành kích hoạt. Selected AI hiển thị câu trả lời lịch sử cũ; nội dung “ERROR” trong câu cũ không chứng minh lỗi provider mới. Main member thật/error/read-only/all-five-state comparison và tạo/export file mới vẫn NOT_RUN/PARTIAL. Minor UX: launcher nổi che một phần giải thích ở admin375; không gọi mobile pixel-perfect.

Owner xác nhận chưa hồ sơ chấp thuận OpenAI; thiếu registration/grant/multiuser scope là blocker thực tế cho kết nối trung tâm. [Packet điều kiện](2026-10-08-chatgpt-registration-eligibility.md) đã chuẩn bị topology, callback, usage và quyền người dùng; không gửi form hoặc xin OAuth/MFA. Sau đủ điều kiện vẫn cần implementation callback/store/refresh/revoke/catalog/plan dispatcher và nghiệm thu host/LAN/hai actor. API-key providers paused, không fallback/fees. Các việc local còn tiếp: thiết kế Task writes/CAS/source idempotency riêng, durable crash resume, bộ nhớ vận hành/4group12stage canonical và main file/download/reload trong scope được phép. Không báo toàn master hoàn tất.

Main download/reload bổ sung: GET file list theo9Project được phép trả50file hiện hữu. Tải vào RAM tối đa1file nhỏ mỗi MIME PDF/DOCX/XLSX/PNG:200 cả4, Content-Type/kích thước khớp metadata; sau reload GET lại cùng version, SHA256/kích thước giữ, session200/0mutation. Receipt `recovery-tracker-registry-20261008/main-browser/download-acceptance.json`, log `checks/main-downloads-reload.log`. Đây là binary transport của file có sẵn, không tạo/export mới, không kiểm parser/render/nguồn đúng nội dung; PDF chọn đầu chỉ75byte, không dùng kết quả này chứng minh native PDF hợp lệ. R23/R24 vẫn PARTIAL cho main hai actor/tool export mới.

Đã mở và để lại một tab quản trị main mới cho owner xem trực tiếp: `/settings/chatgpt-connection`, Web/API local-a3eb571a7fcc,12tools/adminGET200. Tab Project hiện có và nháp không reload/đóng; user-visible-tab.json xác nhận originalPagesPreserved=true. Trang vẫn “Chưa được kích hoạt” vì điều kiện vendor thiếu, không phải release UI cũ. Cuối checkpoint: full format:check và git diff --check PASS; review tài liệu độc lập không có Critical/Important. Commit docs-only không đổi tested/deployed production tree.
