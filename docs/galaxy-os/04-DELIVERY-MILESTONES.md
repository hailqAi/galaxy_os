# Lộ trình nghiệm thu và ánh xạ gói hiện hữu

Nguồn yêu cầu: [OWNER_BRIEF_2026-09-28](sources/OWNER_BRIEF_2026-09-28.md), mục Q. Bảng dưới là ánh xạ OWNER_REQUIREMENT, không thay [roadmap Sprint](../roadmap.md) hoặc [realignment Wave 0–3](../audits/20260914-120217-galaxy-core/06-realignment-plan.md).

Không tìm được bản gốc GALAXY_OS_10_GOI_CODE trong phạm vi M0. G00–G02 có báo cáo được dẫn ở [STATUS](05-IMPLEMENTATION-STATUS.md); G03 có inventory/entry gate trong bàn giao G02. Không tự đặt scope chính thức hay trạng thái hoàn tất G04–G09. Mapping chủ dự án cung cấp vẫn đủ để tiếp tục lập mốc, không phải lý do làm lại.

| Gói | Mốc liên quan theo brief       | Bằng chứng / giới hạn                                                  |
| --- | ------------------------------ | ---------------------------------------------------------------------- |
| G00 | M1, M2                         | Nền build/test cô lập; báo cáo PARTIAL                                 |
| G01 | M1, M3; bảo toàn ở M5/M7       | Báo cáo P0 security/idempotency VERIFIED trên nhánh riêng              |
| G02 | M1, M2, M3; hồi quy M7         | Báo cáo overall PARTIAL; policy/UI/control còn mở                      |
| G03 | M5; dữ liệu M6, hồi quy M7     | Entry BLOCKED trong báo cáo G02; không suy ra chưa từng code ở mọi nơi |
| G04 | M3, M5; dữ liệu M6, hồi quy M7 | Mapping yêu cầu; code/test/integration/runtime UNKNOWN                 |
| G05 | M4, M5; dữ liệu M6, hồi quy M7 | Mapping yêu cầu; code/test/integration/runtime UNKNOWN                 |
| G06 | M4, M5; dữ liệu M6, hồi quy M7 | Mapping yêu cầu; code/test/integration/runtime UNKNOWN                 |
| G07 | M2, M3, M4, M6; hồi quy M7     | Mapping yêu cầu; code/test/integration/runtime UNKNOWN                 |
| G08 | M6; hồi quy M7                 | Mapping yêu cầu; code/test/integration/runtime UNKNOWN                 |
| G09 | M7                             | Mapping yêu cầu; code/test/integration/runtime UNKNOWN                 |

Thứ tự nghiệm thu không bắt mọi việc chạy tuần tự. Phần độc lập có thể thiết kế/thử bằng dữ liệu giả lập khi được giao; không vượt gate/policy thiếu và không mở dữ liệu thật khi P0 chưa được xử lý. Không có tự động tiếp tục sau M0.

## Q. Mốc nghiệm thu M0–M7

M0–M7 là mốc nghiệm thu sản phẩm, không thay G00–G09, không làm lại các gói đã đạt và không là workflow/domain engine mới. Mọi gói đã code phải đối chiếu bằng chứng phù hợp; P0 bảo mật/sai dữ liệu phải xử lý trước mở dữ liệu thật, không đợi mốc cuối.

### M0 — Nạp cốt lõi và trí nhớ làm việc vào docs

- Phạm vi: charter, nguồn, quyết định, trạng thái, mốc nghiệm thu, protocol, acceptance, handoff; điểm dẫn AGENTS an toàn.
- Kết quả: phiên mới có căn cứ tiếp tục, không mất định hướng, không coi kế hoạch là code hoàn thành.
- Nghiệm thu: docs có thật, đủ nội dung, links đúng, bootstrap duy nhất, không sửa app, trạng thái có mức bằng chứng.
- Liên quan Gxx: lưu và dẫn G00–G09, không thực hiện gói code.
- Phụ thuộc: repository/hướng dẫn hiện có và prompt tự đủ; thiếu raw v0.2 không chặn lưu yêu cầu.
- Trạng thái: phạm vi duy nhất được phép thực hiện ngay; kết quả kiểm tra thực tế ở STATUS/handoff.

### M1 — Xác định baseline và bản đồ tái sử dụng

- Mapping: G00, báo cáo G01/G02 và các gói thực sự có sau đó.
- Phạm vi khi được giao: đọc branch/worktree/HEAD/report, xác định app đang chạy, kiểm tra lỗi liên quan trong môi trường được phép; lập KEEP / ADAPT / ADD / RETIRE_CANDIDATE.
- Kết quả: biết nền thực dùng được, phần còn thiếu cho chat/AI/quyền; không bỏ phí code cũ.
- Nghiệm thu: phát hiện có path/service/API/test; tách code có, đã test, đã tích hợp, đang chạy; có thiết kế/kế hoạch tiếp theo để duyệt.
- Phụ thuộc: phạm vi M1 được giao, quyền môi trường đọc/kiểm tra rõ; báo cáo lịch sử là đầu mối.
- Không tự merge, sửa app hoặc mở rộng audit ngoài phạm vi.
- Trạng thái: PLANNED; mức hoàn tất theo yêu cầu mới UNKNOWN.

### M2 — Không gian dự án, chat và phân quyền

- Mapping: G00/G02/G07 và Project/File/Task thực có.
- Phạm vi: hồ sơ xuyên suốt, nhóm, chủ đề, chat bền vững, file chung, quyền chỉ xem/gửi, room khách/đối tác theo phạm vi phát hành.
- Kết quả: nhân viên/khách thử nghiệm trao đổi đúng vùng; người chỉ xem không gửi; ngoài phạm vi không thấy.
- Nghiệm thu: hai dự án giả lập; người chỉ xem/người gửi/khách; UI/API/socket/file/search/count; retry không trùng; thu hồi quyền hiệu lực.
- Phụ thuộc: baseline/IAM được xác minh; thiết kế và chính sách D01/D03/D05/D07 cho phần liên quan; P0 chia sẻ được xử lý.
- Không chờ toàn ERP mới thử chat khách, nhưng không mời khách thật trước kiểm thử chia sẻ.
- Trạng thái: PLANNED; implementation UNKNOWN, không do M0 triển khai.

### M3 — Bộ nhớ dự án và AI hỏi đáp có nguồn

- Mapping: G01/G02/G04/G07 về quyền, nguồn, liên kết.
- Phạm vi: nguồn bền vững; import có kiểm tra; index/summary dựng lại được; retrieval theo quyền/phiên bản/thời điểm; hỏi trong nhóm và xuyên hồ sơ.
- Kết quả: chat mới tìm đúng quyết định cũ; đổi người/model/vòng đời không mất nguồn.
- Nghiệm thu: nguồn cũ/mới/mâu thuẫn/thiếu; hai project cùng tên sản phẩm; thu hồi quyền; không lộ sang room khách; truy vấn toàn danh mục không bỏ sót vì top-k search.
- Phụ thuộc: ranh giới hồ sơ/room và nguồn của M2, chính sách D06/D07, quyền trước retrieval/tool/delivery; kiểm tra API chính thức khi triển khai.
- Trạng thái: PLANNED; implementation UNKNOWN.

### M4 — Dịch, tài liệu, bảng và ảnh ngay trong dự án

- Mapping: G05/G06 phần đầu ra, G07 quyền công cụ.
- Phạm vi: dịch, sửa/soạn hợp đồng/công văn, bảng/dữ liệu, tạo/chỉnh ảnh, panel chỉnh sửa, lưu version và xuất file.
- Kết quả: đầu ra dùng được, sửa được, mở lại được; không copy/upload lại vào dự án.
- Nghiệm thu: giữ mã/số/đơn vị; không bịa trường hợp đồng; nguồn/gốc nguyên vẹn; ảnh minh họa có nhãn; file không mất khi phiên AI kết thúc.
- Phụ thuộc: nguồn/file/quyền M2–M3, D02/D06 và mẫu/quyền công cụ cho phạm vi cần dùng; không tự phát hành.
- Trạng thái: PLANNED; implementation UNKNOWN.

### M5 — Từ chat tới nghiệp vụ và hạng mục xuyên chuỗi

- Mapping: G03/G04/G05/G06.
- Phạm vi: thẻ cập nhật có nguồn, gọi domain service sau kiểm tra, tiền/quantity đúng, lineage cấp dòng/version; đối chiếu lựa chọn–PI/PO–nhận hàng; nối giao/lắp/nghiệm thu/bảo hành.
- Kết quả: không chỉ chat; biết đặt đúng chưa/còn thiếu gì, tác động truy được nguồn và người làm.
- Nghiệm thu: PI khác mã vật liệu bị phát hiện; thay phương án sau đặt không ghi đè; giao/nhận nhiều đợt đúng; payment/appendix/shipment retry/concurrency không trùng.
- Phụ thuộc: nguồn có quyền, domain thực được giữ lại, chính sách D01–D05 theo hành động; bảo toàn G01/G02 đã kiểm chứng. P0 không được đợi M5 mới sửa.
- Trạng thái: PLANNED; mức khép kín chuỗi UNKNOWN.

### M6 — Tổng quan và hàng đợi điều hành

- Mapping: G07/G08, dữ liệu G03–G06.
- Phạm vi: việc của tôi/phòng/dự án; owner/hạn/phụ thuộc; tiến độ, tiền, hàng, lỗi; dashboard drilldown tới căn cứ.
- Kết quả: quản lý chọn dự án biết tới đâu, vướng đâu, ai xử lý, cần quyết định gì.
- Nghiệm thu: dự án thứ 21/25 vẫn được tổng hợp đúng quyền; tổng khớp nguồn; không suy tiến độ từ chat/file; dữ liệu cũ/thiếu có nhãn; không lộ giá vốn qua số tổng.
- Phụ thuộc: dữ liệu và lineage được xác minh; D01/D02 và công thức tiến độ/SLA còn mở ở sổ OD; không invent KPI.
- Trạng thái: PLANNED; implementation UNKNOWN.

### M7 — Nghiệm thu tích hợp và chuyển giao diện

- Mapping: G09 và hồi quy các gói đã dùng.
- Phạm vi: hành trình nhiều persona/dữ liệu giả lập; hồi quy quyền/AI/file/export/concurrency; backup/restore có đối soát; chất lượng/thời gian/chi phí AI; chuyển UI từng phần cùng nguồn.
- Kết quả: bằng chứng đủ/chưa đủ chạy thử nội bộ hoặc nhóm khách được cho phép.
- Nghiệm thu: không mất nguồn/nghĩa vụ, không lộ dữ liệu; AI lỗi vẫn làm việc không cần AI; khôi phục thực tế; không dual-write hai sổ; unit test xanh chưa đủ end-to-end.
- Phụ thuộc: các lát cắt M2–M6 được duyệt và kiểm tra, môi trường cô lập, chính sách còn phụ thuộc đã chốt, browser acceptance và đường quay lại.
- Không tự deploy production.
- Trạng thái: PLANNED; implementation/acceptance UNKNOWN.

Các ca cụ thể và trường bằng chứng: [ACCEPTANCE](07-ACCEPTANCE.md). Trạng thái M0 và bước tiếp tục: [STATUS](05-IMPLEMENTATION-STATUS.md).
