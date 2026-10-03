# UI PDF và kích hoạt AI — 04/10/2026

Yêu cầu chủ dự án trong phiên này là đặc tả phạm vi; thực thi INLINE đã được chỉ định.
Đây là thiết kế kỹ thuật theo ủy quyền, không ghi là chủ dự án đã review tài liệu mới.
Baseline sạch `962c79a`, code `d8ce57d`, runtime kiểm thực `local-b5045512d8b0` READY.
Giữ worktree M2, schema83, một writer, cùng Project/chat/AI/source và pipeline release.

## Nguồn và lựa chọn

[Manifest](design-sources.json) ghi tên thật/page/checksum/tỷ lệ. Đã đọc text và ảnh 16 bản chọn;
23 PDF trong thư mục root, không nằm trong worktree. Tên thật không có `(1)`.
S01 Desktop là chính; Refined chỉ tham khảo publication. P04 dùng bản dấu `-`, không bản `&`.
Không đọc Figma MCP; không có Auto Layout/variables. Font trong PDF là Type3 không tên:
dùng font hệ thống có tiếng Việt. Navy `#10182b`, champagne `#b69a61`, nền `#f5f6f8`,
sidebar khoảng240px, desktop1440px/mobile375px là lựa chọn triển khai, không cam kết pixel-perfect.
Chưa tìm thấy asset con lửng độc lập trong web/figma: giữ wordmark Galaxy OS, không vẽ logo mới.

## Map giao diện / chức năng

| Màn, PDF/page               | Component/route                    | API/service                                        | Quyền, hành vi và trạng thái                                                                            | Loại / kiểm                         |
| --------------------------- | ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| F00/1                       | portal-shell, globals.css          | /me, notifications                                 | Giữ navigation theo quyền; menu mobile/focus; cùng theme                                                | A; Web/Chrome                       |
| S01 Desktop/Mobile/States/1 | app/page.tsx, /dashboard           | DashboardController, projects/dashboard            | Snapshot toàn scope; không tiền khi thiếu quyền; drilldown đúng lọc; loading/error/empty                | A/C read projection; API/Web/Chrome |
| P01/P02/1                   | projects/page, project-form        | ProjectsService.list/create                        | Search/sort/page phía API, URL giữ lọc; giữ tạo/xóa có quyền                                            | A/C; API/Web/Chrome                 |
| P03/1                       | projects/:id/overview              | workspace-summary, tasks, products, timeline       | Tách cam kết/thực hiện; task owner/hạn, mốc dự kiến; tài chính theo permission                          | B; Web/Chrome                       |
| P04/1                       | ProjectChat, ChatRoomView          | project-chat rooms/history/messages/files/releases | 4 nhóm; danh sách trái, chat giữa, AI phải; không giả online/read receipt; lock/revoke/retry giữ nguyên | A; M2/Chrome                        |
| AI01/1, AI Panel/1          | ProjectAi, ModelSelector, AiAnswer | ProjectAiService/registry                          | Cùng conversation/index; scope mặc định khác; pin request; private, nguồn/version và policy             | A/C; M3/Web/Chrome                  |
| P05/1                       | products/page, products/:lineId    | ProjectProductsService                             | Hạng mục hiện hữu, sort/page/filter; owner/blocker/revision; giữ detail/write hiện có                   | A/B; API/Web/Chrome                 |
| P06/1, source view/1        | files/page, EntityFiles            | FilesService/uploader                              | Binary có quyền, tên/version khớp, history; AI khác approval; MISSING_BINARY thật                       | A/B; API/Web/Chrome                 |
| STATES/1                    | các component trên                 | contract hiện hữu                                  | Offline/retry/late/revoke; mobile composer; dữ liệu lỗi không thành số0                                 | A; hồi quy                          |

## Khác biệt đã quyết định trong phạm vi

- Không suy `Đã ký` từ PI, phase hoặc approval sản phẩm. Tab commitment chỉ dùng trạng thái hợp đồng khách thật nếu permission cho phép; Lead-only tiếp tục deferred.
- Không diễn giải năm stage triển khai cũ hoặc lịch thi công mẫu là12giai đoạn charter. Giữ deep links nghiệp vụ.
- KPI đếm toàn scope backend, snapshot tại thời điểm response; tiền tách currency, Decimal dạng chuỗi. Không suy từ8task/20project.
- Số tăng trưởng, %thi công, nguồn kết nối kế toán và lịch sử minh họa không có dữ liệu sẽ không tạo giả.
- PDF P06 tên PI nhưng hình bản vẽ: preview phải dùng binary thật cùng FileAsset/version. Không sửa PDF.
- Nguồn AI hiện hỗ trợ chat/publication/text và Gemini native có gate. Nguồn ngoài adapter phải báo đúng; không OCR/vector mới.
- Giữ publication trong phòng khách và đường tới quản trị hiện hữu. Không mở action approval/quote/money mới từ bản vẽ.
- Public đóng; không reset, seed main, chép fixture vào9Project hoặc upload thiết kế vào RAG.

## AI và kiểm thử

Cấu hình CLI0600 ngoài Git, API đọc mới mỗi gate; metadata revision chứng minh nạp cấu hình.
Tách readiness provider khỏi egress Project/source. Đường quản trị kiểm thử tổng hợp dùng adapter thật,
không đòi verified trước lần đầu; evidence chỉ bật modality đã đạt, không boolean do browser tự gửi.
Ba khóa hiện chưa có; đã gửi đúng lệnh nhập ẩn local, phần UI tiếp tục.
Không giới hạn lượt/ngày; concurrency/timeout/context/output/retry hiện hữu giữ nguyên.
UNIT/INTEGRATION/CHROME/LIVE_PROVIDER ghi riêng. Release chỉ sau build/test/review/schema/artifact;
giữ rollback code/config, session/storage/systemd/keeper/Edge; không restore DB.

## Định nghĩa chỉ tiêu S01 và drilldown

Tất cả là snapshot theo scope actor ở thời điểm API trả, không phải doanh số phát sinh theo kỳ.
`/dashboard.asOf` ghi UTC; UI hiển thị giờ máy bằng tiếng Việt. Khối tài chính dùng
`/projects/dashboard` được gọi cùng đợt refresh; hai response không phải một transaction snapshot.

| Chỉ tiêu                                             | Cách đếm / mẫu số                                                                          | Quyền và chi tiết                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Hồ sơ tiềm năng đang xử lý                           | Lead NEW/ASSIGNED/CONTACTED/QUALIFIED, không có mẫu số                                     | crm.lead.read; `/crm/leads?active=true`                                                          |
| Giá trị cơ hội                                       | Tổng estimatedValue, trừ WON/LOST; tách currency, không quy đổi                            | crm.opportunity.read + estimate.read cùng scope; `/crm/opportunities?active=true&financial=true` |
| Dự án đang thực hiện                                 | Project PLANNING/ACTIVE chưa xóa                                                           | project.read; `/projects?active=true`                                                            |
| Công việc quá hạn                                    | dueDate < asOf, trừ DONE/CANCELLED, theo TasksService.visibleWhere                         | task.read; `/tasks?tab=overdue`                                                                  |
| Cơ hội theo trạng thái                               | groupBy stage toàn tập được đọc, không phải tỷ lệ chuyển đổi                               | `/crm/opportunities?stage=...`                                                                   |
| Sức khỏe dự án                                       | groupBy healthStatus; mẫu số là tổng Project trong cùng scope                              | `/projects?health=...`                                                                           |
| Tiền đã thu / phải thu / phải trả / giá trị hợp đồng | Aggregate hiện hữu theo từng permission/currency; không cộng số tiền khác currency         | `/projects/dashboard`; drilldown về danh mục rồi hồ sơ nguồn                                     |
| Ưu tiên / hoạt động                                  | Tối đa8 việc đang mở theo hạn, tối đa8 event Project mới nhất; không dùng làm KPI toàn tập | task.read; giao project.read + activity.read; mỗi dòng về record thật                            |

## Khác biệt bổ sung sau kiểm Chrome

- P02 tái sử dụng form tạo hiện hữu; sau tạo vào Bước1 để khởi tạo hồ sơ, danh sách và các lần mở tiếp theo vào overview mới. Không đổi lifecycle chỉ để khớp tên PDF.
- P01 giữ tổng hợp danh mục trong `<details>`; danh sách/tìm/lọc là nội dung chính. Dữ liệu tiến độ cũ vẫn là field domain, không suy từ số tin nhắn.
- P06 viewer dùng binary thật bên trái và metadata/liên kết bên phải; mobile xếp dọc. Native Chrome PDF có toolbar riêng. PDF có MIME/signature hợp lệ không đồng nghĩa đã làm sạch mọi nội dung chủ động.
- FileAsset chỉ tải vào Project chưa tự thành nguồn AI. Nền M3 hiện lập chỉ mục ChatFile/publication có ACL; UI nêu rõ và giữ link nguồn/room hiện hữu, không tạo index thứ hai hoặc room tự động.
- Chưa có owner/commitment riêng cấp hạng mục trong read contract: hiện đúng thông tin có thật, không thêm enum “đủ phạm vi” hoặc số phần trăm.
- Không có năng lực online/read receipt/call/video/microphone và bộ lọc “Với người/Với AI” tương ứng trong backend hiện tại; không dựng control giả.
- Designer cần bổ sung logo con lửng gốc có thể dùng, font/token có tên, P02 đầy đủ và responsive khi AI fullscreen/nguồn nhiều; không cần export lại để tiếp tục gói này.
