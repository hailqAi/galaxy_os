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
`browser-m3-production.log`. Artifact build/cutover được ghi riêng khi hoàn tất.

Các red→green có ý nghĩa: host/effort/secret allowlist, provider mapping và thought
filter; policy/config/key thay trong I/O; cancel reservation; legacy env không còn
outbound. Fixtures dùng hai tenant/Project/room và ACL/history/publication cũ của M3.
Native PNG đi đúng Gemini+version/citation, text-only từ chối raw binary; parser PDF
thực kiểm1trang. Không có provider file handle, nên expiry/replay handle N/A.

M3 browser kiểm Gemini→Kira→Mistral cùng conversation/index, nhãn answer cũ; lost POST
retry giữ model và payload, giữ nháp khác sau completion; saved model disabled
không fallback; source mở đúng và reload; revoke/đổi actor ẩn dữ liệu dẫn xuất.
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

## Release local

Chưa cutover ở checkpoint source này. Gate cuối sẽ cập nhật code/tested/tree SHA,
release ID, health, env systemd, Chrome3000 và rollback ngay sau phát hành local.
[Handoff/Figma và contract](HANDOFF.md) là nơi bàn giao hiện hành trong bộ M3.

`PUBLIC_DOMAIN: REMAINS_CLOSED` · `GIT_PUSH_MERGE: NOT_PERFORMED`.
