# Phạm vi, nguồn thẩm quyền và quyết định

## 06/10/2026 — AI riêng thống nhất theo Project

OWNER_APPROVED_CURRENT_PROMPT: chủ dự án phê duyệt trực tiếp “GALAXY OS — ĐƠN GIẢN HÓA AI THÀNH CHAT THEO DỰ ÁN”, thực thi INLINE. Phê duyệt này thay điều kiện pilot chung SYNTHETIC_PUBLIC_APPROVED, GENERAL_ONLY và duyệt từng câu đối với OpenRouter đang bật, đúng tenant Galaxy, actor có quyền AI và nguồn trong Project được phép. Không mở tenant/provider/model trả phí khác; không thay credential hoặc privacy vendor. Restriction/revocation riêng, IAM, quyền tài chính, nguồn riêng, version và mọi duyệt nghiệp vụ giữ nguyên.

Luồng được duyệt: mở Project → Galaxy AI → nhập/chọn tệp → Gửi; server xác minh conversation/Project/nguồn, tự retrieval và lưu answer có nguồn. Không mode selector hoặc control approve/revoke/synthetic trong composer. File AI riêng dùng binary/version hiện hữu, không cần phòng công khai. Quyết định, kế hoạch và giới hạn kiểm chứng ở [Chat AI thống nhất](milestones/M3/UNIFIED-CHAT.md); các mục cũ bên dưới là lịch sử, không phủ định quyết định mới.

Nguồn mới: [OWNER_BRIEF_2026-09-28](sources/OWNER_BRIEF_2026-09-28.md), nhãn OWNER_REQUIREMENT. Nguồn lịch sử: [sổ OD-01–OD-24](../audits/20260914-120217-galaxy-core/07-owner-decisions.md), [roadmap Sprint](../roadmap.md), [phương án realignment](../audits/20260914-120217-galaxy-core/06-realignment-plan.md). Các tài liệu cũ được giữ nguyên làm nguồn lịch sử; kế hoạch cũ không tự là lệnh đang có hiệu lực.

## Yêu cầu đã có nguồn và phần chưa được phê duyệt

- Đã có yêu cầu sản phẩm: một hồ sơ xuyên suốt, 12 giai đoạn, 12 phân hệ, 28 nhóm dữ liệu, bốn nhóm Làm việc, chat nội bộ/khách/đối tác tách vùng, AI có nguồn, dùng lại domain, phân quyền xuyên mọi kênh.
- Đã được giao thực hiện trong phiên này: M0 docs/hướng dẫn, kiểm tra và commit local đúng phạm vi nếu an toàn. Không cần giao lại quyền lưu tài liệu.
- Định hướng UI là yêu cầu trải nghiệm; mẫu “Không truy cập / Chỉ xem / Trao đổi / Phụ trách mục” là đề xuất UX, chưa tạo role/binding. Kiến trúc/schema/route cụ thể phải qua thiết kế được duyệt trong lượt coding sau.
- Yêu cầu mới cho chat khách/đối tác và AI đa năng bổ sung phạm vi từng được để sau trong audit/roadmap. Không sửa nguồn cũ thành “đã yêu cầu từ v0.2”, không coi kế hoạch là đã triển khai.
- Marketing/Publishing cho hai hệ sinh thái Galaxy: OWNER_REQUIREMENT xác nhận có yêu cầu lịch sử. Roadmap có Sprint 12/13 và AppModule hiện có feature flag; không suy ra phê duyệt bật, provider thật, quyền ngoài hoặc trạng thái runtime.
- M0 chỉ là trí nhớ phát triển trong repository; bộ nhớ vận hành khách hàng là mục tiêu M2–M5. Không có thao tác Saved Memory/Project settings ChatGPT.

## N. Tái sử dụng nền hiện có

Không xóa toàn bộ Galaxy OS. Tách công việc nghiệp vụ, hạ tầng upload/FileAsset và job xử lý nền như đọc file/index/export nếu thực có. UI nặng upload không có nghĩa hạ tầng file phải bỏ.

Giữ sau kiểm chứng: Project, IAM/session, FileAsset/version/download, Task, Approval, audit, notifications, commercial, procurement, inventory, installation, after-sales và Document AI thực có.

Chat/AI dùng lại nguồn/domain; không tạo sổ hợp đồng/PO/thanh toán riêng cho AI, không tạo upload service thứ hai để né lỗi upload chưa đóng. Không bắt nhân viên nhập đủ rồi xuất PDF và upload lại chỉ để đủ gate. Hồ sơ cần bản ký/bản phát hành vẫn phải có đúng căn cứ; thay loại chứng cứ cần chính sách rõ, không tự nới gate.

Chỉ ngừng UI/mã cũ sau khi xác minh sử dụng, thay thế được nghiệp vụ, test hồi quy và có phương án quay lại. Không xóa migration/dữ liệu/lịch sử.

## P. Các quyết định còn mở

Tất cả D01–D08 là OPEN / AWAITING_OWNER_DECISION. Không tự giải quyết bằng suy đoán.

| ID  | Nội dung cần chốt                                                                        | Phần phụ thuộc                                   |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D01 | Ai xem giá vốn/lợi nhuận; ai kiểm tra/duyệt/phát hành; hạn mức và tách người lập–duyệt   | Quyền tài chính, phê duyệt, dashboard, phát hành |
| D02 | Currency quản trị; nguồn/ngày/hướng tỷ giá; thuế, làm tròn, phân bổ, công thức lợi nhuận | Tính tiền, quy đổi, lợi nhuận, bảng và dashboard |
| D03 | Gate theo toàn dự án/hợp đồng/gói/hạng mục; trường hợp không áp dụng, hạng mục song song | Kiểm tra điều kiện từng hành động                |
| D04 | Bàn giao còn lỗi, từng phần, điều kiện đóng, công nợ còn lại                             | Nghiệm thu, bàn giao, bảo hành                   |
| D05 | Delegation, phạm vi/thời hạn/trần quyền, admin cuối cùng đủ điều kiện                    | IAM, thu hồi quyền, quản trị                     |
| D06 | Phạm vi dữ liệu AI, lưu trữ, chia sẻ ngoài, nháp riêng, AI trả lời trực tiếp khách       | Retrieval, công cụ, lưu/delivery AI              |
| D07 | Quyền sửa/gỡ tin, giữ lịch sử, thêm thành viên, lịch sử được công bố                     | Chat, invitation, công bố                        |
| D08 | Phạm vi Marketing/Publishing đã quyết định và tích hợp ngoài thực sự được phép           | Marketing, kết nối và phát hành                  |

Hai mâu thuẫn phải giữ:

- v0.2 được mô tả là không bàn giao khi lỗi chưa hoàn thành, nhưng danh mục bàn giao có lỗi tồn tại và hạn sửa.
- Biên bản giao nhận ở điều kiện xuất kho cần tách phần chuẩn bị trước giao và phần ký sau giao.

Không tạo ngoại lệ hoặc bản ký giả; chỉ chặn phần phụ thuộc quyết định thiếu. Quyết định mới cần người quyết định, nguồn, ngày hiệu lực, phạm vi và tiêu chí kiểm thử.

## Đối chiếu quyết định lịch sử, không xóa câu hỏi cũ

| Quyết định mới | OD lịch sử liên quan                       |
| -------------- | ------------------------------------------ |
| D01            | OD-09, OD-10, OD-13, OD-14                 |
| D02            | OD-05, OD-07, OD-08                        |
| D03            | OD-03; OD-04 liên quan thời điểm gắn hồ sơ |
| D04            | OD-01, OD-20, OD-21                        |
| D05            | OD-11, OD-12                               |
| D06            | OD-15, OD-19                               |
| D07            | Chưa có OD tương đương đầy đủ              |
| D08            | OD-17, OD-18                               |

OD-02 (giao nhận), OD-06 (công thức tiến độ), OD-16 (funding-source), OD-22 (nguồn chấp thuận hợp đồng), OD-24 (SLA cập nhật) vẫn cần nguồn quyết định nếu phần triển khai phụ thuộc. OD-23 được đáp ứng một phần bằng nguồn hợp nhất hôm nay; raw v0.2 vẫn chưa tìm thấy. Mapping không tự đóng OD hay duyệt các phương án từng nêu.

## Lead / Opportunity / Project: đề xuất để duyệt sau M0

REPO_OBSERVED tại baseline trong STATUS:

- [Schema](../../apps/api/prisma/schema.prisma) có Lead riêng, Opportunity.leadId unique tùy chọn, Project.opportunityId unique tùy chọn; một Customer có thể gắn nhiều Project.
- [LeadsService.convert](../../apps/api/src/leads/leads.service.ts) tạo Opportunity, giữ leadId, đổi trạng thái Lead và ghi Activity.
- [OpportunitiesService.createProject](../../apps/api/src/opportunities/opportunities.service.ts) trả Project đã liên kết nếu có; lần đầu có thể tìm/tạo Customer, Contact, tạo Project và Activity. Đây là đọc code, không phải test concurrency hay chứng nhận đủ vòng đời mới.

Đề xuất tối thiểu để M1/M2 thiết kế: giữ ID và quan hệ hiện có; đọc hồ sơ xuyên chuỗi bằng liên kết, giữ nguồn/lịch sử ở nơi gốc. Khi Project đã tồn tại, đổi chăm sóc/cam kết/thực hiện không tạo lại Project/Customer hoặc sao chép chat/file/nghĩa vụ. Cần duyệt cách định danh hồ sơ ổn định trước khi có Project và cách liên kết dữ liệu cũ; không tự chọn ID mới hoặc gộp bảng. Tách trạng thái chăm sóc khỏi hiệu lực hợp đồng và tiến độ. Kiểm thử một khách hai công trình và đi-về nhiều lần trước nghiệm thu. Đề xuất này chưa là thiết kế triển khai được duyệt.

## Rào an toàn M0

Được đọc source/docs/Git trong repo và các worktree cùng repo đã chỉ định; viết docs, bổ sung block AGENTS, ghi nguồn/trạng thái, kiểm tra, commit local đúng tập file.

Không sửa ứng dụng/API/UI/schema/migration/IAM/dependency/lockfile/runtime config/test; không reset/seed/migrate DB đang dùng; không gửi email, xuất bản, thanh toán/đặt hàng thật; không xóa hay ghi đè lịch sử/dữ liệu/báo cáo cũ; không reset/clean/stash, amend/rebase/force push, bypass hooks/guard hoặc tự merge worktree/branch. Không đổi remote/visibility/quyền chia sẻ; không push/release/deploy, không đưa source/khách/secrets ra ngoài, không sửa global instructions hay tạo override.

Giữ hướng dẫn repository, guard và Ponytail. Blocker của một thao tác được ghi đúng và không dừng phần độc lập an toàn. Index có thay đổi ngoài lượt này phải giữ nguyên; không commit cuốn theo. Chỉ cấp quyền hiện tại của người dùng mới cho phép bước kế tiếp, không dùng prompt đã lưu để tự tiếp tục M1–M7.
