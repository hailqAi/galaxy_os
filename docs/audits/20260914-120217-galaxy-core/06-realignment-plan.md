# Phương án đưa Galaxy OS về cốt lõi v0.2

Tài liệu này là phương án để chủ dự án duyệt, **chưa triển khai**. Thứ tự cố ý sửa các invariant dùng chung trước, rồi mới nối một luồng MVP; không mở thêm ERP/AI/portal.

## Nguyên tắc

- Giữ một Project, IAM, Task, FileAsset, Approval và các domain thương mại/vận hành hiện có.
- Mỗi fix phải có regression deny + allow ở đúng binding/Project; bảo vệ manager hợp lệ, không chỉ test admin.
- Migration chỉ additive, tạo bằng command repository, review SQL; không sửa migration đã áp dụng, không reset data.
- Trường tài chính phải Decimal/currency-explicit; khi policy công thức chưa có thì chặn/hiển thị thiếu thay vì tự quy đổi.
- Mốc approved/signed/posted phải bất biến; sửa bằng revision/reversal có audit, không overwrite.

## Wave 0 — Chặn lộ dữ liệu và phục hồi build

| Disposition | Phạm vi                           | Phụ thuộc/rủi ro dữ liệu                              | Tiêu chí nghiệm thu                                                                                     |
| ----------- | --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| FIX         | SEC-01 search Project predicate   | Không migration                                       | SELF actor không thấy Project khác cùng org; actor đúng binding vẫn tìm được                            |
| FIX         | SEC-02 audit projection           | Cần map entity→Project; không xóa audit snapshot      | Actor thiếu finance/project không nhận cost/margin; authorized audit+finance actor vẫn truy history     |
| FIX         | AUTH-01 capability-specific scope | Ảnh hưởng nhiều IAM/CRM/Task callers                  | Binding hẹp không mượn scope rộng; các manager allow tests vẫn pass                                     |
| FIX         | AUTH-02/03 target role/department | Không đổi role catalogue                              | Protected/equal-tier/cross-dept deny; đúng scope allow                                                  |
| FIX         | AUTH-04/05/06 field projections   | Cần inventory custom field types                      | Không lộ customData/budget/notification qua response phụ; authorized read không bị mất                  |
| FIX         | MKT-01 tenant association         | Có thể cần composite FK additive sau cleanup          | API reject campaign/reviewer/approver khác tenant; existing valid rows giữ được                         |
| FIX         | FIN-01 replay scope/disclosure    | Guard tenant/target/payload trước khi migration       | Key trùng khác tenant/target/payload không trả record hiện hữu; exact replay cùng target vẫn idempotent |
| FIX         | BUILD-01 và QUALITY-01            | Dependency type đúng version hiện dùng; 6 file format | Clean frozen install → generate → typecheck/build/format pass                                           |

## Wave 1 — Bảo vệ tiền, retry và concurrency

| Disposition | Phạm vi                               | Phụ thuộc/rủi ro dữ liệu                                       | Tiêu chí nghiệm thu                                                                              |
| ----------- | ------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| FIX         | FIN-01 ràng buộc idempotency bền vững | Migration unique additive; cần kiểm tra key trùng trước deploy | Unique key mang tenant/target; concurrent exact replay chỉ tạo một effect                        |
| FIX         | FIN-02 amount/rate/currency           | Owner chốt conversion; mặc định tối thiểu same-currency        | Reject amount/allocation/rate <=0; no nominal cross-currency subtraction; rounding tests         |
| FIX         | FIN-03 append schedules               | Lock Contract; policy total/overbooking                        | Nhiều lần append tạo sequence liên tục, không vượt contract theo rule được duyệt                 |
| FIX         | FIN-04/05 appendix application        | Owner chốt retention baseline/current; migration unique event  | Exactly-once dưới retry/concurrency; same currency; history thành chuỗi nhất quán                |
| FIX         | OPS-01 shipment add-item              | Reuse shipment-create transaction/lock                         | Hai concurrent calls không làm tổng > PO remaining; retry deterministic                          |
| FIX         | OPS-02 handover acceptance coverage   | Cần link item/evidence, migration additive có backfill         | Chỉ item đã acceptance được handover; override có permission + reason + audit nếu owner cho phép |
| FIX         | MKT-02 variant immutability           | Chỉ cần guard/state transition                                 | Variant sau submit/approve/schedule không đổi trực tiếp; revision phải review lại                |

## Wave 2 — Khép một chuỗi MVP ở cấp dòng

| Disposition | Phạm vi                                                    | Phụ thuộc/rủi ro dữ liệu                                                          | Tiêu chí nghiệm thu                                                                                               |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| INTEGRATE   | CORE-01 source IDs/version                                 | Chọn một loại Project pilot giả lập; migration nullable + backfill trước NOT NULL | Một item truy ngược/xuôi selection revision→estimate→quotation→contract→PR/PO→receipt→install→acceptance→warranty |
| FIX         | CORE-02 contract accepted terms/version                    | Không overwrite hợp đồng cũ; backfill `unknown` có giải thích                     | Contract mới snapshot đúng quotation version/terms; sửa quotation sau đó không đổi contract                       |
| FIX         | CORE-03/04 revision invariants                             | Reuse Product/Quotation revision pattern                                          | Survey approved immutable; rejected estimate revise/resubmit có lineage                                           |
| CONFIGURE   | Stage gates song song                                      | Owner chốt global vs item/workstream gate                                         | A blocked không chặn B nếu policy cho; không bypass global control ngầm                                           |
| KEEP        | Inventory ledger, file/version/approval, canonical domains | Không tạo duplicate models                                                        | Existing idempotency/files/manager allow regression vẫn xanh                                                      |

## Wave 3 — Điều hành và UX tối thiểu

| Disposition | Phạm vi                                     | Phụ thuộc/rủi ro dữ liệu                    | Tiêu chí nghiệm thu                                                                          |
| ----------- | ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| FIX         | UX-01 queue toàn scope                      | Reuse Project/Task summaries                | Pagination đúng, không empty giả; filter department/project/persona server-side              |
| FIX         | UX-02 owner/hạn/căn cứ/route                | Backend đã có phần lớn fields               | Mỗi blocker trả lời được ai/vì sao/evidence/decision/next action                             |
| INTEGRATE   | Project dashboard money–goods–progress–risk | Cần source link Wave 2 và formula decision  | Mỗi KPI drill về source, group currency, missing-data marker; không double-count join        |
| CONFIGURE   | Role manager nghiệp vụ                      | Owner chốt role/binding; không cấp theo tên | Department/Project manager chỉ có action được giao, đúng scope; membership không cấp finance |
| CONFIGURE   | Refresh model                               | Chốt SLA; mặc định refresh explicit         | UI ghi rõ thời điểm cập nhật; chỉ thêm polling/event khi SLA yêu cầu                         |

## Phần giữ, để sau hoặc đề nghị retire

| Disposition     | Phần                                                                                                                                             | Điều kiện                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| KEEP            | Modular monolith Next/Nest/Prisma/Postgres, Redis infra hiện có                                                                                  | Không nâng stack trong realignment                                                                              |
| KEEP            | CRM conversion, Project canonical, ProjectProduct revisions, quotation revisions, inventory ledger, files/uploads, existing self-approval guards | Mở rộng test tại invariant, không viết lại                                                                      |
| KEEP            | Project Workspace 5-stage shell như lớp điều hướng                                                                                               | Hiển thị mapping rõ sang 12 business stages; không gọi shell là domain hoàn tất                                 |
| CONFIGURE       | Optional funding-source compatibility                                                                                                            | Owner quyết định dùng cho loại Project nào; không bắt buộc Galaxy core                                          |
| RETIRE_PROPOSAL | Public-investment-only UI/rules nếu không còn product owner                                                                                      | Chỉ lập migration/deprecation plan sau inventory dữ liệu; không xóa enum/applied migration trực tiếp            |
| DEFER           | Live marketing publisher                                                                                                                         | Chỉ sau khi owner xác nhận scope, khóa approval integrity, secret/provider isolation và revocation-at-execution |
| DEFER           | Document AI                                                                                                                                      | Chỉ sau khi row/file authorization filter có contract và eval; hiện health placeholder                          |
| DEFER           | Full accounting/payroll/deep HR/advanced multi-warehouse/customer/supplier portals/mobile                                                        | Đúng danh sách để sau của CORE v0.2                                                                             |

## Disposition cho các gap CORE chưa nằm trong Wave triển khai

| ID traceability              | Disposition                            | Phụ thuộc / phạm vi nghiệm thu                                                                                                       |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `CORE-GATE-04`               | `INTEGRATE`                            | Khóa đóng Project bằng hồ sơ warranty + công nợ sau khi owner chốt định nghĩa “đóng”; Wave 2 chưa đạt full-core nếu gate này chưa có |
| `CORE-HIST-02`, `ST03-01/02` | `INTEGRATE`                            | Vòng đời drawing/design version là core; tái sử dụng File/Requirement, không tạo kho file thứ hai                                    |
| `ST07-03/04`                 | `NEEDS_OWNER_DECISION` rồi `INTEGRATE` | Chốt nguồn dòng tiền, currency/rate và công thức 30/60/90; dashboard Wave 3 không được gọi là hoàn chỉnh trước đó                    |
| `CORE-GATE-01`               | `INTEGRATE`                            | Nối đúng customer-payment condition với PO/item; không suy “đủ tiền” từ contract total                                               |
| `CORE-HIST-07`, `ST11-04`    | `INTEGRATE`                            | Một change-request lineage qua impact/approval/appendix/notify; reuse Appendix/Activity/Notification                                 |

Các Wave 0–3 là thứ tự sửa tối thiểu, **không phải chứng nhận Galaxy OS đã đủ toàn bộ CORE v0.2**. Gap được `DEFER` hoặc còn chờ owner phải xuất hiện rõ trong acceptance report.

## Thứ tự triển khai đề nghị

1. Duyệt `07-owner-decisions.md`, đặc biệt currency/retention/gates/delegation/role manager.
2. Wave 0 thành một scope sửa độc lập; chạy security/correctness/Ponytail review.
3. Wave 1 theo từng invariant, migration riêng nếu cần; concurrency tests trên disposable Postgres.
4. Wave 2 chỉ một pilot dataset mô phỏng Mansion Quận 7, không dùng hồ sơ thật.
5. Wave 3 sau khi source lineage đủ để dashboard drilldown có nghĩa.
6. Chỉ đánh giá marketing/AI/deferred scope sau core acceptance.

## Điều kiện nghiệm thu toàn realignment

- 12 audit scenarios chạy trên environment test cô lập với ít nhất một allow và một deny non-admin cho mỗi capability nhạy cảm.
- Không lộ cost/margin/custom values qua API/file/export/search/dashboard/audit/notification.
- Payment/appendix/shipment/receipt/acceptance chịu được retry và concurrent operations mà không double effect.
- Mỗi cam kết pilot truy được version, actor, approval, remaining và downstream result.
- Dashboard group currency hoặc conversion theo policy được duyệt; mọi KPI có source và missing-data explanation.
- `pnpm lint`, clean-install `pnpm typecheck`, safe unit/integration/browser, `pnpm build`, `pnpm format:check`, Prisma validate đều có bằng chứng mới.
