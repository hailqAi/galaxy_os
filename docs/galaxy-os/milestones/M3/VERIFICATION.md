# M3 — Kiểm chứng AI đa nhà cung cấp

## 05/10 — AI floating chat + typography và provider live

Thiết kế owner approved current prompt, thực thi INLINE. CODE_SHA=TESTED_SHA
`11af11543196b80dc6f35abbfba9b1b329768390`, TESTED_TREE `3d1386054b8494db092efca10393e21efc2a39fc`; local release `local-df7ba5a5c974`.
[Handoff hiện hành](ui-figma/HANDOFF.md), [live provider receipts](ui-figma/ACTIVATION.md).

| Gate                     | Kết quả mới / log trong `.runtime/ai-floating-ui-evidence/task-logs/`                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| API full isolated        | 70files,1274PASS+1skip; `t5-api-full.log`                                                                    |
| Web full sau review      | 39files,560PASS; `t5-web-after-review.log`                                                                   |
| Edge / document / Python | 5 / 1 / 41PASS; `t5-full-test.log`, `t5-document-authorized.log`, `t5-python.log`                            |
| Lint / types / format    | PASS; `t5-lint-final.log`, `t5-types-accepted.log`, `t5-format-accepted.log`                                 |
| Chrome final             | 12/12PASS; `t5-browser-final.log`, screenshot/computed tại `t5-accepted/`                                    |
| Build artifact           | API/Web/Edge PASS snapshot sạch; `t5-release-build.log`                                                      |
| Review                   | 0Critical,2Important sửa RED→GREEN,0Minor; ledger/review receipt giữ cùng evidence                           |
| Cutover / config         | READY; store so sánh toàn nội dung trong RAM không đổi,3revision và Kira text evidence giữ nguyên            |
| Main / LAN               | Chrome popup560px/16–26/112px và cùngsession/9Project; Windows3000/LAN200, public503, Edge/keeper giữ nguyên |
| Vendor thật              | KiraPASS3câu; Gemini partial503; Mistral429; nguồn Project/citationlive chưa đạt                             |

Không nới assertion đểPASS: ca mới ban đầu đọc route trước Next navigation hoàn tất
và thiếu marker source riêng; sửa setup/wait đúng route, giữ assertion. Một lần P04
cold navigation chưa hiện composer trong5s; chẩn đoán riêngPASS3.3s và fullfinalPASS,
không đổi timeout/source để che lỗi. Logfailed giữ nguyên. Root `pnpm test` lần đầu
TooManyConnections do API fixture giữpool; dừng fixtureAPI rồi nguyênAPI suitePASS.
Web/Edge trong rootlog đãPASS; document sandbox bị treo socket, dừng đúng testPID,
chạy có quyền socket đạt1PASS. Không sửa guard/rate limit, DB hoặc chiến dịch clock.

Lệnh API: nativeNode `--env-file=scripts/m3-isolated.env.example`, `taskset -c0,1`,
spawn `pnpm --filter @galaxy/api test`; guard xác minh DBfixture/user cô lập. Web:
`pnpm --filter @galaxy/web test`; lint/types/format theo root scripts. Chrome dùng
`playwright.m2.config.ts`, `m3-project-ai.spec.ts` và `m3-pdf-workspace.spec.ts`,
productionfixture/TLS33003/ChromeCDP33005, `GALAXY_NATIVE_ZOOM=true`. Dừng các runner
fixture sau khi sao chép evidence; giữ profile/session người dùng và localhost3000.

Release dùng `prepare-local-release.py build/units` và recipe lock/preflight/rollback
hiện hữu; chỉ Web/API đổi artifact. Không key/envprivate trong artifact hoặcGit.
Scan giá trị credential trong diff/logevidence bằng boolean nội bộ: không thấy;
không in dấu vân tay secret. Main smoke chỉ GET và nháp RAM không gửi hồ sơ.
Bàn phím mobile là kiểm viewport thấp, thiết bị thật UNVERIFIED. Live citation/source
đang chờ owner lựa chọn fixture target; không biến mock hoặc admin text thành RAGlive.
Các mục04/10 bên dưới là bằng chứng lịch sử.

## Đối soát key — bản sửa T1 local79e2ba59dd6d — 04/10/2026

CODE_SHA=TESTED_SHA `e7ad61d8c739fbcb053ad0bc8b9e5bafc4d917a3`, TESTED_TREE
`ee4f0204a9fc04357da4f2f4692d2f0b7d9cecdd`. Scope: resolver/status CLI,
registry diagnostics, nhãn và refresh revision của UI quản trị. Popup/typography
chưa triển khai, chờ duyệt thiết kế; vendor live NOT_RUN. Không coi baseline hoặc
kết quả worktree khác là nghiệm thu runtime mới.

| Kiểm tra              | Kết quả/bằng chứng mới                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Python                | 41 PASS; `python-complete.log`; targeted8 PASS sau sửa cuối                                |
| API                   | 70files,1274 PASS+1skip; `api-full.log`; không sửa API sau lần này                         |
| Web                   | 38files,558 PASS; `web-full.log`; không sửa Web sau lần này                                |
| Edge/document         | 5/1 PASS; `edge-authorized.log`, `document-authorized.log`                                 |
| Lint/typecheck/format | PASS; `lint.log`, `typecheck.log`, `format-final.log`; img/AnyIO warning baseline còn      |
| Source build          | PASS HTTPS fixture; `build-https.log`                                                      |
| Chrome AI             | 4 PASS; `browser-ai.log`: settings revision, lưu/history/model/source/revoke và đổi actor  |
| Chrome pages          | 4 PASS; `browser-pages.log`: S01/P01/P03/P04/P05/P06 và viewer/version, cùng build fixture |
| Review                | Ponytail/correctness/security/auth/UX T1 không còn blocker cụ thể; reviewer read-only      |
| Artifact              | Snapshot sạch/build API+Web+Edge PASS; `release-build.log`; candidate `ARTIFACTS_VERIFIED` |
| Cutover               | READY; `cutover.log`, store ngoài artifact; rollback code/config có sẵn                    |
| Main Chrome           | `main-after.json/log`: release đúng, session/Project-set giữ nguyên, UI EMPTY_STORE đúng   |
| Runtime               | `t1-after.json`: API434812 đúng user/cwd/store; metadata/mtime store bằng trước cutover    |
| Network/supervisor    | `network-after.log`: localhost/LAN200, API LAN private, public503; keeper/Edge giữ nguyên  |

Evidence tại worktree canonical `.runtime/ai-floating-evidence/`, chỉ metadata an
toàn/log fixture; không secret/cookie/body Project/ảnh profile vào Git. Chứng từ
RED→GREEN cũ do agent báo được ghi rõ transcribed trong `t1-receipts.md`; raw logs
`t1-evidence-validation-{red,green}.log` và `t1-compatibility-{red,green}.log` có thật.
Không đổi log failed thành PASS: `build.log` lần sandbox không hoàn tất; build đầu
có lỗi HTTP origin (`build-authorized.log`), đã dùng HTTPS test đúng contract;
Python/Edge test trong sandbox lỗi socket EPERM, document test bị dừng, các log gốc
được giữ và rerun với quyền socket test riêng đã đạt. Đây không phải vendor negative
load test. Không migration/clock campaign, không reset DB hoặc thay credential thật.

Lệnh đã chạy, với cwd worktree canonical:

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
pnpm lint
pnpm typecheck
pnpm format:check
pnpm --filter @galaxy/web test
pnpm --filter @galaxy/edge test
services/document-ai/.venv/bin/pytest services/document-ai
```

API full dùng env `scripts/m3-isolated.env.example`, isolation guard và taskset0,1
cho runner (giữ nguyên main DB và URL). Build nhận cùng test env, thêm
`APP_PUBLIC_ORIGIN=https://localhost:33003`. Production fixture phục vụ qua
`scripts/m2-a-serve.mjs api --ai-fixture` và `web --production`, TLS runner hiện hữu;
Playwright config `apps/web/playwright.m2.config.ts`, hai spec `m3-project-ai.spec.ts`
và `m3-pdf-workspace.spec.ts`, native Chrome bridge33005, context/account/DB riêng.
Đã dừng ba runner test của lượt này; giữ nguyên context Chrome localhost3000.
Không chuyển người dùng sang33003.

Release bằng `prepare-local-release.py build/units` hiện hữu, recipe giới hạn ở
`/home/galaxy_os/.runtime/ai-config-20261004`. Review phát hiện rollback gap trước
cutover: đã sửa partial-old-stop và cleanup-failure không bỏ restoration, re-read
baseline/backup dưới lock; bốn fake-runtime case PASS. Không dùng kiểm fake rollback
làm bằng chứng đã rollback runtime thật; candidate READY nên không phải chạy rollback.

CREDENTIAL_ROOT_CAUSE vẫn NOT_PROVEN: store canonical thật rỗng, tất cả nguồn env
có căn cứ đã đối chiếu không chứa key, nhưng chưa biết entrypoint người dùng đã nhập.
Không yêu cầu nhập lại trước đối soát nguồn đó. Ba provider độc lập, text live NOT_RUN;
Gemini image/PDF disabled; SYNTHETIC_PUBLIC_APPROVED và DENIED real-project giữ nguyên.
Không có provider/request ID vendor thật để báo; mọi request browser ghi là fixture.

[AI floating chat + typography: thiết kế chờ duyệt và kết quả thật](ui-figma/HANDOFF.md).
Các phần dưới là lịch sử trước bản T1; không thay các trạng thái chưa đạt ở trên.

## Cập nhật 04/10 — UI PDF đã phát hành, live AI còn thiếu credential

Release hiện hành `local-49bd3faf2e63`, code/tested `de274d3e1c38dfb0136fee25334f031b95eb328b`,
tree `030849c361c7c34f64ee6373c4fe715ac7473b57`. [Bàn giao UI và trạng thái cuối](ui-figma/HANDOFF.md)
chứa manifest PDF/function map/deviations, activation và evidence theo UNIT/INTEGRATION/
CHROME/LIVE_PROVIDER. API1272/Web557/Edge5/document1/Python37 và Chrome28 theo nhóm
cùng build đạt; main/LAN/session/public gate/keeper/logs đã kiểm. Web flag AI đã đồng bộ.
Cả3provider configLoaded=true nhưng credentialConfigured=false; live NOT_RUN.
Các kết quả và release bên dưới thuộc lượt03/10, không thay trạng thái hiện hành.

## Nền được xác minh

Baseline release `local-f93ef7df2fbc`; HEAD đầu lượt `3c27d94fa4191fd898fd2e08e65ee0ccecc4d930`,
worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`.
Không reset/clean/stash/amend, không đổi migration ledger/schema83, không dữ liệu main
sang provider. Giữ source tách artifact và public closed.

## Kiểm thử source

| Gate                                                     | Kết quả                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm lint`                                              | PASS API/Web/Edge + Ruff                                                            |
| `pnpm typecheck`                                         | PASS API/Web/Edge                                                                   |
| `pnpm test` với `scripts/m3-isolated.env.example`        | API1246, Web545, Edge5, document-service1 PASS                                      |
| `pnpm --filter @galaxy/web test` sau sửa nhãn lỗi        | Web547 PASS; thêm hồi quy lỗi nguồn/cấu hình và fallback trạng thái tiếng Việt      |
| `pnpm format:check`, `git diff --check`                  | PASS                                                                                |
| `python3 -m unittest discover -s scripts -p 'test_*.py'` | 36 PASS: runtime/release + secret CLI                                               |
| Native local                                             | 3 PASS gồm PDF1trang thực, checksum/version/magic; không phải provider live         |
| Chrome154 M2 production fixture                          | 21/21 PASS: chat/file/publication/quyền/revoke/retry/mobile/navigation              |
| Chrome154 M3 dev fixture                                 | 3/3 PASS: model/citation/history/revoke/actor                                       |
| Chrome154 M3 production fixture                          | 3/3 PASS; assertion nháp sau khi retry hoàn tất                                     |
| Review correctness/security/auth/UX + Ponytail           | Không còn Important/Critical sau sửa; reviewer read-only, model metadata UNVERIFIED |

Sau full regression, bản sửa cuối chỉ đổi nhãn lỗi Web và fallback trạng thái.
Web547, lint/typecheck/format, Chrome M3 production3 đã chạy lại và PASS; API/M2
không đổi source so với lượt full regression. Build snapshot cuối từ commit sạch
`d8ce57d` và kiểm Chrome main trên đúng release cuối.

Log đã giới hạn thông tin: `.runtime/ai-multi-evidence/` trong worktree (ignored).
Các log chính: `full-test-final.log`, `lint-final.log`, `typecheck-final.log`,
`format-final.log`, `python-final.log`, `browser-m2-production.log`,
`browser-m3-production.log`, `web-test-final.log`, `ui-error-red.log`, `ui-status-red.log`. Artifact build/cutover được ghi riêng khi hoàn tất.

Các red→green có ý nghĩa: host/effort/secret allowlist, provider mapping và thought
filter; policy/config/key thay trong I/O; cancel reservation; legacy env không còn
outbound. Fixtures dùng hai tenant/Project/room và ACL/history/publication cũ của M3.
Native PNG đi đúng Gemini+version/citation, text-only từ chối raw binary; parser PDF
thực kiểm1trang. Không có provider file handle, nên expiry/replay handle N/A.

M3 browser kiểm Gemini→Kira→Mistral cùng conversation/index, nhãn answer cũ; lost POST
retry giữ model và payload, giữ nháp khác sau completion; saved model disabled
không fallback; lỗi 409 model bị tắt hiển thị tiếng Việt; source mở đúng và reload; revoke/đổi actor ẩn dữ liệu dẫn xuất.
M2 navigation thực không đủ điều kiện BFCache do no-store; kiểm reload/revalidation
thực PASS, không đổi kết quả đó thành BFCache-restored PASS.

Lỗi môi trường đã tách: sandbox không cho bind socket → test chạy bằng công cụ
escalated đúng fixture; lần browser đầu thiếu dataPolicy trong config giả đã sửa;
fixture API chạm limiter30 sau các run lỗi → restart riêng test API, không nới auth.
M2 nút retry bị React dev double effect thay thế → chạy production fixture,21PASS.
Không bỏ qua failure để gọi PASS. Không lặp chiến dịch clock/migration.

## Trạng thái từng provider — hiện tại

| Thuộc tính              | Google Gemini                    | Mistral                      | Kira                      |
| ----------------------- | -------------------------------- | ---------------------------- | ------------------------- |
| Provider/model          | google_gemini / gemini-3.8-flash | mistral / mistral-medium-3-5 | kira / kira-3.5-pro       |
| ADAPTER_IMPLEMENTED     | YES                              | YES                          | YES                       |
| CREDENTIAL_CONFIGURED   | NO                               | NO                           | NO                        |
| MODEL_ACCESS_VERIFIED   | NO                               | NO                           | NO                        |
| TEXT_LIVE_VERIFIED      | NO                               | NO                           | NO                        |
| IMAGE/PDF_LIVE_VERIFIED | NO; native đã code, vẫn tắt      | NOT_ENABLED                  | NOT_ENABLED               |
| PROJECT_RAG_VERIFIED    | MOCK_ONLY                        | MOCK_ONLY                    | MOCK_ONLY                 |
| DATA_POLICY_MODE        | SYNTHETIC_PUBLIC_APPROVED        | SYNTHETIC_PUBLIC_APPROVED    | SYNTHETIC_PUBLIC_APPROVED |
| LIVE_TEST_RESULTS       | BLOCKED_BY_CREDENTIALS           | BLOCKED_BY_CREDENTIALS       | BLOCKED_BY_CREDENTIALS    |

Không có call provider thật trong lượt này. Không hỏi model tự nhận danh tính làm
bằng chứng; Kira upstream UNVERIFIED. Không đơn giá tiền giả hoặc tự bật billing.
Chủ dự án chọn không giới hạn lượt/ngày; technical concurrency/input/output còn giữ.
Không có Project thật nào được duyệt egress. Cả lịch sử/answer cũ/nguồn mới đều kiểm
policy lại khi chuyển model; dữ liệu doanh nghiệp không được gửi trong pilot.

## Release local — đã chuyển và nghiệm thu

| Trường                     | Bằng chứng/kết quả                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| BASELINE_RELEASE           | `local-f93ef7df2fbc`                                                                                                  |
| WORKTREE / BRANCH          | `/home/galaxy_os/.worktrees/m2-a-20260928` / `m2/project-chat-20260928`                                               |
| CODE_SHA / TESTED_SHA      | `d8ce57d0bb5c1faeabfe7f9f1fab5698af8a732b`                                                                            |
| TESTED_TREE                | `ccf923f8a10260d6cc6e0f5dc61b2e17e68c2519`                                                                            |
| DOCS_COMMIT_SHA            | Commit cập nhật báo cáo này; SHA chính xác ghi trong phản hồi bàn giao, không tự ghi hash vào nội dung tạo ra hash đó |
| DEPLOYED_LOCAL_RELEASE     | `local-b5045512d8b0`                                                                                                  |
| SOURCE_DIGEST              | `b5045512d8b0246bb164326f8e9d2f740029d63e724a2c1713357757769c0c59`                                                    |
| WEB_BUILD_ID               | `k57b305NIZtnpq1v4bAsA`                                                                                               |
| ARTIFACT                   | `/home/galaxy_os/.runtime/releases/ai-multi-20261003-r2` — build Web/API/Edge PASS từ source commit sạch              |
| SCHEMA                     | 83 migration, fingerprint giữ nguyên; không migration/ledger/DB restore                                               |
| SYSTEMD                    | API367712, Web367713 READY; root `local:up` tái sử dụng nguyên PID                                                    |
| SECRETS_AND_EGRESS_STATUS  | API process nhận đúng `GALAXY_AI_CONFIG_FILE`; không có3key trong Web env; key file chưa có, không ghi placeholder    |
| MODEL_SELECTOR_STATUS      | Chrome154 tại `http://localhost:3000/` PASS:3 lựa chọn disabled đúng NOT_CONFIGURED; admin settings200; reload PASS   |
| MODEL_SWITCH_MEMORY_STATUS | MOCK/CHROME_FIXTURE_VERIFIED: giữ conversation/index/history đúng quyền, không copy room/Project                      |
| FILE_CAPABILITY_STATUS     | Text/RAG mock PASS; Gemini native PNG/PDF contract/local parser PASS, live tắt; Mistral/Kira text-only                |
| M2_RUNTIME_REGRESSION      | API1246/Web547/Edge5/Python1 + runtime/CLI36 + Chrome production24 PASS; main9Project/300permission/0room             |
| PUBLIC_DOMAIN              | REMAINS_CLOSED: Edge HTTPS public host503; HTTP308 chỉ redirect tới HTTPS                                             |
| EDGE / KEEPER              | Edge PID308598 không đổi; Windows `Galaxy OS WSL Runtime` Running, không đổi owner/distro/task                        |
| LOCAL / LAN                | Chrome localhost3000 và health LAN192.168.1.80:3000 cùng release,200                                                  |
| REMAINING_BLOCKERS         | Khóa thay thế của3provider; model access/text/RAG live và ảnh/PDF live chưa kiểm; business egress chưa được duyệt     |
| FIGMA_HANDOFF_PATH         | `docs/galaxy-os/milestones/M3/HANDOFF.md`                                                                             |
| GIT_PUSH_MERGE             | NOT_PERFORMED                                                                                                         |

Người dùng đã tự đăng nhập lại đúng localhost sau phiên cũ401; không auto-login,
không copy cookie LAN hoặc thay session bằng fixture. Panel Hỏi AI được kiểm trực
tiếp trên runtime main, screenshot chỉ panel (không secret/nội dung Project) ở
`.runtime/ai-multi-evidence/main-model-selector.png`. Không tạo room/demo/index ở9Project.
Các thao tác gửi/đổi model/mở nguồn có dữ liệu dùng Chrome fixture riêng; main chưa
có key nên nút gửi disabled đúng nghĩa, không giả call thật.

Receipt: `release-build-final.log`, `cutover-final.log`, `deployed-status.json`,
`deployed-artifacts.log`, `systemd-config.json`, `main-browser.json`,
`root-local-up.json`, `lan-health.json` trong thư mục evidence ignored. Artifact verifier báo
`ARTIFACTS_VERIFIED`; schema preflight read-only so sánh đúng baseline. Source edit/
commit docs sau build không đổi artifact đang phục vụ. Thiếu3key không làm health lỗi.

Rollback code/config đã chuẩn bị tại
`/home/galaxy_os/.runtime/ai-multi-20261003-r2/rollback/`: giữ manifest và2unit cũ,
artifact/private env baseline vẫn còn. Cutover giữ lifecycle lock chung với keeper,
chỉ dừng đúng2user-unit đã xác minh owner rồi đổi manifest/unit, daemon-reload,
start và kiểm health; không sửa Edge/DB/storage. Rollback thực không cần chạy vì
candidate READY. Không restore DB đè dữ liệu mới. Nếu rollback nền AI cũ sau khi đã
có dữ liệu đa provider, phải review gate policy/history hoặc tắt AI trong cấu hình
rollback; không dùng code cũ để vượt egress mới.

Đóng Codex thật, reboot/logoff vẫn deferred theo quyết định trước; không chạy lại
chiến dịch clock/migration/LAN đã nghiệm thu. Giai đoạn Figma chưa bắt đầu; M4,
OCR dịch vụ, tạo/chỉnh ảnh/video/TTS/CAD không được bật.

[Handoff/Figma và contract](HANDOFF.md) là tài liệu bàn giao trong bộ M3.
