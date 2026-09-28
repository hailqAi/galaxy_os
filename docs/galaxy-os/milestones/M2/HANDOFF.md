# M2 — Bàn giao triển khai

## Hiện hành — Chrome hiển thị, M2-A PARTIAL, 2026-09-28

Người dùng đã đăng nhập được **bản cũ http://localhost:3000/projects** trong Chrome Windows hiển thị riêng; Codex kết nối đúng phiên qua MCP, điều hướng đọc-only và /api/v1/me200. Code M2-A vẫn ở worktree riêng, chưa tích hợp vào bản3000. Đã sửa binary publication bị generic file.delete/update/restore vô hiệu hóa, session fixture logout lẫn phiên điều khiển, và tiêu chí kiểm navigation/no-store reload. Chưa đủ điều kiện sang M3.

- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, RESUME_START_SHA `5d6690b6c1ce5f08b2c52ddb810a6b36f57bca6d`.
- CODE_SHA `338b7b18581387bf2b1d6412c3b921670de70395`; TESTED_SHA ứng dụng `0a216ebab2109e6c6a2c444071fd4e6a671c22d5`; TESTED_TREE `7f5b3d462b2f3bd031cbcd772b597630e6467185`. Docs commit riêng sáu canonical files, hash bằng `git log -1 --format=%H -- docs/galaxy-os/milestones/M2/HANDOFF.md`; không self-amend. TESTED không có nghĩa mọi test PASS. Commit338b7b1 sau đó chỉ thêm cwd Windows vào MCP config đã kiểm bằng native CLI; source/test ứng dụng giữ nguyên so với0a216eb. Tooling config tree d93b60c2d94fa25a74f3aa94f357fccac51a320e, không gọi đó là app tree đã chạy full suite.
- Unit file52/52; targeted technical1PASS có bytes thật và deny delete; Web508/508; root lint/typecheck/build/schema/format PASS. FullAPI1/2 và repeat10 NOT_RUN vì gate clock nhiễu. Browser cuối targeted4:3PASS/1FAIL, CLOCK_CONTAMINATED; full browser NOT_RUN. Không gộp targeted thành full.
- Lỗi browser cuối là `reconnect retries a committed send with the same key and clears a recovered polling error`, setup composer mất sau GETmessages404: API08:04:39 trước grant08:07:38, hasFutureGrant=true. Cross-tab, hostile upload/retry và document Back/revoke đạt theo lớp trong cùng lượt, chưa nghiệm thu clock sạch.
- BFCache ở Chromium134: NOT_ELIGIBLE_CONFIRMED (no-store main/XHR và browsing instance); đường reload/back thật kiểm lại quyền và ẩn room sau revoke. Không gọi BFCache restore PASS. Chrome154 tương tác chưa kiểm BFCache; không bỏ no-store.
- Clock: Windows ổn trong mẫu45giây, WSL nhảy ~183giây; chưa chứng minh tác nhân. Timesyncd active, Hyper-V implicit sync bật; W32Time stopped. Chủ máy cho phép thử dừng tạm nhưng OS đòi xác thực. Người dùng chưa thể chạy lệnh, yêu cầu tiếp tục code độc lập. Không tự sửa clock hay vô hiệu dịch vụ.

### Developer tooling — không phải M3

**Chrome:** Google Chrome Windows154.0.8037.57, PID12108 lúc kiểm, VisibleWindow=true. Profile persistent thường `%LOCALAPPDATA%\GalaxyOS\ChromeDev`, không Incognito, không profile cá nhân. Debugger thực tế chỉ127.0.0.1:33004 Windows. WSL không nối được bằng loopback trực tiếp nên MCP chạy cùng phía Windows qua stdio cmd.exe. Cơ chế browser-url, không autoConnect vào default profile. Không remote-allow-origins, disable-web-security, tắt sandbox hay global ignore-certificate-errors.

**MCP:** chrome-devtools-mcp1.10.1 chính thức, portable Node22.23.3 dưới `%LOCALAPPDATA%\GalaxyOS\Tools`; SHA256 Node zip kiểm từ SHASUMS chính thức `2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`. Npm cài pinned package, ignore-scripts/no-audit/no-fund, không global PATH. Wrapper source `scripts/galaxy-chrome-mcp.cmd`, bản chạy đặt bên cạnh Node và thư mục chrome-mcp tại Tools. Flags đã đối chiếu package/help: no-usage-statistics/no-performance-crux/redact-network-headers, allowlist chỉ https://localhost:33003/_ và http://localhost:3000/_. Env tắt update checks/usage.

Công cụ chính thức đã initialize→tools/list→list_pages/evaluate_script/navigate_page qua stdio; proof ở `visible-mcp-tools.jsonl`, `visible-interactive-navigation.log` (chỉ URL/title/trạng thái/me HTTPcode). Không lấy cookie/token, không thu password/MFA hoặc trace phiên người dùng. Probe one-off ignored, không xây router/model API ngoài. Phiên regression Chromium134 và cookie fixture riêng, không logout/seed vào Chrome của chủ máy.

**Codex:** CLI0.157.1; `codex debug models --bundled` và metadata model cache xác nhận IDs/reasoning, không đọc auth.json. Native project `.codex/config.toml` và ba `.codex/agents/*.toml`. `codex app-server --strict-config` + config/read cwd worktree PASS, max_concurrent_threads_per_session=1; mcp get xác nhận Galaxy bridge enabled, inherited chrome-devtools Linux disabled **chỉ ở project này**. --strict-config không hỗ trợ mcp/features subcommand; đã dùng app-server đúng hỗ trợ. Không đổi default model/provider/quyền user config.

| Task                             | Mức | Model/effort cấu hình                               | Thực tế lượt này                                                                                |
| -------------------------------- | --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| lệnh test/lint/diff              | T0  | công cụ, không worker                               | scripts/tools                                                                                   |
| docs/nhãn xác định               | T1  | galaxy_light: gpt-6-luna/low                        | cấu hình phiên sau, chưa gọi                                                                    |
| code thông thường đã rõ contract | T2  | galaxy_coding: gpt-6-sol/medium                     | cấu hình phiên sau, chưa gọi                                                                    |
| quyền/publication/clock/review   | T3  | galaxy_security_review: gpt-6-astra/high, read-only | đã request reviewer gpt-6-astra/high bằng native spawn; actual runtime ID không trả, UNVERIFIED |

Điều phối INLINE vẫn viết code; actual model ID turn hiện tại UNVERIFIED. Đây là CONFIGURED_NATIVE_NEXT_SESSION, không khẳng định runtime tự đổi model/auto-discovery custom agents đã kiểm. Một writer và tối đa một reviewer; không worker chạy chung DB/browser. Reload phiên/extension Codex trong worktree khi muốn client nhận server `galaxy_chrome` mới; không kill phiên hiện tại. MCP direct stdio đã nối được Chrome thật trước reload.

Tắt riêng kết nối bằng `enabled=false` dưới `[mcp_servers.galaxy_chrome]` trong project config; muốn khôi phục server kế thừa thì gỡ override disabled của chrome-devtools ở cùng file. Không ghi đè config user. Profile/Node/package/cert/authstate nằm ngoài Git; không xóa profile khi tắt MCP. Khi cần mở lại Chrome, dùng executable Windows đã xác minh với user-data-dir Galaxy riêng và loopback33004 như [cấu hình chính thức](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md); kiểm listener/profile trước nối, không reuse process cá nhân. Thử launcher PowerShell bị execution policy chặn, không bypass và không ship launcher chưa chạy; Chrome đã mở bằng thao tác được phép trước đó, vẫn còn dùng được.

Tham chiếu: [Codex subagents](https://developers.openai.com/codex/subagents), [config reference](https://developers.openai.com/codex/config-reference), [MCP](https://developers.openai.com/codex/mcp), [Chrome MCP chính thức](https://github.com/ChromeDevTools/chrome-devtools-mcp), [BFCache no-store](https://developer.chrome.com/docs/web-platform/bfcache-ccns), [notRestoredReasons](https://developer.chrome.com/docs/web-platform/bfcache-notrestoredreasons/). Công cụ này không triển khai AI runtime Galaxy.

### Bản thử, runtime cũ và bước tiếp

Test https://localhost:33003/work vẫn riêng DB55433/Redis56380/storagefixture; health200. Build/PID/checksum ở VERIFICATION. Chạy/dừng bằng launcher hiện hữu `node scripts/m2-a-serve.mjs api --clock-monitor`, `node scripts/m2-a-serve.mjs web --production`, `node scripts/m2-a-tls.mjs` sau khi kiểm PID/cwd/cổng; không khởi chạy trùng. Ctrl-C đúng terminal do lượt này sở hữu. Không dùng mật khẩu bản3000 cho testDB33003.

**MAIN_RUNTIME_CHANGED: YES — STARTED_EXISTING_VERSION_BY_OWNER.** Chủ dự án đã chọn “Cho phép khởi động bản cũ3000”. Recipe `pnpm --filter @galaxy/api dev` và `pnpm --filter @galaxy/web dev` tại /home/galaxy_os, main source/Git vẫn sạch, không copy/merge M2-A. MAIN_SOURCE_CHANGED:NO; PUSH_MERGE_DEPLOY:NOT_PERFORMED. Chỉ dừng bản cũ khi chủ máy yêu cầu, không đóng khi kết thúc test M2-A.

1. OS clock: chủ máy đã được hướng dẫn một bước `sudo systemctl stop systemd-timesyncd` trong terminal WSL để thử nghiệm tạm, chưa làm được. Sau khi thực hiện, đo Windows/WSL90giây; không giả là đã chữa. Tiếp đó gate45giây + repeat10 +2fullAPI cùng code/config; nếu jump thì dừng nghiệm thu.
2. B5: CONTRACT thông tin/PAYMENT lịch/DELIVERY_INSTALL kế hoạch vẫn không thay tài liệu ký, biên lai hay biên bản giao. CONTRACT_FILE controlled registration proposal reviewed nhưng NOT_IMPLEMENTED. PAYMENT/DELIVERY linkage/version/writer thiếu A/B/C. PLAN ghi exact đường và ràng buộc; không giả thiếu kỹ thuật là quyết định D hoặc miễn scope. Cần code/test thêm trước gọi B5 đầy đủ.
3. Browser full scope sau clock ổn định; giữ sửa session fixture, kiểm reconnect lỗi403/404/revoke, race/expiry/upload từng nhánh và publication E2E từng nguồn trên mobile emulation. Không lấy3PASS contaminated làm đóng ca.

M2_A_STATUS:PARTIAL; M2_OVERALL_STATUS:PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE:BLOCKED; M3_IMPLEMENTATION_STATUS:NOT_STARTED. M3-ENTRY vẫn mục điều kiện bên dưới và source/test baseline nêu trên, chưa là nền nghiệm thu. Lead-only/lifecycle deferred; không thêm AI/RAG hoặc đọc hồ sơ thật cho AI.

## Lịch sử — M2-A CLOSEOUT, 2026-09-28

**M2_A_STATUS: PARTIAL. M3_ENTRY_GATE: BLOCKED.** Đã code thêm ba nguồn publication còn thiếu, sửa scope rỗng/thu hồi quyền lúc chốt artifact, multipart tiếng Việt/BOM, nhãn bản nháp, key prepare retry và gate clock. Không chỉ đổi báo cáo. Chưa đủ nghiệm thu vì clock host nhảy, BFCache không có hit thật và full/browser/stability chưa đạt. INLINE + self-review + hai reviewer độc lập chỉ đọc; không hỏi lại B1–B5.

### Định danh cuối

- EXECUTION_SCOPE: M2-A CLOSEOUT.
- WORKTREE: `/home/galaxy_os/.worktrees/m2-a-20260928`; BRANCH: `m2/project-chat-20260928`.
- RESUME_START_SHA: `0369b32198b130d44dd77babeeb3653405a60d62`; tổ tiên code trước `e4b3570…` được giữ, ban đầu sạch.
- CODE_SHA = TESTED_SHA: `caa6c32c5e21c5a5b0f33ef30eca4309c6bcd749`; TESTED_TREE: `15f49c27074a1de8ccbd4d9bf75ed861cbde0ac6`. Commit source22file; manifest SHA256 xác nhận từng source/test/config/migration trùng tree đã kiểm. TESTED nghĩa đã chạy các lớp ghi bên dưới, **không phải VERIFIED**. BOM sửa sau targeted105 được rerun file49 + browser upload thật; React import sau Webfail được rerun fullWeb508 và rebuild.
- DOCS_COMMIT_SHA: lấy hash thật bằng `git log -1 --format=%H -- docs/galaxy-os/milestones/M2/HANDOFF.md` sau docs commit riêng; không ghi self-hash bằng amend. Docs chỉ sáu file PROJECT_STATUS, STATUS, DESIGN, PLAN, VERIFICATION, HANDOFF.
- Main worktree vẫn `7faeb58eea534dbb6c11238906ede6df84ce0302`, sạch ở kiểm cuối. MAIN_RUNTIME_CHANGED:NO; PUSH_MERGE_DEPLOY:NOT_PERFORMED; runtime chính vẫn RUNTIME_VERSION_UNVERIFIED.

### Người dùng nhận được và giới hạn

- CONTRACT/phụ lục: chọn nguồn thật từ domain, xuất bản thông tin đúng trạng thái/phạm vi; không giả file ký. PAYMENT: lịch nghĩa vụ chính khách, không transaction/receipt. DELIVERY_INSTALL: kế hoạch lắp và work-order có thật, không chứng minh thực giao/lắp. Cả ba dùng publication UI/API hiện hữu và hai actor; typed nguồn → snapshot/fingerprint → FileAsset/binary, retry cùng key, nguồn đổi/revoke bị chặn. Không còn MISSING_SOURCE_CONTRACT cho ba **bản thông tin/lịch/kế hoạch** này; legacy thiếu evidence không tự được bổ sung.
- QUOTATION/TECHNICAL/SAMPLE/HANDOVER/PROPOSAL giữ adapter riêng; targeted cuối có tải bytes thật và ca từ chối. Không generic upload fallback. Nhãn UI không gọi CONTRACT DRAFT là đã duyệt; người dùng phải kiểm đúng nội dung và người nhận trước publish.
- Upload filename tiếng Việt không còn mojibake. HTML/quotes/control/path được xử lý qua sanitizer có sẵn; không để filename chọn storage path. Upload mất response giữ FileAsset/key và draft RAM, gửi lại không nhân file/tin trong ca browser đã kiểm.
- Polling sau offline/online có test max in-flight1. Mobile390×844 đã thêm preview/confirm publication PROPOSAL và upload lỗi/retry; không thiết bị/bàn phím vật lý. Browser từng snapshot mới và mọi race/expiry/upload biến thể chưa đủ.

### Kết quả phải đọc cùng giới hạn

| Trường                                        | Kết quả                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST_ENVIRONMENT_STATUS                       | VERIFIED_ISOLATED / HOST_CLOCK_UNSTABLE                                                                                                        |
| CLOCK_ROOT_CAUSE                              | Realtime host/WSL nhảy lùi/tiến ~182–183giây; cùng dấu ở Python native/Node/API/DB/browser; monotonic ổn định. Chưa biết tiến trình chỉnh giờ. |
| CLOCK_FIX_SCOPE                               | Observer/gate fail-closed theo PID và coverage; log grant observations; không sửa host, không nới expiry/JWT.                                  |
| CLOCK_VERIFICATION_STATUS                     | DIAGNOSED / STABILITY_BLOCKED                                                                                                                  |
| CLOCK_CONTAMINATED_RUNS                       | Gate cdaee7d2…,399427af…,46c56531…; targeted105 runner100956/worker100979; fullbrowser101391 và corrections103219 có jumps. Giữ raw logs.      |
| ORIGINAL_FAILURES_RESOLUTION                  | Các tên gốc trong VERIFICATION chạy PASS targeted105 và domain-link browser; chưa đủ repeat10/clock sạch để đóng hoàn toàn.                    |
| PUBLICATION_CONTRACT_STATUS                   | IMPLEMENTED_API_TESTED_INFORMATION_SNAPSHOT; không binary có chữ ký                                                                            |
| PUBLICATION_PAYMENT_STATUS                    | IMPLEMENTED_API_TESTED_CUSTOMER_SCHEDULE; không tiền đã đối chiếu                                                                              |
| PUBLICATION_DELIVERY_INSTALL_STATUS           | IMPLEMENTED_API_TESTED_PLAN_SNAPSHOT; không biên bản thực giao/lắp                                                                             |
| EXISTING_PUBLICATION_REGRESSION               | PASS targeted theo lớp, CLOCK_CONTAMINATED; không thay full                                                                                    |
| APPROVAL_VERSION_BINARY_RECIPIENT_STATUS      | Typed nguồn/version/snapshot/digest/2actor/recipient đã kiểm API; PARTIAL nghiệm thu mọi tổ hợp/browser                                        |
| BFCACHE_REAL_STATUS                           | NOT_VERIFIED: persisted=false, no-store main/XHR và browsing-instance reasons; không bypass                                                    |
| POLLING_RECONNECT_STATUS                      | Bounded-loop và lost-response/revoke có bằng chứng theo lớp; full browser còn failure, PARTIAL                                                 |
| UPLOAD_ERROR_RETRY_STATUS                     | PASS browser ca mất response/same key/same file/binary thật; PARTIAL toàn pipeline/race                                                        |
| UNTRUSTED_FILENAME_STATUS                     | Unit49 gồm9ca bổ sung; hostile Vietnamese filename/browser PASS; không bypass sanitizer                                                        |
| MOBILE_VERIFICATION_STATUS                    | PARTIAL: Chromium viewport390×844, không thiết bị/bàn phím vật lý                                                                              |
| ROOT_LINT_STATUS / PYTHON_ENVIRONMENT_STATUS  | PASS entrypoint pnpm lint / venv riêng Python3.10.12, requirements-dev pin                                                                     |
| BUILD_TYPECHECK_SCHEMA_FORMAT                 | PASS; rootbuild+API rebuildBOM, typecheck/lint cuối, Prisma validate, format                                                                   |
| TARGETED_REPEAT_RESULTS                       | 105/105 targeted một lượt nhiễm clock; affected file49/49 sau BOM; repeat10 NOT_RUN/BLOCKED_CLOCK                                              |
| FULL_API_RUN_1 / FULL_API_RUN_2               | NOT_RUN / NOT_RUN: gate cuối exit2 CLOCK_CONTAMINATED_BASELINE                                                                                 |
| WEB_TESTS                                     | 508/508,30files; thêm1test labelDRAFT                                                                                                          |
| BROWSER_TESTS                                 | Full16:8PASS/3FAIL/5NOT_RUN; corrections3:2PASS/1FAIL(BFCache); không retry và không cộng thay full                                            |
| ACCEPTANCE_PASS_FAIL_PARTIAL_NOT_RUN_DEFERRED | Giữ36PASS theo lớp lịch sử/17PARTIAL/1DEFERRED trên54ID, không nâng bằng clock-contaminated runs; chi tiết overlay ở VERIFICATION              |
| M2_A_STATUS / M2_OVERALL_STATUS               | PARTIAL / PARTIAL_LEAD_LIFECYCLE_DEFERRED                                                                                                      |
| M3_ENTRY_GATE / M3_IMPLEMENTATION_STATUS      | BLOCKED / NOT_STARTED                                                                                                                          |

Root Python health1/1 và edge4/4 PASS qua executor được phép. Lượt restricted edge trước EPERM bind, Python treo đã dừng đúng PID; giữ log, không gọi là lỗi ứng dụng, không tắt sandbox. Root `pnpm test` tổng thể chưa PASS vì fullAPI bị gate clock.

### Bản thử thực tế, chạy và dừng

Địa chỉ đã kiểm: **https://localhost:33003/work** (cert tự ký chỉ fixture); `/login`200 và API33001 `/api/v1/health`200. HTTP33002 là upstream của test TLS, không ứng dụng production. Không in mật khẩu/token; `apps/api/test/m2-browser.fixture.ts` tạo persona giả trong stack đã guard. Có thể xem qua browser test đã trust riêng cert fixture; không cài cert vào trust store toàn máy.

Quan sát cuối: API PID103180 cwdW/apps/api; Web PID101341 cwdW/apps/web; TLS PID95672 cwdW. Đây là PID quan sát, phải kiểm lại trước signal. Web BUILD_ID `nb9Gevp_DIMdJRTSSawJL`; API main SHA256 `baff2384276602bf63cba1337b0749ab4b1b1135512847acd346d5523ace7720`; service publication `fe0f7a7f747b1c19791d85f24d480a6072487835e23b3eb74634efd9592407f0`; filename compiled `7c3426c263146ea4b677e2bf7121225004e80456b3ceee451198341ee056e216`. Source22file khớp commit, generated next-env trở lại nội dung baseline, không stage generated bundle.

Sau kiểm PID/cổng/guard, từ W chạy launcher riêng trong ba terminal:

```sh
node scripts/m2-a-serve.mjs api --clock-monitor
node scripts/m2-a-serve.mjs web --production
node scripts/m2-a-tls.mjs
```

Cần build test trước theo VERIFICATION (Web FEATURE_PROJECT_CHAT từ recipe, APP_PUBLIC_ORIGIN=https://localhost:33003); không chạy đồng thời bản cũ. Ctrl-C đúng terminal launcher để dừng; khi mất terminal chỉ signal PID/cwd/argv đã xác minh. Không kill theo tên/cổng, không stop DB/Redis, không prune/down-v. Namespace `galaxy_os_g00_20260928m2a`; PG55433/Redis56380 loopback, storage `/tmp/galaxy-os-g00-20260928m2a`,79migration test. Không đổi adapter external, không gửi thư/SMS/AI/payment thật.

### Còn chặn và bước tiếp theo

1. Chủ máy cần xử lý nguồn chỉnh realtime Windows/WSL và xác nhận đồng hồ ổn định. Agent không tự date-s/NTP/reboot/WSLshutdown; không xin mật khẩu. Sau đó gate45giây + targeted10lần +2fullAPI liên tiếp trên cùng source/config, giữ log và dừng điều tra nếu fail.
2. BFCache thật chưa đạt trên browser này vì no-store/XHR. Giữ chính sách bảo vệ; cần browser/harness hỗ trợ an toàn và bằng chứng persisted=true, kể cả revoke khi rời document. Không thay bằng simulated event.
3. Full browser chưa sạch: management cross-tab thiếu Project link; reconnect GETmessages404 với future grant; worker fixture login401 sau lỗi làm5caNOT_RUN. Cần chạy lại sau clock ổn định, phân tích request tương ứng nếu còn fail; không nới limiter/permission/timeouts.
4. Hoàn tất UI end-to-end ba snapshot mới và biến thể race/expiry/upload/mobile còn PARTIAL ở ma trận. Không dùng PASS fail-closed hoặc review để thế nghiệm thu.

DEFERRED_SCOPE: Lead-only/lifecycle theo chỉ đạo rõ. Không triển khai M3–M7, không đổi định danh Project hoặc nghĩa vụ tài chính.

### M3-ENTRY — BLOCKED, chỉ handoff điều kiện

Baseline kỹ thuật dự kiến là code/tree nêu trên, **chưa được nghiệm thu làm nền M3**. Project → ChatRoom → ChatMessage có actor server/sequence/time; ChatFile nối FileAsset/version; ChatDocumentRelease giữ typed domain source/snapshot/checksum/recipient/publisher. `ProjectChatPolicy.live/authority/assertRoom/history` và `ProjectChatService.messages/releases/releaseDownload` cùng `FilesService` kiểm actor/tenant/Project/room/history/current grant; M3 tương lai phải đọc qua cùng scope, không quét DB/file trực tiếp hoặc dùng summary thay nguyên lịch sử. Revoke/expiry được xét mỗi lần lấy/phát; nguồn mới không đổi binary release cũ, source-only nội bộ không tự public. Các service nguồn: Commercial/QuotationDocuments, Production, AfterSales, Contracts, Installation. Dataset chỉ fixtureM2, không dữ liệu thật. Chưa có AI/provider/index/bộ nhớ, chưa tạo hệ thống riêng theo bốn nhóm. Chỉ báo READY_FOR_M3_ON_EXISTING_PROJECTS sau khi tất cả blockers nghiệm thu đóng.

## Lịch sử — M2-A continuation, 2026-09-28

**M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL.** Đã tiếp tục code, TDD/review và commit local đúng worktree; chưa đủ điều kiện nghiệm thu. Không làm lại M0/M1, không đổi các quyết định B1–B5. Implementation INLINE; hai reviewer thực tế chỉ đọc `/root/publication_review` và `/root/regression_navigation_review`, sửa các finding env leak, source revision race, hash navigation. Review không thay bằng chứng test.

### Định danh source và kiểm thử

- WORKTREE: `/home/galaxy_os/.worktrees/m2-a-20260928`; BRANCH: `m2/project-chat-20260928`.
- RESUME_START_SHA: `b2c8fe440c0e4b5ca53940d9c8ded34ed00ab5b8`. Ban đầu sạch, giữ toàn bộ code/docs trước; không reset/cherry-pick.
- CODE_SHA = TESTED_SHA: `e4b3570e63367a84cef41f1823c9ad1d530ee10d`; TESTED_TREE: `c7e416c60dd3559fc7737f0e6e09196621cb89c7`.
- Full/browser trên source ngay trước commit; SHA256 manifest xác minh17file code/test/migration giống commit và working tree sau commit. Post-commit unit30/30. Các tests thất bại vẫn gắn cây này; TESTED không đồng nghĩa VERIFIED.
- Docs-only commit sau code chỉ sửa `PROJECT_STATUS.md`, `docs/galaxy-os/05-IMPLEMENTATION-STATUS.md`, M2 `DESIGN.md`, `PLAN.md`, `VERIFICATION.md`, `HANDOFF.md`. DOCS_COMMIT_SHA lấy từ `git log -1 --format=%H -- docs/galaxy-os/milestones/M2/HANDOFF.md` sau commit; trả hash thật trong phản hồi, không tự tham chiếu/amend.

### Người dùng nhận được trong bản thử

- Giữ chat nội bộ/khách, file bền vững, lịch sử/expiry/quyền sẵn có. Publication thêm báo giá khách, bản vẽ/mẫu đã duyệt và tài liệu bàn giao/bảo hành có nguồn hợp lệ. Không thêm domain/IAM/FileAsset/Approval thứ hai.
- Preview/publish/download kiểm bytes thực, pin source/version/digest/recipient; người mới có history không tự nhận publication cũ. Quotation dùng export khách sẵn có, không note/giá vốn qua bản XLSX đã kiểm, không cộng quota binary hai lần. UI hiển thị trạng thái nguồn, không biến NOT_REQUIRED thành “đã ký”.
- Đồng bộ writer nguồn với publication; decision chờ revision đổi trả409, không tự duyệt bản mới. Checksum bàn giao lấy từ storage server, không tin client.
- Đổi phòng/nhóm/link hoặc Back/Forward được hỗ trợ hỏi “Ở lại”/“Rời và bỏ nháp”; nháp RAM giữ khi ở lại, bỏ khi rời/reload. Hash cùng trang không chặn sai. Mất response sau gửi retry cùng key không tạo tin thứ hai; polling lỗi phục hồi được, response cũ không dựng lại phòng đã rời.
- Không có AI giả, không đổi nghĩa vụ hợp đồng/tiền/PO, không mời/gửi thư khách thật.

### Kết quả cuối và blockers

[VERIFICATION](VERIFICATION.md) có inventory đúng13lỗi gốc, ma trận nguồn publication, log RED/GREEN và overlay24+30 cùng giới hạn.

| Hạng mục                                    | Kết quả thật                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TEST_ENVIRONMENT_STATUS                     | VERIFIED_ISOLATED / ENVIRONMENT_CLOCK_UNSTABLE                                                                                      |
| INTERNAL_CHAT / CUSTOMER_CHAT / ATTACHMENT  | IMPLEMENTED; API/browser có PASS; nghiệm thu tổng thể PARTIAL                                                                       |
| PROPOSAL                                    | IMPLEMENTED_TESTED; giữ khả năng dùng, tăng kiểm bytes/recipient                                                                    |
| OTHER_B5_SOURCES                            | QUOTATION/TECHNICAL/SAMPLE/HANDOVER đã code + API binary thật; CONTRACT/PAYMENT/DELIVERY_INSTALL MISSING_SOURCE_CONTRACT            |
| APPROVAL_VERSION_BINARY_LINK                | Đã pin/check nguồn hỗ trợ, ca nhầm version/binary/project/nguồn đổi + tải khách; PARTIAL cho toàn B5 và mọi type/sign-state         |
| HISTORY_READD_EXPIRY / READ_ONLY_REVOCATION | PASS theo lớp API; read-only/revoke đang mở có browser; không tuyên bố mọi race đã đạt                                              |
| RACE_RECONNECT                              | Barrier send/lock/revoke, stale-decision, I/O và lost response/delayed poll/offline revoke có test; PARTIAL độ ổn định/mọi biến thể |
| DRAFT_BACK_FORWARD                          | PASS Chromium desktop/mobile viewport+reload trên13suite; Navigation API không cancelable và BFCache thực NOT_RUN                   |
| MOBILE                                      | PASS các ca viewport390×844 đã ghi; PARTIAL publication/keyboard/mọi persona; chưa thiết bị vật lý                                  |
| FULL_API_RUN_1                              | PASS1120/1120,60files,exit0                                                                                                         |
| FULL_API_RUN_2                              | FAIL3/PASS1117,59/60files,exit1                                                                                                     |
| FLAKY_REPEAT_RESULTS                        | Tối đa10, stop-on-first-failure: lần1 PASS55/FAIL1; lần2–10 NOT_RUN                                                                 |
| WEB_TESTS / BROWSER_TESTS                   | PASS507/507; browser PASS12/FAIL1,13tests,retries0                                                                                  |
| BUILD / TYPECHECK / SCHEMA / FORMAT         | PASS; logs cuối trong VERIFICATION                                                                                                  |
| LINT                                        | TypeScript PASS(1warning cũ); root script thiếu venv trong worktree; Python ruff qua executable hiện có PASS                        |
| Edge / Python                               | PASS4/4 và1/1                                                                                                                       |
| ACCEPTANCE24+30                             | 36PASS theo lớp,17PARTIAL,1DEFERRED; biến thể NOT_RUN nằm trongPARTIAL; các FAIL regression không bị ma trận xóa                    |

**Những việc còn chặn M2-A:**

1. ContractDocument/ContractApproval, phụ lục/thanh toán và InstallationPlan/SiteDelivery chưa có source contract chứng minh đúng approval–version–customer binary. Giữ fail closed và UI “chưa đủ nguồn/căn cứ phát hành”; không generic fallback. Không gọi4adapter mới là toàn bộ B5 đã đủ. Cần bổ sung contract nguồn tối thiểu trong scope cho phép; nếu buộc xây quy trình nghiệp vụ mới thì cần giao prerequisite riêng, không hỏi lại B1–B5.
2. Chưa đạt ổn định: full2 M2 `pins approved drawing...` guest download404, `publishes handover...` tạo room404, `blocks a waiting send...` tạo room404 trước barrier. Repeat upload `links independent logical Stage 1 files...` timeout5000/duration867ms. Browser `domain link choices disappear...` management404. File/path/tên nguyên văn trong VERIFICATION. Cả13ca gốc đã pass full1/full2 nhưng không đủ đóng issue ổn định.
3. Clock lùi~183giây đã tái hiện ngoài Vitest. Browser trace có management200 lúc04:51:35, rồi404 lúc04:48:35 trong khi chỉ taskRole bị archived. Giữ predicate hiệu lực quyền, không sửa giờ/timeout hoặc backdate fixture để qua. Cần môi trường có thời gian ổn định trước acceptance lại; không tự quy mọi timeout gốc cho clock.
4. Ca BFCache thực, max in-flight sau reconnect, browser upload-error/retry, filename độc hại, mobile publication/keyboard và đủ type/sign-state publication còn NOT_RUN/PARTIAL. Các ca đã đạt giữ nguyên, không báo mọi navigation/race/mobile đã đủ.

Lead-only/lifecycle là **DEFERRED_BY_EXPLICIT_SLICE_SCOPE** của M2 tổng thể, không bị nhập làm tính năng mới của lượt này. M3_STATUS:NOT_STARTED; không tự chuyển milestone.

### Bản thử đang chạy và cách quản lý

Xác minh trực tiếp sau build: API PID86693, cwd `W/apps/api`, argv `node dist/main.js`; Web launcher child86736 và Next server86747, cwd `W/apps/web`, dev webpack port33002. `/api/v1/health` và `/login` đều HTTP200. PID chỉ là quan sát, **phải xác minh lại trước signal**, không dùng như lệnh kill về sau.

- URL thử: **http://127.0.0.1:33002/work**; API http://127.0.0.1:33001/api/v1. Không tài khoản/mật khẩu trong handoff; fixture synthetic do `apps/api/test/m2-browser.fixture.ts` tạo theo recipe.
- API dist/main.js SHA256 `baff2384276602bf63cba1337b0749ab4b1b1135512847acd346d5523ace7720`; Web dev chạy source CODE_SHA, không gọi bundle production. Web build-manifest lúc kiểm `d2eb22a1d553abf206922cfee3e3681b64de18d3818b8b08dadf481dae7832da`; file dev có thể đổi khi compile route. Build root thành công trước restart, không dùng bundle cũ để kiểm source mới.
- Recipe hiện hữu: `node scripts/m2-a-serve.mjs api` / `node scripts/m2-a-serve.mjs web` từ W, sau kiểm cổng/owned process và API build. Launcher guard+env sạch, không `.env.local` main. Dừng bằng Ctrl-C đúng terminal launcher thử; không kill theo tên/port mù quáng.
- Giữ stack `galaxy_os_g00_20260928m2a`, PG55433/Redis56380/storage riêng; không tạo stack mới, không dừng container/volume, prune/reset/seed main. Hai migration mới đã review/deploy chỉ test,78migration hiện hành. Bwrap không cài, không công việc code/DB/browser nào bị chứng minh phụ thuộc lần này.
- Raw log/trace/manifest ignored ở `.superpowers/sdd/PLAN/` và `apps/web/test-results/m2-a/`, có thể chứa cookie fixture nên không commit raw. Báo cáo không chứa secrets.

### Tiếp tục đúng điểm

Đọc phần **hiện hành** của HANDOFF/VERIFICATION/PLAN, kiểm Git và owned runtime. Ưu tiên ổn định clock rồi tái chạy3file từng lỗi10lần có giới hạn, full2lần liên tiếp và browser13trên cùng source; gặp lỗi giữ log và điều tra, không retry-until-green. Tiếp tục các ca còn thiếu và mapping contract nguồn B5, không viết lại M2-A. Code local được giữ nguyên để review. Main worktree kiểm cuối sạch tại `7faeb58eea534dbb6c11238906ede6df84ce0302`; **MAIN_RUNTIME_CHANGED:NO**, runtime chính vẫn RUNTIME_VERSION_UNVERIFIED. **PUSH_MERGE_DEPLOY:NOT_PERFORMED**.

## Lịch sử trước continuation: M2-A — 2026-09-28, Asia/Bangkok

**M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL.** Không quay về main để làm lại M0/M1. Tiếp tục tại `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`. Source, docs và stack test giữ tại đây; chưa tích hợp vào ứng dụng chính.

### Quyền, SHA và phạm vi

- B1_B5_STATUS: RESOLVED_FOR_M2_A; DESIGN_STATUS: OWNER_DIRECTED_M2_A. **Chủ dự án chốt phạm vi/chính sách bằng chỉ đạo hiện tại, ủy quyền lập và rà soát kỹ thuật kế hoạch để thực thi inline.** PLAN_STATUS: TECHNICALLY_REVIEWED_EXECUTED_PARTIALLY; không PLAN_APPROVED_BY_OWNER.
- PLAN_REVIEW_METHOD: self-review + hai reviewer độc lập chỉ đọc; implementation INLINE/TDD. Ponytail giữ service/domain sẵn có, không thêm dependency hoặc rewrite IAM.
- START_SHA: `7faeb58eea534dbb6c11238906ede6df84ce0302`; Task1 CODE_SHA: `b5a0859d45b6711e71cc8bad11f750b8ee498944`. Không tự tham chiếu docs commit.
- CODE_SHA / TESTED_SHA: `be3aafe4ae84264e66ab12b773ca0c4f2825bf77`; TESTED_TREE: `c72af911b152faf757031109bda1f6cc2e2859f2`. Đây là code commit với 48 file source/test/migration, không phải docs commit. Browser8 chạy ngay trước commit trên cùng nội dung source (không delta); targeted được chạy lại sau commit, docs-only dirt tách riêng. DOCS_COMMIT_SHA trả sau commit cuối, không ghi tự tham chiếu vào file này.
- M2_ENTRY_GATE: READY cho code trong test stack đã xác minh, không phải VERIFIED nghiệm thu. MAIN_RUNTIME_CHANGED: NO; runtime chính vẫn RUNTIME_VERSION_UNVERIFIED. PUSH_MERGE_DEPLOY: NOT_PERFORMED.
- Gốc chỉ thêm ignore `.worktrees/` theo skill; không sửa runtime/config/main app. Không merge/cherry-pick G01/G02. G02 user dirty file giữ nguyên; không reset/stash/clean/restore.

### Người dùng đã có gì trong bản thử

Đăng nhập thật → `/work` → Project được cấp → bốn nhóm → phòng nội bộ/khách → tin lưu DB, polling, file dùng FileAsset, xem/tải theo READ/DOWNLOAD/history. Chỉ đọc không gửi; không quyền không nhận payload. Admin Project tường minh có UI cấp/thu hồi/hạn/history/khóa mà không tự đọc tin. Link Task/ProductLine chỉ khi có quyền domain, không copy dữ liệu. Khách có Session riêng, expiry≤30 ngày, không role nhân viên, không thấy nội bộ.

Publication **PROPOSAL đã duyệt** có chuẩn bị, preview đúng nguồn/phiên bản/khách, hai actor, recipient fingerprint, phát hành/thu hồi/tải bản cố định. Nguồn khách gửi mang nhãn EXTERNAL_UNCONFIRMED. Không bot/AI giả, không lời hứa đã có memory runtime. UI nói rõ hồ sơ B5 khác chưa hỗ trợ.

### Phần chưa hoàn tất / blocker cụ thể

1. Các adapter B5 ngoài PROPOSAL vẫn thuộc M2-A được giao nhưng NOT_IMPLEMENTED, không tự loại khỏi phạm vi. ContractDocument có binary metadata, song chưa chứng minh mapping approval/version→FileAsset đúng nguồn; phụ lục/tiền/kế hoạch giao-lắp cũng chưa có đường đã kiểm. Không đổi business domain ngoài quyền để đoán nguồn hoặc cho file bất kỳ qua gate. Cần thiết kế/kiểm chứng mapping từng nguồn; chỉ phần buộc sửa domain nghĩa vụ ngoài M2-A mới cần scope prerequisite riêng. Không cần hỏi lại B1–B5.
2. Full API còn failure/timeout; targeted pass không xóa lỗi chập chờn. Browser có lần second-preview404 dù poll có pending. Xem đầy đủ lần fail/rerun trong [VERIFICATION](VERIFICATION.md); không gọi production-ready hoặc M2-A VERIFIED.
3. Back/Forward Next SPA chưa có xác nhận bỏ nháp. Đổi phòng/nhóm/link và beforeunload đã có guard; logout/revoke vẫn phải clear không hỏi. Các ca delayed polling/reconnect/lock race/mobile lỗi/filename adversarial còn thiếu assertion độc lập, không tick PASS toàn bộ.
4. Lead-only intake/lifecycle toàn trình: DEFERRED_BY_EXPLICIT_SLICE_SCOPE. Không tạo Project giả; M2 tổng thể còn phần này. Không chuyển M3–M7.
5. Bubblewrap chưa cài, cần OS authorization nếu muốn cài; không tác vụ code/DB/browser hiện tại bị chứng minh chặn bởi thiếu bwrap. Không lặp sudo hoặc tắt sandbox.

### Test stack / cách tiếp tục

Kiểm cuối: targeted API **165/165**, Web **507/507**, browser **8/8**, typecheck/build/format đạt. Full API gần nhất **1101pass/13fail**,3/60files thất bại; không xóa bằng targeted rerun. BROWSER_VERIFICATION_STATUS: PASS_8_CASES_NOT_FULL_ACCEPTANCE. Xem lệnh, thời điểm, failure và ma trận24+30 trong VERIFICATION.

Test app có URL loopback thật `http://127.0.0.1:33002/work`; API `http://127.0.0.1:33001/api/v1`. Chỉ test worktree, không bản chính. Không tài khoản thật hoặc thông tin đăng nhập trong báo cáo. Browser fixture tự tạo actor giả qua `apps/api/test/m2-browser.fixture.ts`, không route seed/mời khách thật.

Quan sát cuối khoảng07:55+07: API PID64684 (cwd W/apps/api), Web PID67616 (cwd W/apps/web); `/api/v1/health` và `/login` HTTP200. Đây là PID quan sát, không lệnh kill dùng lại về sau; luôn xác minh lại. Main worktree sạch tại `7faeb58…`; G02 next-env hash vẫn `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38`. Next-env M2 trở về nội dung baseline do Next dev tự sinh sau build, không reset/restore hoặc stage file đó.

Từ worktree: `node scripts/m2-a-serve.mjs api` và `node scripts/m2-a-serve.mjs web` trong hai terminal, **chỉ khi kiểm cổng và owned process trước**. API cần build trước bằng lệnh trong VERIFICATION. Launcher đọc đúng recipe synthetic và assertG00Isolation. Dừng bằng Ctrl-C ở chính terminal launcher của test; nếu mất terminal phải xác minh PID/cwd/port trước signal, không kill hàng loạt. Stack compose `galaxy_os_g00_20260928m2a` và storage riêng vẫn giữ; không tự `down -v`/prune. PG tmpfs mất khi container bị dừng; nguồn fixture có thể tạo lại trong namespace được kiểm.

Build/dist/.next/node_modules/test-results/Prisma client là generated output trong worktree, không commit. Next tự đổi next-env giữa build/dev; cuối lượt phải đối chiếu không stage file generated này. Browser artifacts có thể chứa cookie fixture, chỉ giữ ignored tại máy; báo cáo không chép raw trace.

### Files thực tế (source và docs)

- Task1: `scripts/m2-a-isolated.env.example`, `apps/api/src/access-control/{current-actor.ts,development-auth.guard.ts,access-control.test.ts}`.
- API mới: `apps/api/src/access-control/project-chat.policy.ts`; `apps/api/src/project-chat/{project-chat.module.ts,project-chat.controller.ts,project-chat.dto.ts,project-chat.service.ts}`; `apps/api/test/{m2-project-chat.integration.test.ts,m2-browser.fixture.ts}`.
- API điều chỉnh: `apps/api/src/access-control/{access-control.module.ts,access.decorators.ts,current-actor.ts,development-auth.guard.ts}`, `app.module.ts`, `auth/auth.controller.ts`, `me.controller.ts`, `me.service.ts`, `files/{files.service.ts,project-file.ts}`, `audit/audit.service.ts`, `search/search.controller.ts`, `tasks/{tasks.module.ts,tasks.service.ts}`, `projects/project-products.test.ts` (predicate mock thêm NOT ChatRoom, không bỏ assertion).
- Schema `apps/api/prisma/schema.prisma`; bảy migration cụ thể liệt kê trong [PLAN](PLAN.md), chỉ additive/test DB.
- Web mới: `apps/web/app/work/page.tsx`, `apps/web/app/projects/[projectId]/work/page.tsx`, `apps/web/features/project-chat/{project-chat.tsx,chat-controls.tsx,project-chat.test.tsx}`, `apps/web/playwright.m2.config.ts`, `apps/web/tests/browser/m2-project-chat.spec.ts`; launcher `scripts/m2-a-serve.mjs`.
- Web điều chỉnh: `apps/web/app/{layout.tsx,portal-shell.tsx,portal-navigation.ts,lib/api.ts}`, `apps/web/app/login/{model.ts,model.test.ts,page.tsx}`, `apps/web/app/api/v1/[...path]/{route.ts,route.test.ts}`, `apps/web/proxy.ts`.
- Docs: `PROJECT_STATUS.md`, `docs/galaxy-os/05-IMPLEMENTATION-STATUS.md`, `docs/galaxy-os/milestones/M2/{DECISIONS.md,DESIGN.md,PLAN.md,VERIFICATION.md,HANDOFF.md}`. Không viết lại charter/nguồn M0/AGENTS hoặc nhân bootstrap.

### Bước tiếp theo chính xác

Đọc HANDOFF → VERIFICATION (các failure cuối) → PLAN (đối chiếu file thật) trong **worktree M2**, kiểm HEAD/status. Ưu tiên tái hiện 404/timeout bằng barrier/clock/DB evidence, không tăng timeout; kiểm lại browser source-revoke/draft trên cây ổn định. Sau đó bổ sung các assertion còn thiếu và adapter publication có nguồn đã review. Chỉ mở loại hồ sơ khi chứng minh đúng version/approval/recipient; giữ failclosed phần thiếu. Không dọn worktree/stack trước khi đã quyết định giữ bằng chứng.

## Lịch sử — bàn giao trước gate phê duyệt

Ngày 2026-09-28, bắt đầu quan sát 04:55:44+07:00. START_SHA `0fea6cc53db41c6520fda942c3bf412c35ab3dbb`, tree `a7648137465aa44b711d62e89fb46403ae6ea9cd`; workspace `/home/galaxy_os`, branch `g00/build-test-isolation-20260914`. M0/M1 không thực hiện lại.

## Kết quả hiện tại

- M2_STATUS: AWAITING_OWNER_DECISIONS. Đã đối chiếu B1–B5, chưa có quyền code theo gate hiện hành.
- [DECISIONS](DECISIONS.md): giữ nguyên văn B1–B5, nguồn, phần đã giải quyết bởi chỉ đạo mới và phần cần quyết định. B1 TECHNICAL_PROPOSAL, B2–B5 còn NEEDS_OWNER_DECISION; một số rào an toàn con RESOLVED_BY_EXISTING_DECISION.
- [DESIGN](DESIGN.md): bản cập nhật để review cùng M1, không merge G02, prerequisite tối thiểu có review, 24 ca/hai tenant, đề xuất recipe test cô lập. DESIGN_APPROVAL_STATUS: NOT_APPROVED.
- PLAN_APPROVAL_STATUS: NOT_CREATED_AWAITING_DESIGN_APPROVAL; chưa tạo PLAN rỗng hoặc coi TASK1–5 của prompt là kế hoạch đã được duyệt. Chưa chọn phương thức thực thi.
- IMPLEMENTATION_GATE: BLOCKED_APPROVAL. Không source/config/schema/test/migration mới; không worktree triển khai, test stack, fixture/tài khoản hoặc UI demo.
- bwrap lookup1, Docker binary có; không cài hoặc lặp sudo. Test environment chưa tạo vì gate, không phải đã thử dựng rồi thất bại. Executor vẫn đọc và kiểm docs được.
- Không kiểm lại runtime; RUNTIME_VERSION_UNVERIFIED giữ nguyên. MAIN_RUNTIME_CHANGED: NO. PUSH_MERGE_DEPLOY: NOT_PERFORMED.

## File lượt này

Tạo bốn file: `docs/galaxy-os/milestones/M2/DECISIONS.md`, `DESIGN.md`, `VERIFICATION.md`, `HANDOFF.md`.

Cập nhật có mục tiêu: [PROJECT_STATUS](../../../../PROJECT_STATUS.md), [STATUS](../../05-IMPLEMENTATION-STATUS.md), [READ-FIRST](../../00-READ-FIRST.md) chỉ bỏ câu phạm vi M0 lỗi thời và dẫn scope theo STATUS/chỉ đạo hiện hành. Không đổi charter, acceptance gốc, M1 reports, AGENTS/bootstrap hoặc `.git` hướng dẫn/guard. Không tạo canonical trùng.

## Kiểm tra

Lệnh/Git/môi trường và giới hạn ở [VERIFICATION](VERIFICATION.md). App tests M2:0 chạy; 24 ca NOT_RUN, không tuyên bố unit/integration/browser PASS. Kiểm tài liệu bằng Node `fs`/`assert`: PASS, exit0, bảy file/82 đích liên kết tồn tại; B1–B5 khớp nguyên văn M1; 24 ca NOT_RUN; fixture tenant thứ hai có Project/room/file/actor; chưa có PLAN và chỉ một bootstrap. Prettier scoped và `git diff --check` đạt. Không generated application output hoặc cache test mới vì chưa chạy app test.

Review độc lập correctness/security/evidence và Ponytail đã hoàn tất cho docs. Đã sửa thiếu fixture đối chứng O2 và làm rõ phạm vi logic idempotency khác khóa unique vật lý; reviewer kiểm lại không còn phát hiện ở hai điểm này. Review không phê duyệt thay chủ dự án, không chứng minh sản phẩm chạy đúng. Privacy scan không tìm credential pattern; rà nội dung chỉ có nguồn code, hash, recipe và dữ liệu fixture đề nghị, không hồ sơ khách thật.

G02 dirty `apps/web/next-env.d.ts` giữ nguyên, hash đầu lượt `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38`. Workspace chính sạch trước lượt; index không có thay đổi người dùng. DOCS_COMMIT_SHA lấy từ Git sau commit và trả ở phản hồi, không self-reference trong docs.

## Tiếp tục

Chủ dự án đọc bảng lựa chọn cuối DECISIONS và DESIGN. Cần trả lời B2 lịch sử/nháp, B3 Project đã có hay gồm Lead-only, B4 thẩm quyền cấp/thu hồi/hạn/ủy quyền, B5 người kiểm/phát hành/nguồn/quyền file khách; B1 phương án prerequisite được review, không cho phép merge/cherry-pick. Không cần hỏi lại các nguyên tắc đã xác lập hoặc upload nguồn.

Ghi câu trả lời và nguồn trước khi cập nhật approval. Sau các quyết định, trình written spec đúng phiên bản; chỉ khi được duyệt mới invoke writing-plans, lập PLAN exact source paths/interfaces/assertions/commands, review plan/chọn phương thức. Sau gate mới tạo worktree/test stack được kiểm riêng và bắt đầu TDD TASK1–5. Các bước này chưa được thực hiện hoặc ngầm phê duyệt bởi commit docs.
