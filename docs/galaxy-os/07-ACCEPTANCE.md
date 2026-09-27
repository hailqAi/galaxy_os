# Ma trận nghiệm thu

Nguồn tình huống: [OWNER_BRIEF_2026-09-28](sources/OWNER_BRIEF_2026-09-28.md), mục U. Các chữ C–M là mục trong nguồn; E04 là giai đoạn 04. Mapping Gxx là chỉ mục dự kiến theo M0–M7 của chủ dự án, không khẳng định scope gốc Gxx đã được xác nhận.

M0 chỉ lập ma trận. Toàn bộ AC-01–AC-24 là NOT_RUN, không có ca PASS runtime mới. Kết quả lịch sử G01/G02 có thể phục vụ kiểm chứng từng phần khi M1 đối chiếu đúng SHA/tree, fixture và đường gọi; chưa tự chuyển thành PASS cho ca end-to-end mới.

| ID    | Tình huống                                          | Kết quả mong đợi                                                                                                   | Yêu cầu nguồn | Mốc   | Gói liên quan           | Bằng chứng / trạng thái                |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ----- | ----------------------- | -------------------------------------- |
| AC-01 | Chuyển tiềm năng → đã ký → chăm sóc lại → thực hiện | Cùng hồ sơ; không mất chat/file/nghĩa vụ, không tính trùng.                                                        | D, M          | M2/M5 | G02/G03/G04/G07         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-02 | Một khách hai công trình                            | Chuyển một hồ sơ không đổi hoặc trộn hồ sơ kia.                                                                    | D, K          | M2/M3 | G02/G04/G07             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-03 | Chat mới hỏi quyết định cũ                          | Tìm đúng nguồn/phiên bản, không chỉ summary.                                                                       | K, L          | M3    | G01/G02/G04/G07         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-04 | Bản nháp mới mâu thuẫn bản đã duyệt                 | AI phân biệt, không tự ghi đè.                                                                                     | H, K, M       | M3/M5 | G04/G05/G06             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-05 | File lưu nhưng trích xuất lỗi                       | Hiện trạng thái đúng, không giả đã hiểu.                                                                           | G, K, L       | M3    | G00/G04/G07             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-06 | Người chỉ xem gửi qua API/socket                    | Bị từ chối.                                                                                                        | I             | M2    | G02/G07                 | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-07 | Người ngoài project thử URL/search/file/count       | Không lộ dữ liệu.                                                                                                  | I, K          | M2/M3 | G01/G02/G07             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-08 | Có quyền mục A, không có quyền mục B                | Không lấy B qua AI hoặc file liên kết.                                                                             | I, K, L       | M2/M3 | G01/G02/G04/G07         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-09 | Nhiều binding                                       | Không ghép chéo action/scope để vượt quyền.                                                                        | I             | M2/M3 | G02                     | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-10 | Giám đốc hỏi trong room khách                       | Không công bố dữ liệu nội bộ vượt phạm vi phòng.                                                                   | I, J, L       | M2/M3 | G02/G07                 | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-11 | Thu hồi quyền lúc AI đang chạy                      | Kiểm tra lại context/tool/delivery; không phát phần bị cấm.                                                        | I, K, L       | M3/M7 | G02/G07/G09             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-12 | Khách/nhà cung cấp                                  | Chỉ thấy hồ sơ đã phát hành cho mình, không thấy bên khác.                                                         | J             | M2    | G02/G07                 | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-13 | Upload/gửi tin lỗi và retry                         | Không thành công giả, không trùng bản ghi.                                                                         | G, N          | M2/M7 | G00/G02/G07/G09         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-14 | Nguồn đính kèm ở nhiều chỗ                          | Không vô tình mở quyền gốc rộng hơn.                                                                               | I, K, N       | M2/M3 | G01/G02/G04/G07         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-15 | Soạn hợp đồng thiếu tài khoản/người ký              | Đánh dấu thiếu, không bịa hoặc phát hành.                                                                          | H, L          | M4    | G05/G06/G07             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-16 | Dịch và xử lý bảng                                  | Giữ mã, số, đơn vị, nguồn và công thức liên quan.                                                                  | L, M          | M4    | G05/G06/G07             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-17 | Chỉnh ảnh                                           | Giữ gốc, lưu bản mới có nhãn; không thay chứng cứ QC.                                                              | L             | M4    | G05/G06/G07             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-18 | PI sai model/mã da/kích thước                       | Bảng đối chiếu chỉ rõ sai hoặc thiếu nguồn.                                                                        | E04, E08, M   | M5    | G03/G04/G05/G06         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-19 | Khách đổi sau PO                                    | Giữ căn cứ tại thời điểm phát hành và yêu cầu điều chỉnh mới.                                                      | E06, M        | M5    | G03/G04/G05/G06         | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-20 | Đặt 10, nhận 6, đạt 5, lỗi 1                        | Chưa về 4; không coi hàng lỗi là sẵn sàng, tối đa 5 đạt trước điều kiện lắp khác.                                  | E10, E11, M   | M5    | G03/G04/G06             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-21 | Payment/appendix/shipment đồng thời hoặc retry      | Không tác động kép, không nhầm tenant/target/currency.                                                             | I, M          | M5/M7 | G01/G03/G05/G06/G09     | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-22 | Dashboard                                           | Đúng tập dữ liệu theo quyền, không giới hạn 20 Project (kiểm dự án 21/25), tổng khớp nguồn, nhãn dữ liệu cũ/thiếu. | F, I, K, M    | M6    | G03/G04/G05/G06/G07/G08 | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-23 | AI ngừng hoạt động                                  | Chat người-người, file và nghiệp vụ không cần AI vẫn dùng.                                                         | L             | M2/M7 | G00/G07/G09             | NOT_RUN; chưa có bằng chứng cho ca này |
| AC-24 | Backup/restore và đổi model                         | Khôi phục đúng nguồn/liên kết/phiên bản/quyền; dựng lại tìm kiếm, không phụ thuộc duy nhất provider session.       | D, K, L       | M7    | G09                     | NOT_RUN; chưa có bằng chứng cho ca này |

## Điều kiện thực thi về sau

Dùng môi trường cô lập, dữ liệu giả lập, ít nhất hai Project và persona có/không có quyền tương ứng; test cả allow và deny, không chỉ admin. Ca dashboard có ít nhất 25 Project. Ca race/retry kiểm số dòng và hiệu ứng persisted, không chỉ HTTP. Ca file/AI kiểm nội dung, nguồn, phiên bản và phạm vi delivery. Ca backup/restore cần đối soát phục hồi thực tế.

Mỗi lần chạy ghi: AC-ID; yêu cầu/gói; branch; CODE_SHA; TEST_SHA hoặc tree gồm thay đổi chưa commit; thời điểm/múi giờ; lệnh; exit code; môi trường/fixture; kết quả thực; đường bằng chứng đã che nhạy cảm; mức code/test/integration/runtime; reviewer; blocker/quyết định thiếu. PASS chỉ cho điều kiện đã chạy đủ, PARTIAL không đổi thành VERIFIED. Không tắt guard, skip hoặc nới timeout để ép xanh.

D01–D08 và các OD còn thiếu chỉ chặn phần phụ thuộc; không tự bịa ngưỡng tiền, tỷ giá, quyền hay ngoại lệ. Browser acceptance bắt buộc trước tuyên bố hoàn thành luồng UI.

## Nghiệm thu riêng M0

Các tiêu chí sau được kiểm bằng docs/Git, không thay 24 ca sản phẩm: đủ 12/12/28 và bốn nhóm; có M0–M7 và G00–G09; giữ D01–D08 mở; nguồn tự đủ A–W; links đích tồn tại; bootstrap một block; hướng dẫn cũ còn nguyên; không đổi source/config/tests/migration; không claim vượt bằng chứng; danh sách commit đúng phạm vi, không secrets.

Kết quả và lệnh kiểm M0 nằm ở [STATUS](05-IMPLEMENTATION-STATUS.md) và handoff được dẫn tại đó.
