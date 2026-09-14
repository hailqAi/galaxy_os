# Phạm vi và trạng thái audit

## Trạng thái

**PARTIAL** — checkpoint và audit/report cục bộ thực hiện được; push bị chặn do remote public; integration/browser/concurrency DB và toàn bộ allow/deny của 477 actions chưa chạy vì không có environment test cô lập. PARTIAL là trạng thái bằng chứng audit, không phải phần trăm hoàn thành ứng dụng.

## Đã đọc/đối chiếu

- Toàn bộ phụ lục CORE v0.2 trong yêu cầu: mục tiêu, bốn nguyên tắc, 12 giai đoạn, 28 nhóm dữ liệu, dashboard, 12 phân hệ, MVP, phần để sau và pilot.
- Root/package scripts, pnpm workspace/lockfile, CI, compose, env examples, ignore, Git history/log, status/diffs/outbound objects, remote metadata.
- Prisma schema và migrations liên quan IAM, Project, commercial/contracts, procurement, production/logistics, inventory/receiving, installation/after-sales, marketing/publishing, custom fields/files/uploads.
- 49 controller files và inventory 477 HTTP actions bằng TypeScript AST; toàn bộ route/decorator/path:dòng đã được chép vào `03-authorization-matrix.csv`. Đọc sâu các action IAM, search, dashboard, audit, notification, files/uploads/import, Project stages, product/commercial/contracts/procurement/logistics/inventory/installation/after-sales/marketing.
- Web routes/navigation/dashboard/Project workspace Stage 1–5, actions/alerts, Task list/detail, marketing/publishing UI, API proxy.
- Historical sources: security/financial permission, Sprint1 gap, PMS mapping/parity/live reference audit, roadmap/status/sprint docs. Completion claims cũ chỉ là history, không là current verification.
- Test configs và 96 test files: API src 48, API integration 8, API health 1, Web unit 29, browser 8, Edge 1, Python 1.

## Đã chạy

- Clean/offline frozen install và Prisma generate trong detached worktree.
- Lint, format check, clean typecheck, schema validate, API/Web/Edge/Python unit/health, root build với production config giả.
- 1.499 unit/health tests pass; format/typecheck/root build fail như ghi ở `05-verification.md`.
- Năm memory-only reproductions cho search, role target, marketing variant, notification projection và customer payment âm/khác currency.
- Không có source ứng dụng/test/config/schema/migration cũ nào bị sửa trong cây chính.

## Chưa khảo sát hoặc chưa chạy đủ

| Phạm vi                    | Trạng thái                | Lý do                                                                                                                                         | Bước tiếp theo an toàn                                                                                             |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 477 action end-to-end      | `PARTIAL`                 | Inventory route/decorator đầy đủ trong CSV03; target/state/sensitive-field/test mới deep trace theo vùng rủi ro, chưa đủ mọi endpoint/persona | Review tuần tự theo module từ inventory hiện có; bổ sung allow/deny trên disposable environment sau owner approval |
| Live role/user assignment  | `NOT_RUN`                 | Không đọc DB thật/dữ liệu nhạy cảm                                                                                                            | Dùng sanitized fixture/tenant test riêng                                                                           |
| API integration            | `BLOCKED`                 | Tests mặc định DB local và mutate/cleanup                                                                                                     | Disposable Postgres riêng, URL bắt buộc có marker test, migrate deploy/seed fixture                                |
| Browser acceptance         | `BLOCKED`                 | Global setup/teardown mutate DB; chưa có isolated services/accounts                                                                           | Chạy configs hiện có trên stack test disposable, capture screenshots đã redact                                     |
| Redis/background/cache     | `NOT_RUN`                 | Không có isolated Redis; app use chưa được chứng minh đầy đủ                                                                                  | Inventory clients/jobs, run riêng nếu core flow dùng                                                               |
| Storage/file download E2E  | `NOT_RUN`                 | Unit mạnh; storage adapter test riêng chưa provision                                                                                          | Temp storage root + test actor matrix                                                                              |
| Concurrency/idempotency DB | `NOT_RUN`                 | Cần real constraints/transactions                                                                                                             | Parallel requests trên disposable Postgres; assert ledger/remaining/history                                        |
| Dashboard reconciliation   | `NOT_RUN`                 | Không có shared financial fixture/source truth                                                                                                | Fixture đa currency/nhiều đợt, reconcile source rows→API→UI                                                        |
| AI authorization           | `NOT_APPLICABLE` hiện tại | Service chỉ health placeholder                                                                                                                | Chỉ audit khi có retrieval/action implementation                                                                   |
| Live marketing publish     | `NOT_APPLICABLE` hiện tại | Feature disabled default, fake provider                                                                                                       | Owner decision + sandbox provider trước mọi live adapter                                                           |
| LFS                        | `BLOCKED`                 | git-lfs executable hỏng; repo không có `.gitattributes`                                                                                       | Sửa toolchain ngoài source nếu owner xác nhận dùng LFS                                                             |
| Remote backup/push         | `BLOCKED`                 | Origin public, trái yêu cầu private/safe                                                                                                      | Owner sửa visibility/quyền ngoài phiên; xác minh lại trước dry-run/push                                            |

## Giới hạn kết luận

- Không dùng tên model, migration count, test count, report cũ hoặc route existence để kết luận IMPLEMENTED/VERIFIED.
- `IMPLEMENTED` trong ma trận nghĩa có call path hiện hành; evidence vẫn có thể `STATIC_ONLY`.
- Không có dữ liệu Mansion Quận 7 thật được dùng; pilot chỉ được nhắc như requirement.
- Không có phần trăm “đúng hướng” vì chưa có mẫu số acceptance được owner chuẩn hóa ngoài traceability rows.
- Findings concurrency/cross-tenant static có confidence cao từ code path, nhưng chưa được gọi là exploit production đã xảy ra.
- Không đánh giá data migration/backfill feasibility trên dữ liệu thật; mọi đề xuất migration đều phải có inventory/read-only dry analysis ở phiên sau.

## File audit

- `00-checkpoint.md`: Git checkpoint/push blocker.
- `01-executive-audit.md`: kết luận điều hành.
- `02-core-traceability.csv`: đối chiếu yêu cầu nhỏ.
- `03-authorization-matrix.csv`: 127 hàng capability/đề xuất và 477 hàng endpoint inventory; action/permission/scope/enforcement/test chưa kiểm chứng riêng mọi endpoint được ghi `PARTIAL`.
- `04-findings.md`: finding và đường gọi.
- `05-verification.md`: lệnh/kết quả/môi trường.
- `06-realignment-plan.md`: KEEP/FIX/INTEGRATE/CONFIGURE/RETIRE_PROPOSAL/DEFER.
- `07-owner-decisions.md`: chính sách cần quyết định.
- `08-coverage.md`: phạm vi và giới hạn.
