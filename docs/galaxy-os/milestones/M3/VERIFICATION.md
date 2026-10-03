# M3 — Kiểm chứng AI đa nhà cung cấp

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
| CODE_SHA / TESTED_SHA      | `f8a51aacc7dd9ca9ad353842ca1f1f20f321d947`                                                                            |
| TESTED_TREE                | `682ae67171ad42c61a56d716ea14d0632073808b`                                                                            |
| DOCS_COMMIT_SHA            | Commit cập nhật báo cáo này; SHA chính xác ghi trong phản hồi bàn giao, không tự ghi hash vào nội dung tạo ra hash đó |
| DEPLOYED_LOCAL_RELEASE     | `local-665429741c6f`                                                                                                  |
| SOURCE_DIGEST              | `665429741c6fbdb9a03e392b4de36642a4f8b6383e8d274edf5e9ea7279f3bf6`                                                    |
| WEB_BUILD_ID               | `WElPBvqSwo1rB4-KZF68S`                                                                                               |
| ARTIFACT                   | `/home/galaxy_os/.runtime/releases/ai-multi-20261003` — build Web/API/Edge PASS từ source commit sạch                 |
| SCHEMA                     | 83 migration, fingerprint giữ nguyên; không migration/ledger/DB restore                                               |
| SYSTEMD                    | API361132, Web361133 READY; root `local:up` tái sử dụng nguyên PID                                                    |
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

Receipt: `release-build.log`, `cutover.log`, `deployed-status.json`,
`deployed-artifacts.log`, `systemd-config.json`, `main-browser.json`,
`root-local-up.json` trong thư mục evidence ignored. Artifact verifier báo
`ARTIFACTS_VERIFIED`; schema preflight read-only so sánh đúng baseline. Source edit/
commit docs sau build không đổi artifact đang phục vụ. Thiếu3key không làm health lỗi.

Rollback code/config đã chuẩn bị tại
`/home/galaxy_os/.runtime/ai-multi-20261003/rollback/`: giữ manifest và2unit cũ,
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
