# Runtime nội bộ Galaxy OS — bàn giao 2026-09-30

Trạng thái: INTERNAL_RUNTIME_DEPLOYED; CODEX_CLOSED: DEFERRED_BY_USER.
Người dùng yêu cầu ngày2026-09-30: “lát tôi đóng sau. cứ code hoàn thiện đi”.
CROSS_DEVICE_LAN: USER_VERIFIED, người dùng đã xác nhận vào Project → Làm việc. Domain public giữ đóng theo chỉ đạo mới:
**thử nghiệm/làm việc nội bộ ở LAN3000, public domain sau khi ổn định**.
Không redesign Figma, không triển khai thêm M3/provider, không migrate/seed/reset,
không xóa hồ sơ/chat/file/history, không push/merge.

## Kết quả theo bằng chứng

| Mục                           | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUNTIME_ROOT_CAUSE            | Web next dev và API detached thiếu supervisor; chỉ Edge có systemd. Không có chứng cứ khẳng định chính cleanup Codex đã giết process lịch sử. Nay Web/API foreground dưới systemd và Windows keeper độc lập.                                                                                                                                                                                                   |
| LEGACY_UI_ROOT_CAUSE          | Link danh sách và entry Project hardcode stage-1. Cùng Project ID qua /work có workspace mới. Đã thay navigation; không xóa nghiệp vụ stage. Fixture33003 dùng DB/quyền/phòng riêng, không phải bằng chứng dữ liệu main có chat room.                                                                                                                                                                          |
| CACHE_FINDING                 | Chrome không có Service Worker/controller; request mới không từ disk cache/SW, health no-store và request ID khớp journal. Không có căn cứ gọi cache là nguyên nhân.                                                                                                                                                                                                                                           |
| PROCESS_SUPERVISOR            | Newly installed user units galaxy-os-api.service, galaxy-os-web.service, galaxy-os.target; target enabled/Wants đúng hai services. Tái dùng system galaxy-edge.service hiện có. Mỗi process một owner, user hailq_glx, không root.                                                                                                                                                                             |
| WSL_LIFECYCLE_STATUS          | Linger=yes; newly created Windows task Galaxy OS WSL Runtime đúng Admin/Ubuntu-22.04/hailq_glx, Limited, một Linux sleep infinity; IgnoreNew và tối đa ba restart. Refresh Highest chỉ action bảo vệ cố định, đã chạy từ keeper và không đổi rule đang đúng. Logoff/reboot NOT_RUN.                                                                                                                            |
| WEB_API_EDGE_RELEASE          | local-f93ef7df2fbc; code264a195; Web BUILD_ID F6amuzt22vwAHV-bQHkvj. Web production; API compiled local-main với NODE_ENV=development và guard hiện có. Edge cùng artifact. Không gọi toàn bộ API đã đạt production policy.                                                                                                                                                                                    |
| LOCALHOST_STATUS              | Windows health/login200; Chrome phiên hiện có me200, mở cùng Project entry đến /work, đúng release và network mới. API ready200/database connected, schema83/0pending.                                                                                                                                                                                                                                         |
| WINDOWS_LAN_IP_STATUS         | 192.168.1.80/24 trên Ethernet 2, profile Private được xác minh. Windows và Chrome LAN health/login200; Chrome remote192.168.1.80:3000, no-store, đúng release. LAN3001 bị từ chối.                                                                                                                                                                                                                             |
| CROSS_DEVICE_LAN_STATUS       | USER_VERIFIED: người dùng xác nhận từ thiết bị khác cùng LAN đăng nhập và vào được Project → Làm việc. Tool kiểm trên Windows được ghi riêng; không giả có remote executor trên thiết bị đó.                                                                                                                                                                                                                   |
| DOMAIN_INTERNAL_STATUS        | Node TLS Edge hoạt động, upstream Web mới. HTTPS canonical qua --resolve tới LAN443 trả503 có release Edge đúng: PUBLIC_INTENTIONALLY_DISABLED. Không coi --resolve là kiểm DNS/Internet.                                                                                                                                                                                                                      |
| DOMAIN_EXTERNAL_STATUS        | DEFERRED_BY_OWNER / NOT_VERIFIED. Đầu lượt A42.112.252.201, không AAAA; outbound đo được1.55.170.20, chưa xác minh router WAN/CGNAT/hairpin. Không đổi DNS/router/firewall.                                                                                                                                                                                                                                    |
| CODEX_CLOSED_TEST_STATUS      | DEFERRED_BY_USER / NOT_CODEX_CLOSED. Người dùng sẽ đóng sau. Observer đã ghi228request/57đợt đều200 rồi được dừng riêng; keeper/main giữ chạy. Không dùng mẫu khi Codex còn mở để ghi PASS.                                                                                                                                                                                                                    |
| PROJECT_CHAT_UI_STATUS        | Entry đúng workspace, quyền CREATE/ACCESS_ADMIN/LOCK/HISTORY/PUBLISH/INVOKE đúng account. Trong cả9Project của phiên này, API rooms200 nhưng0phòng; transaction READ ONLY xác nhận ChatRoom count0 trong đúng phạm vi9Project. Không có composer phòng trên main khi chưa có phòng. Ô đang thấy là Câu hỏi AI. Login/chat/file/quyền/offline đã PASS trong fixture riêng; không chép room/demo/grant vào main. |
| AUTH_DATA_CONTINUITY          | Hash actor và tập9Project trước/sau giống hệt; me200/300permissions. Cùng DB galaxy_os/storage/config phiên. Cookie từng host riêng: tab LAN mới hiện login, me401 đúng nghĩa chưa có phiên; không copy cookie/auto-login.                                                                                                                                                                                     |
| OLD_CODE_RETIRED              | Bỏ điểm mở hardcode stage-1 và ownership detached của main. Giữ UI nghiệp vụ/deep links còn chức năng; không có component nghiệp vụ dead được chứng minh để xóa.                                                                                                                                                                                                                                               |
| ROLLBACK_STATUS               | Artifact source cũ0e5680a và APIfde08f8 giữ riêng; Web build, fingerprints, Prisma và schema READ ONLY đã kiểm. Recipe emergency có sẵn nhưng chuyển rollback thật NOT_RUN. Giữ new Edge publicfalse; rollback không restore DB, không tự fallback. Bản cũ không có sửa LAN mới.                                                                                                                               |
| LOG_FOLLOW_COMMAND            | pnpm --dir /home/galaxy_os local:logs — journal Web/API; Ctrl+C đã chứng minh không dừng app.                                                                                                                                                                                                                                                                                                                  |
| START_STATUS_STOP_COMMANDS    | pnpm --dir /home/galaxy_os local:up ; local:status ; local:stop — dùng cùng prefix, đã chạy thực. Stop chỉ Web/API; giữ DB/Redis/Edge và Windows keeper.                                                                                                                                                                                                                                                       |
| CODE_SHA / TESTED_SHA         | App:264a19546098d9822f6e9805468c030d0bcb3c2f. CLI tooling:92df5d3b3b1b988da3b57862f3a333d1c2ce63ac. Root adapters/docs:1a59665854c99a1298f47a71c6852917eb2c8e7c. DOCS_COMMIT_SHA là commit chứa handoff này, báo sau commit; không amend tự tham chiếu.                                                                                                                                                        |
| FIGMA_IMPLEMENTATION_BASELINE | Worktree /home/galaxy_os/.worktrees/m2-a-20260928, branch m2/project-chat-20260928; app/UI264a195 cùng tooling92df5d3. Runtime artifact riêng; sửa source không đổi bản phục vụ.                                                                                                                                                                                                                               |
| REMAINING_BLOCKERS            | Đóng Codex thật được người dùng hoãn; LAN từ thiết bị khác/đăng nhập đã được người dùng xác nhận. Main chưa có phòng chat trong9Project được kiểm; tạo/cấp quyền nghiệp vụ qua flow hiện hữu khi người dùng cần, không dùng mutation test trên main. Public domain hoãn; DNS/WAN/cấu hình API production còn cần xử lý trước mở public.                                                                        |
| HANDOFF_PATH                  | /home/galaxy_os/.worktrees/m2-a-20260928/docs/galaxy-os/handoffs/2026-09-30-runtime-repair.md                                                                                                                                                                                                                                                                                                                  |

## Bản phát hành và ownership

Artifact `/home/galaxy_os/.runtime/releases/runtime-repair-20260930` có
`release.json`, API/Web/Edge/dependencies riêng. Source digest cuối:
`8a30c5f0847b15f501a7f0d2e165b7d92ac2df9bade04d8c4d58875be6126576`.
Build từ snapshot dirty đã review; metadata giữ base SHA
`0e5680aa7fd7ad30fe9ef1b6bf220c9bb716bd1b`/dirty gốc, thêm verifiedCodeSha sau
đối chiếu bytes với commit264a195. Sau Web build cuối chỉ refresh hai Python
helper/provenance và sáu Windows source; không sửa build live. Digest build và
fingerprint dùng khi start được ghi riêng; fingerprint runtime bỏ .next/cache.

Manifest hiện hành: `/home/galaxy_os/.runtime/local-runtime.json`.
Private API/Web/Edge env tại `/home/galaxy_os/.runtime/runtime-repair-20260930/`,
mode0600; certificate/storage/keys ngoài artifact và Git. API bind127.0.0.1:3001,
Web0.0.0.0:3000, Edge8080/8443. Unit foreground dùng frozen controller rồi exec
Node; restart on failure/backoff5s, tối đa3lần/60s; không migrate/seed/Compose
khi restart. Target enabled; services được controller start riêng nên target
inactive và individual unit disabled không có nghĩa app stopped.

Process snapshot sau maintenance, **không dùng PID này làm lệnh kill**:
API309735 và Web310056 có PPID470/user manager, exact app cgroups;
Edge308598 có PPID1/system service. Executable /usr/bin/node, cwd đều trong
artifact. Unit Edge cũ được giữ, thêm duy nhất drop-in
`/etc/systemd/system/galaxy-edge.service.d/20-runtime-release.conf`.

WSL NAT eth0 đo được172.31.138.252/20. Không dùng IP này làm hằng số:
Windows refresh đọc đúng eth0, đối chiếu subnet WSL và ownership receipt,
chỉ cập nhật3000→3000,80→8080,443→8443 khi cần. Lượt này cả ba rule đã đúng,
changed0. Firewall Galaxy3000 vẫn Private/192.168.1.0/24; không mở WAN3000/3001,
PostgreSQL/Redis hoặc debugging Chrome. Các task/script Windows newly created,
đúng SID owner; ProgramData chỉ Admin/SYSTEM ghi, Users đọc. Một visible UAC;
không password trong repo, không ExecutionPolicy Bypass/login-policy change.

## Kiểm chứng có thật

Evidence bền ngoài Git:
`/home/galaxy_os/.runtime/runtime-repair-20260930/evidence/` (`index.json`).
Log gốc `/tmp/galaxy-runtime-repair-20260930/`; private manifests/ownership
không nằm trong evidence commit. Các báo cáo chính:

- `main-http-verification.json`: native Windows localhost/LAN app200, LAN API
  refused, Edge503 đúng gate, API/DB ready, bảy request ID khớp journal.
- `lifecycle-verification.json`: dừng fixture33001/33002/33003 không dừng main;
  hai root up đồng thời giữ một stack; logs Ctrl+C giữ PID; dừng API có chủ đích
  làm status PARTIAL và Web/login503, WebPID giữ nguyên; API restore READY;
  root stop đóng hai main port rồi root up STARTED_READY. Không stop Docker/WSL.
- `browser-project-after.json`: entry cùng Project trả response200, URL cuối
  `/projects/50000000-0000-4000-8000-000000000003/work`; remote127.0.0.1:3000,
  không diskcache/SW. Textarea1 là AI, không dùng nó chứng minh composer chat.
- `browser-network-{before,after}.json`: cùng actor hash/tập Project hash,
  me200/300permissions/9Project, SWcount0. Request `e266d7c0-a8d8-4e68-9e6e-e5463644b961`
  và entry `c1a807ec-c7c6-4418-80d4-b910687987d8` khớp journal Web/API.
- `browser-network-lan-after.json`: login form thật trên HTTP LAN, me401 do
  host chưa có phiên, fresh health200/release đúng/remote192.168.1.80:3000.
- `browser-main-room-scope.json`, `main-room-count-read-only.json`:9Project,
  rooms API200/0phòng và SQL COUNT READ ONLY0; không mutation/grant tự động.
- API1224/1224 (`full-api.log`); Web543/543 (`web-final-regression.log`);
  Edge5/5 (`task2-public-edge-green.log`); runtime22+release3
  (`final-runtime-check.log`); document placeholder1
  (`document-placeholder-authorized.log`). Full relevant lint/typecheck/build/
  format đạt. Giữ warning mock UploadsService, AnyIO và no-img-element sẵn có.
- Browser candidate HTTPS3/3, HTTP1/1: login/text/file/reload/download,
  viewer/revoke chỉ fixture, retry idempotency/offline giữ draft/trạng thái.
  HTTP fixture loopback không thay phép thử LAN vật lý. Chrome LAN thật chứng
  minh randomUUID undefined/getRandomValues hoạt động; regression ép UUID
  undefined đã RED→GREEN, mọi caller dùng lại createCommandKey hiện hữu.

Web instanceId là **execution-context marker**: Next middleware và health/BFF
có thể khác UUID trong cùng PID. Đối chiếu process bằng MainPID/cgroup/cwd,
release/fingerprint và request log, không suy hai server từ hai UUID.

Review correctness/security/auth/UX và Ponytail đã thực hiện; các finding về
public default gate, failure cleanup ownership, exact Origin, provenance và
HTTP LAN crypto đều đã sửa/test. Requested routing Sol high implementation,
Astra high lifecycle/security review, Luna inventory giới hạn; metadata model
thực thi UNVERIFIED. Một source writer và một service/network controller.

## Chính sách host/auth và domain

Exact HTTP origins chỉ `http://localhost:3000` và
`http://192.168.1.80:3000`. BFF bỏ Secure chỉ trên exact session cookie của
origin HTTP được phép; HttpOnly/SameSite/Path/Origin-CSRF giữ nguyên. HTTPS giữ
Secure và cần private Edge proof; Edge ghi đè forwarded metadata/proof, không
đưa secret ra browser/log/API. API nội bộ; browser thiết bị khác dùng same-origin
BFF, không gọi localhost3001 của thiết bị đó. Host/cross-origin không hợp lệ bị
chặn. Lỗi API/mất mạng không rơi về legacy hoặc báo đã gửi/lưu giả.

Public hiện false ở Web/Edge, kể cả prefetch/upgrade. Node TLS Edge/certificate
hiện có được giữ; SAN os.galaxycentre.vn, chain tin cậy, hạn
2026-10-20T09:54:02Z. ACME path giữ nguyên; renewal không được thử trong lượt này.
API production env còn thiếu các giá trị mail/quota/trust policy thực cần thiết;
không giả cấu hình để đổi NODE_ENV. Trước public cần đối chiếu DNS/WAN/router,
certificate và API policy, xin đúng quyền nếu phải đổi DNS/router. Không thêm
Nginx/Caddy/Tunnel hoặc proxy thứ hai.

## Giữ/gỡ và nền Figma

| Nhóm                | Phạm vi cuối                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| KEEP                | Project/Lead/Task/chat/file/history/migration/ledger, IAM/backend writers, Node Edge và deep links nghiệp vụ.          |
| REPLACE_NAVIGATION  | /projects links → /projects/:id; entry M2 bật → /projects/:id/work. Cùng ID và backend.                                |
| DISABLE_OLD_STARTUP | Main detached Web/API đã dừng bằng fresh ownership. Root và prod aliases cùng controller; không tự chọn G00/branch cũ. |
| RETIRE_CODE         | Chưa có business component dead được chứng minh; không xóa form còn chức năng.                                         |
| KEEP_FOR_ROLLBACK   | Worktree M2, source/API artifacts cũ, frozen rollback và cutover backup; không xóa dữ liệu.                            |

Route/components để đối chiếu Figma:
`apps/web/app/projects/page.tsx`, `apps/web/app/projects/[projectId]/page.tsx`,
`apps/web/app/projects/[projectId]/work/page.tsx`, `/work`;
`apps/web/features/project-chat/{project-chat,chat-controls,project-ai}.tsx`.
Giữ Tổng quan/stage-1, products, files và các nghiệp vụ còn dùng. Contract
`/api/v1/projects`, `/api/v1/project-chat`, room/grant/scope, upload/file/history,
command idempotency và quyền backend không được phá hoặc tạo domain song song.

Giữ [M2-A VERIFIED và trạng thái M3 đã triển khai/provider chưa cấu hình](../milestones/M2/HANDOFF.md)
cho đúng source/phạm vi lịch sử. Không chạy lại clock/migration campaign; hai
binary thiếu baseline vẫn chưa phục hồi. Không gọi AI thật đã hoạt động.

Sau code Figma: build snapshot mới ở thư mục release mới bằng recipe đã kiểm
`scripts/prepare-local-release.py`; smoke stack fixture riêng, ghi source/build/
digest/schema, review manifest/units và chuyển có kiểm soát như lượt này.
Không ghi đè .next/artifact đang chạy. Private data/env/keys giữ ngoài artifact;
không cần merge Git để chạy release đúng. Chưa tạo lệnh deploy-local tự động.

Lệnh vận hành đã chạy thực (từ bất kỳ cwd):

```sh
pnpm --dir /home/galaxy_os local:up
pnpm --dir /home/galaxy_os local:status
pnpm --dir /home/galaxy_os local:logs
pnpm --dir /home/galaxy_os local:stop
pnpm --dir /home/galaxy_os prod:health
pnpm --dir /home/galaxy_os prod:verify-artifacts
```

Log-follow không giữ sống app. `prod:health` dùng status và exit1 nếu không READY;
`prod:verify-artifacts` kiểm browser bundle của artifact được chọn. Sau mỗi release kiểm status (identity+schema+HTTP),
Windows localhost/LAN/login, Chrome cùng account/Project/capability, API LAN
không mở và Edge public gate đúng. Nếu mở public sau này, kiểm domain nội bộ
và từ Internet riêng, không dùng --resolve thay cả hai.

Rollback rõ ràng: frozen source0e5680a tại
`/home/galaxy_os/.runtime/releases/rollback-0e5680a-20260930`, Web build
`AZ4XOzCSAkiLx-HLJT4wb`; manifest/units riêng dưới
`/home/galaxy_os/.runtime/runtime-repair-20260930/rollback/`.
Recipe từng thao tác tại evidence `ROLLBACK-AND-OBSERVER.txt`, **NOT_EXECUTED**:
stop đúng owner, đổi only Web/API manifest/units sang frozen old artifact,
daemon-reload/start/check lại; giữ new Edge publicfalse, giữ mọi dữ liệu/schema.
Old dev Web dùng cho emergency localhost; bản cũ không giải quyết LAN mới.
Không restore raw manifest trỏ mutable source, không restore DB cũ.

## Checkpoint cho phép thử đóng Codex

Windows observer: task **Galaxy OS Runtime Observer**, Limited, không trigger,
chỉ native HTTP, không wsl.exe polling, không cookie/auth state.120sample/10s,
request timeout5s; kiểm localhost/LAN health+login với release marker mới.
Directory log: `C:\Users\Admin\AppData\Local\GalaxyOS\observer\`.
Observer đã start và có16row đầu (4sample ×4URL) đều200/no-store/releaseMatches,
16request ID riêng. Log thực:
`C:\Users\Admin\AppData\Local\GalaxyOS\observer\observer-20260930-090514.jsonl`.
PID21352, parent1052, đúng owner Admin/Limited; không thuộc shell/tool Codex.
Receipt `/home/galaxy_os/.runtime/runtime-repair-20260930/observer-start-receipt.json`.
Người dùng sau đó hoãn thao tác đóng Codex. Observer đã được dừng riêng sau
228request/57đợt từ09:05:14Z đến09:14:48Z, tất cả200/no-store/releaseMatches,
228request ID riêng,0lỗi. Đây là steady-state observation khi Codex còn mở,
**NOT_CODEX_CLOSED**, không thay phép thử được hoãn. Keeper/main không dừng.
Receipt `/home/galaxy_os/.runtime/runtime-repair-20260930/observer-deferred-receipt.json`;
log bền `observer-before-user-close.jsonl` trong cùng thư mục. Khi người dùng
sẵn sàng, chạy lại đúng task đã cài từ Windows PowerShell thường:

```powershell
Start-ScheduledTask -TaskName 'Galaxy OS Runtime Observer'
```

Lệnh này đã chạy thực trong lượt trước; mỗi lần tạo logfile mới cùng directory.
Task IgnoreNew ngăn chạy trùng. Kiểm mẫu đầu rồi mới đóng Codex; không dùng log
cũ để xác nhận một khoảng đóng diễn ra sau đó.

Sau khi observer có mẫu đầu đúng, người dùng đóng Codex/VS Code và terminal
WSL trong60giây, giữ Windows thức/có mạng, mở lại và báo đã thử. Đọc log native
trong đúng khoảng đóng, đối chiếu journal và refresh Project cùng phiên; chỉ
sau đó mới cập nhật CODEX_CLOSED_TEST_STATUS. Không tự kill phiên, reboot,
shutdown distro hoặc logoff. Máy ngủ/tắt/mất mạng không phải online24/7.

## Rà soát cuối sau yêu cầu tiếp tục

- Installed audit mới xác nhận main READY, cùng API309735/Web310056, exact
  candidate/unit/cgroup; target enabled/Wants API+Web; linger=yes, Edge active.
  Không restart app, đổi mạng hoặc ghi DB trong rà soát này. Receipt
  `final-installed-runtime-audit.json` trong private runtime folder.
- DATABASE_URL và SESSION_COOKIE_NAME trước/sau bằng nhau. FILE_STORAGE_PATH,
  LOCAL_UPLOAD_PATH, AVATAR_STORAGE_PATH đều explicit/absolute/không đổi và
  nằm ngoài artifact. Files/uploads tồn tại; avatar path không có directory,
  không tự tạo file hoặc coi đó là khôi phục binary. Receipt
  `storage-config-continuity.json` không chứa giá trị env hoặc credentials.
- Rà soát phát hiện `prod:health` chỉ kiểm liveness, `status` PARTIAL vẫn exit0,
  còn `prod:verify-artifacts` đọc `.next` trong source thay vì artifact được chọn.
  Đã cho hai shell helpers dùng cùng controller/manifest; status không READY
  exit1, verifier kiểm fingerprint và bundle tại Web cwd trong manifest, lỗi
  đọc/thiếu bundle phải thất bại. Không in nội dung bundle hoặc env.
- RED→GREEN cho bundle được chọn bị rò marker, source cũ gây báo sai, bundle
  thiếu/không đọc được và mã thoát PARTIAL. Thêm test chạy shell/controller
  thật: bỏ sys.exit chỉ trong bản sao tạm làm test fail; bản đúng pass.
  CLI8/8, toàn runtime30/30 và release3/3 đạt. Không chạy lại API/Web/clock/
  migration campaign vì code ứng dụng không đổi.
- `prod:health` và `prod:verify-artifacts` chạy thực từ cả root và canonical
  đều đạt (4/4), giữ API309735/Web310056, schema83 đã đối chiếu read-only.
  Không restart, không sửa artifact live hoặc database. Evidence mới:
  `cli-{red,entry-red,green,runtime-full,release-full}.log`,
  `cli-main-readonly-verification.json`, `cli-review.json` trong evidence folder.
- Tooling follow-up commit `92df5d3b3b1b988da3b57862f3a333d1c2ce63ac`;
  root adapters/docs `1a59665854c99a1298f47a71c6852917eb2c8e7c`.
  Web/API/Edge và frozen controller của
  systemd vẫn thuộc app code264a195/release local-f93ef7df2fbc. Root entry dùng
  controller source mới cho CLI. Không sửa metadata artifact để giả là đã rebuild.
- `docs/internet-deployment.md` đánh dấu Tunnel/Caddy là phương án lịch sử;
  chỉ dẫn hiện hành dùng Node TLS Edge và handoff này. Target không tự chạy
  PostgreSQL/Redis hoặc migrate khi restart.
