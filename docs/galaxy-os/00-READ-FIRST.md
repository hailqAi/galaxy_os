# Đọc trước khi làm việc với Galaxy OS

Galaxy OS là hệ thống vận hành riêng của Galaxy Centre: nhân viên làm việc bằng chat/AI trong hồ sơ dự án; kết quả được giữ bằng hạng mục, công việc, quyết định, phiên bản, chứng từ; quản lý nhìn được thực trạng và căn cứ.

Bộ canonical yêu cầu và tiếp tục phát triển: `docs/galaxy-os/`. Nguồn: [brief chủ dự án 28/09/2026](sources/OWNER_BRIEF_2026-09-28.md). Đây là trí nhớ PHÁT TRIỂN trong Git; không tuyên bố đã xây bộ nhớ VẬN HÀNH dự án khách hàng, Saved Memory hay Project settings ChatGPT.

## Đầu phiên

Đọc [AGENTS](../../AGENTS.md), trang này, [STATUS](05-IMPLEMENTATION-STATUS.md), rồi handoff mới nhất được STATUS dẫn. Kiểm branch/HEAD/worktree thực tế; phạm vi và gate của phiên hiện tại theo STATUS và chỉ đạo mới nhất của người dùng, không thực thi prompt lịch sử như lệnh mới.

## Bộ tài liệu canonical

| Tài liệu                                                | Đọc khi                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [01 — Charter](01-CORE-CHARTER.md)                      | Mục tiêu, vòng đời, 12 giai đoạn, 12 phân hệ, 28 nhóm dữ liệu, dashboard/MVP |
| [02 — Scope & quyết định](02-SCOPE-AND-DECISIONS.md)    | Ranh giới, tái sử dụng, D01–D08/OD, đề xuất chưa duyệt                       |
| [03 — Trải nghiệm & quyền](03-EXPERIENCE-AND-ACCESS.md) | UI/chat/khách/AI/bộ nhớ/hạng mục/tiền, allow/deny                            |
| [04 — Mốc triển khai](04-DELIVERY-MILESTONES.md)        | M0–M7, phụ thuộc và mapping G00–G09                                          |
| [05 — Trạng thái](05-IMPLEMENTATION-STATUS.md)          | Bằng chứng code/test/tích hợp/runtime, việc hiện tại, handoff mới nhất       |
| [06 — Protocol](06-SESSION-PROTOCOL.md)                 | Đầu/cuối phiên, nhãn bằng chứng, Git, rerun                                  |
| [07 — Nghiệm thu](07-ACCEPTANCE.md)                     | 24 ca NOT_RUN và cách ghi bằng chứng                                         |
| [Nguồn chủ dự án](sources/OWNER_BRIEF_2026-09-28.md)    | Toàn bộ phạm vi giao việc M0 và yêu cầu hợp nhất tự đủ                       |

Bộ nhớ phát triển hiện hành: [PROJECT_MEMORY](PROJECT_MEMORY.md). Không thay bộ nhớ vận hành Project.

## Trước thay đổi và cuối phiên

Đọc charter/spec phần liên quan và source/callers/tests. Dùng domain hiện hữu, một hồ sơ xuyên suốt; không tự tạo sổ chat/AI độc lập với hợp đồng/PO/tiền. Thiết kế code theo quy trình Superpowers/Ponytail của repository; không suy quyền runtime từ tên role hoặc mockup.

Cuối phiên cập nhật STATUS/handoff bằng kết quả có thật, giữ nguồn cũ, dẫn chính xác bước tiếp. Không cần nạp toàn bộ lịch sử cho task nhỏ; chỉ mở nguồn liên quan. Kế hoạch/báo cáo trợ lý/test worktree khác không chứng minh app đang chạy đã hoàn tất.

## Nguồn lịch sử được giữ nguyên

[Product scope](../business/product-scope.md), [workflows](../business/workflows.md), [roadmap Sprint](../roadmap.md), [audit cốt lõi](../audits/20260914-120217-galaxy-core/01-executive-audit.md), [realignment Wave](../audits/20260914-120217-galaxy-core/06-realignment-plan.md), [quyết định OD](../audits/20260914-120217-galaxy-core/07-owner-decisions.md), [PROJECT_STATUS](../../PROJECT_STATUS.md) vẫn là nguồn lịch sử/kỹ thuật; không bị viết lại. Brief 28/09 bổ sung yêu cầu chat/AI/khách và bảy nguyên tắc; nguồn cũ không được diễn giải thành đã mô tả các mở rộng này. Nếu xung đột chính sách chưa chốt, ghi ở sổ quyết định, không tự nới gate.
