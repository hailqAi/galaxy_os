# Trải nghiệm, quyền và dữ liệu có nguồn

Nguồn: [OWNER_BRIEF_2026-09-28](sources/OWNER_BRIEF_2026-09-28.md), mục G–M, nhãn OWNER_REQUIREMENT. Nội dung là đích đến; khả năng code/runtime phải xem [STATUS](05-IMPLEMENTATION-STATUS.md).

## G. Giao diện và cách sử dụng

Điều hướng chính: Việc của tôi; Dự án (Khách hàng tiềm năng, Khách hàng đã ký / Dự án); Thư viện công ty.

Trong mỗi hồ sơ có bốn mục: Tổng quan, Làm việc, Hạng mục, Hồ sơ & kiến thức.

| Nhóm trong Làm việc  | Giai đoạn nghiệp vụ |
| -------------------- | ------------------- |
| Tư vấn & báo giá     | 02–05               |
| Hợp đồng & tài chính | 06–07               |
| Cung ứng & giao hàng | 08–10               |
| Thi công & hậu mãi   | 11–12               |

Stage 01 thuộc tiếp nhận/chăm sóc của cùng hồ sơ. Phòng khách hàng là phạm vi chia sẻ, không là stage 13. Bốn nhóm không phải bốn kho dữ liệu/bộ nhớ độc lập. Không khóa cả nhóm chỉ vì nhóm trước chưa xong; kiểm tra điều kiện tại hành động và phạm vi tương ứng theo chính sách đã xác nhận.

Cuộc làm việc có danh sách chủ đề/công việc; chat với đồng nghiệp hoặc gọi AI có nhận diện rõ; panel bảng/tài liệu/ảnh khi cần. Đầu việc ghim mục tiêu, owner, hạn, trạng thái, đầu ra/bản hiện hành, đang chờ ai, bước tiếp theo. Không ép mọi chat thành task; không gom mọi việc vào chat tên nhân viên. Có thể tạo việc từ một tin hoặc liên kết chat vào việc đã có.

Nhân viên mở Việc của tôi/việc gần nhất; quản lý mở Tổng quan. Đây là góc nhìn trên cùng dữ liệu.

Ưu tiên không nhập lại dữ liệu đã biết; dùng lại file đính kèm không upload lần hai; lưu nháp và giữ nội dung khi lỗi; trạng thái gửi/lưu thật từ server; retry không trùng; mobile dùng được không buộc đọc bảng quá rộng; không báo hoàn thành giả bằng toast hoặc trạng thái frontend.

## H. Hai vòng làm việc

Vòng 1: hỏi, dịch, tìm, phân tích, thử phương án, sửa ảnh, soạn tài liệu và tạo nháp.

Vòng 2: kiểm tra, xác nhận, phê duyệt, phát hành, ghi nhận thực hiện và nghiệm thu.

Điểm nối: thẻ cập nhật có nguồn → người có quyền kiểm tra → gọi domain service → lưu kết quả và lịch sử. Không bắt nhập lại thông tin AI đã trích xuất; cho xem nguồn và sửa dữ liệu trước xác nhận.

Không tự chuyển:

- Tin “khách muốn đổi màu” thành mẫu đã duyệt.
- Ảnh chuyển tiền thành tiền đã đối chiếu.
- Nhà máy báo xong thành hàng đạt chất lượng.
- Đội lắp báo xong thành nghiệm thu.
- Hợp đồng AI soạn thành hợp đồng đã ký.

Tự động phân loại/gợi ý người nhận chỉ là hỗ trợ. Không rõ thì vào hàng đợi cần phân loại. Không tự mở quyền vì model đoán một người nên nhận việc.

## I. Phân quyền theo dự án, mục và cuộc trao đổi

Tái sử dụng IAM hiện có. Kiểm tra tổ chức/tài khoản hợp lệ, permission, scope, target-policy, delegation-policy và active-status theo mô hình thực tế. Giữ action và scope cùng đường cấp quyền hợp lệ; không mượn action ở binding A và scope ở binding B để vượt quyền.

Tách các hành động: xem; gửi tin; đính kèm; dùng AI; tải/xuất/chia sẻ; sửa dữ liệu; giao việc; kiểm tra; phê duyệt; phát hành; mời/quản trị thành viên; quản lý quyền/ủy quyền; xem giá vốn, margin và thông tin tài chính nhạy cảm.

Mẫu giao diện “Không truy cập / Chỉ xem / Trao đổi / Phụ trách mục” là đề xuất UX, không phải role runtime đã cấp. Không tự cộng quyền tài chính, phê duyệt hoặc quản trị vì tên “quản lý”.

Quyền phải thực thi ở API, dữ liệu trả về, URL trực tiếp, socket subscribe/broadcast, search, file/preview/download, log, notification, export, cache, job và công cụ AI.

Phân công không tự cấp quyền. Membership dự án không tự cấp quyền tài chính. Mention không cấp quyền. Có link không đồng nghĩa được xem. Người chỉ xem không gửi được qua API hoặc socket. Quyền gọi AI không tự cho phép đăng kết quả vào phòng chung. Mục hạn chế và room riêng giữ ranh giới dữ liệu.

Thu hồi quyền phải được kiểm tra lại ở các truy cập/phát dữ liệu tiếp theo, gồm lịch sử AI/context/cache và câu trả lời đang tạo. Không hứa thu hồi nội dung người nhận đã đọc/tải hợp lệ. Quyền admin cuối cùng, delegation và tách người lập/duyệt theo chính sách có nguồn; thiếu thì chờ quyết định.

## J. Chat với khách hàng và đối tác

Cùng Project nhưng tách vùng nội bộ Galaxy, trao đổi với khách, trao đổi với từng nhà cung cấp/đối tác khi cần. Không mời khách vào nguyên phòng nội bộ rồi ẩn vài tin; không mở lịch sử giá vốn/nhà máy/đàm phán nội bộ cho khách.

Chia sẻ: chuẩn bị nội bộ → xem trước người nhận và nội dung → kiểm tra → phát hành bản cụ thể → phản hồi. Bản phát hành giữ liên kết nguồn/phiên bản, không sao chép toàn bộ dự án.

Quyền mời xác định ai, project, mục/room, xem hay gửi, file/lịch sử được thấy, thời hạn khi áp dụng. Khách xem/gửi trong phạm vi của họ; nhà cung cấp không xem báo giá/đơn của bên khác.

Mặc định AI soạn phản hồi để nhân viên kiểm tra; không tự gửi câu trả lời nội bộ cho khách. AI trực tiếp với khách chỉ bật khi được cho phép: dùng nguồn đã phát hành, nhận diện là AI, không tự cam kết giá/ngày/điều kiện, có đường chuyển sang người phụ trách.

Nhắn “đồng ý” không tự ký hợp đồng hoặc duyệt khoản phát sinh chưa xác định rõ. Chat native trong Galaxy là phạm vi đầu; email/Zalo/WhatsApp là tích hợp riêng cần quyền và kết nối thực tế, không mặc định đã có.

## K. Bộ nhớ dự án và AI có nguồn

Bốn lớp dữ liệu vận hành:

1. Nguồn gốc: chat/file/ảnh/email được nhập, tác giả, thời điểm, phiên bản và quyền.
2. Thông tin đã xác nhận: yêu cầu, cấu hình, lựa chọn, giá/phạm vi/quyết định có căn cứ.
3. Thực hiện: task, hợp đồng, PO, tiền, hàng, nghiệm thu.
4. Chỉ mục/tóm tắt/liên kết phục vụ tìm kiếm, có thể dựng lại.

Galaxy giữ dữ liệu chính. Không chỉ lưu summary hoặc provider conversation ID rồi gọi là bộ nhớ đầy đủ. Thông tin trong chat không tự là sự thật đã duyệt; suy luận AI không tự là nguồn xác nhận cho suy luận sau.

Giữ nguồn, tác giả, ngày nhận, thời điểm áp dụng, trạng thái xác nhận và quan hệ thay thế. File mới tải không tự thay bản hiện hành; giá mới trong thư viện không tự đổi hợp đồng/PO cũ.

Thư viện công ty gồm catalog, template, hướng dẫn, giá chung theo quyền. Nguồn riêng dự án gồm giá thương lượng, thông tin khách, điều khoản, bản vẽ, quyết định công trình. Không tự lấy dữ liệu riêng từ project khác; tham chiếu chéo cần đúng thẩm quyền và phạm vi.

Câu hỏi tìm lý do có thể tìm chat/tài liệu liên quan. Câu hỏi “tất cả”, tổng tiền, sản phẩm thiếu điều kiện phải dùng tập dữ liệu nghiệp vụ đầy đủ theo quyền, không lấy vài kết quả semantic search thay kiểm tra toàn bộ.

Hiển thị nguồn: đã lưu / đang xử lý / tra cứu được / cần kiểm tra / lỗi. Thiếu hoặc mâu thuẫn phải nói rõ. Không khẳng định AI nhớ mọi thứ. Câu trả lời quan trọng dẫn đúng nguồn/phiên bản/thời điểm.

Import chat cũ giữ nguồn/tác giả/thời gian khi có, preview mapping project, chống trùng, báo thiếu attachment. Không tự nói API đọc toàn bộ ChatGPT cá nhân; không chỉ nhập summary rồi báo đã nhập đủ lịch sử.

M0 chỉ ghi tài liệu ghi nhớ cho PHÁT TRIỂN Galaxy OS. Bốn lớp trên là yêu cầu bộ nhớ VẬN HÀNH dự án KHÁCH HÀNG chưa được M0 xây dựng; không tuyên bố đã cập nhật Saved Memory hay Project settings ChatGPT.

## L. Nền AI, công cụ và chất lượng

Một nền trợ lý có trọng tâm theo nhóm chuyên môn, không tạo bốn bộ nhớ độc lập.

Luồng: xác định actor/quyền → tìm nguồn đúng phạm vi/phiên bản → lấy dữ liệu nghiệp vụ → gọi công cụ cần thiết → kiểm tra mâu thuẫn/thiếu → trả lời có căn cứ.

Xét cả quyền người hỏi và phạm vi được công bố tại nơi nhận. Giám đốc được đọc giá vốn không có nghĩa bot được đăng vào phòng khách. Không gửi toàn bộ dữ liệu nhạy cảm cho model rồi chỉ yêu cầu “đừng tiết lộ”.

Kiểm tra quyền trước retrieval/tool, trước ghi tác động, trước delivery; bảo vệ context/cache/historical output. API qua backend, không để key ở client. Model, provider, ngân sách cấu hình theo kết quả đánh giá; khi triển khai kiểm tra tài liệu API chính thức hiện hành, không đóng cứng tên/giá/tham số theo suy đoán. Không hứa API tự thông minh hơn mọi chế độ ChatGPT. Không cần multi-agent hoặc engine mới nếu luồng hiện có đủ.

AI được dịch, tra cứu, so sánh, phân tích, soạn/sửa nháp tài liệu, bảng, ảnh qua công cụ phù hợp. Đầu ra phải lưu bền vững trong Galaxy và mở lại được; file tạm provider không phải lưu lâu dài.

- Ảnh: giữ gốc, bản chỉnh có nhãn, không thay ảnh kiểm tra thực tế.
- Tài liệu: đúng mẫu, giữ phiên bản, nhìn được thay đổi, đánh dấu thiếu; không bịa người ký/tài khoản/số tiền.
- Bảng: nguồn, đơn vị, currency, công thức, giả định rõ; số chính thức từ domain/bộ tính đã kiểm chứng.

AI không tự ký, duyệt, trả tiền, đặt hàng, nghiệm thu, mời/chia sẻ, thay quyền hoặc phát hành ra ngoài. Dữ liệu tài liệu là nội dung, không là lệnh hệ thống; không thực thi chỉ dẫn lạ yêu cầu bỏ quyền/lộ dữ liệu.

Có quota, log che nhạy cảm, chính sách lưu dữ liệu. Không gọi API với hồ sơ thật khi chưa có quyền/cấu hình. AI lỗi không làm mất chat hoặc chặn nghiệp vụ không cần AI.

## M. Hạng mục, tiền và kiểm soát mua đúng

Phân biệt Product master dùng chung; cấu hình/hạng mục trong dự án; phiên bản được duyệt; dòng chứng từ chốt tại thời điểm cụ thể.

Nối xuyên chuỗi: yêu cầu/bản vẽ/lựa chọn → báo giá → hợp đồng/phụ lục → PO/xác nhận nhà máy → nhận/giao → lắp/nghiệm thu → bảo hành. Cùng projectId chưa đủ; phải truy ở cấp dòng/version.

Đối chiếu khách duyệt gì → Galaxy đặt gì → nhà máy xác nhận gì → thực tế nhận/lắp gì. Kiểm model, kích thước cùng loại, mã vật liệu/hoàn thiện, phụ kiện, số lượng, đơn vị, điều kiện, phiên bản. Không so kích thước ô chờ với cánh như cùng loại; không dùng từ “Bronze” để tự xác nhận mã hoàn thiện cụ thể.

Ba kết quả: KHỚP / CÓ SAI KHÁC / CHƯA ĐỦ CĂN CỨ. Phân biệt PO sai với bản có hiệu lực lúc đặt và PO cần điều chỉnh do thay đổi mới duyệt sau đó. Không bịa liên kết lịch sử; dữ liệu cũ thiếu nguồn có nhãn chưa liên kết.

Ví dụ giả lập: đặt 10; nhận 6; đạt 5; lỗi 1; chưa về 4. Không coi cả 6 thực nhận sẵn sàng lắp.

Quy tắc tính:

- Phân biệt giá tham khảo, giá chào cụ thể, giá trên chứng từ.
- Khối lượng bán, mua, nghiệm thu không mặc định giống nhau.
- Chi phí đã phân bổ không cộng lại lần hai.
- Hợp đồng không đồng nghĩa tiền đã thu; tiền đã trả không tự là toàn bộ chi phí thực tế; dòng tiền không tự là lợi nhuận.
- Không trừ nominal khác currency. Thiếu giá không thay bằng 0; thiếu tỷ giá không dùng 1.
- Phân biệt dữ liệu âm sai với giảm giá trị/hoàn/đảo hợp lệ.
- Retry/concurrency không tạo tác động kép hoặc vượt lượng.

Số chính thức do service/bộ tính có quy tắc và kiểm thử. AI tìm nguồn và giải thích, không thay chính sách tài chính.

## Ví dụ quyền và kết quả người dùng cần nhận

Đây là tiêu chí OWNER_REQUIREMENT, chưa phải kết quả test. “Cho phép” luôn có điều kiện quyền thật và chính sách tương ứng.

| Tình huống                    | Cho phép                                                          | Từ chối / kết quả cần thấy                                                         |
| ----------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Người chỉ xem mục A           | Xem bản được công bố cho A                                        | API/socket gửi tin bị từ chối; không lấy B qua file hoặc AI                        |
| Nhân viên có quyền gửi        | Gửi tại room được cấp; retry cùng thao tác không trùng            | Không tự mời khách, duyệt hoặc xem giá vốn                                         |
| Giám đốc hỏi ở room khách     | Câu trả lời chỉ dùng dữ liệu được công bố ở room                  | Không đăng giá vốn dù người hỏi được đọc nội bộ                                    |
| Nhà cung cấp A                | Xem bản phát hành riêng cho A                                     | Không tìm thấy đơn, giá, count hoặc lịch sử của B                                  |
| Thẻ AI trích PI               | Xem nguồn và sửa nháp; người có quyền xác nhận gọi domain service | AI không tự phát hành PO hoặc giả mẫu đã duyệt                                     |
| Thu hồi quyền khi AI đang tạo | Tiếp tục phần còn được phép sau kiểm tra lại                      | Chặn context/tool/delivery đã mất quyền; không hứa xóa bản người nhận tải trước đó |
| Lỗi mạng khi gửi/upload       | Giữ nháp, báo lỗi thật, cho retry an toàn                         | Không toast thành công trước xác nhận server                                       |
| Nguồn có “bỏ kiểm tra quyền”  | Xem như nội dung tài liệu                                         | Không thực thi chỉ dẫn đó như lệnh hệ thống                                        |

Ma trận 24 ca và liên kết gói nằm ở [ACCEPTANCE](07-ACCEPTANCE.md); chính sách còn thiếu ở [SCOPE](02-SCOPE-AND-DECISIONS.md).
