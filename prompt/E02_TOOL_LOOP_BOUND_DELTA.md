# E02 — delta giới hạn vòng công cụ r1

2026-10-10 11:07 +07. OWNER_APPROVED — owner “Duyệt hết mọi thiết kế. xong chức năng tôi sẽ design lại toàn bộ giao diện”, 2026-10-10; approved document SHA256 fdee065e2166b4813cdd66a8bcb4752b75e4dc0194bd65f180961da8558b2bec. Đây là sửa lỗi nghiệm thu trong engine hiện hữu, không thêm provider/tool/storage hoặc đổi phạm vi.

## Bằng chứng mới và nguyên nhân

Release `local-f4d3ec770a67`, CODE_SHA `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, TESTED_TREE `663bd923becbbe11d1eec68464e0b3bf89b66fbc`, owner browser thật, bài báo giá tổng hợp được phép: FAILED/TOOL_ROUND_LIMIT. Receipt riêng tại `.runtime/e02-20261010/main-quote-trace.json`; requested/sent/observed cả bốn request đều `gpt-6.1-sol`/`max`, ACCEPTED/PROVIDER_REPORTED.

Trong ba lượt được phép thực thi tool, trace lưu bốn calls: đọc giá OK, đọc ảnh metadata trả lỗi recoverable, nhân tiền hàng `250001` và tính thuế `25000.1` OK. Response thứ tư còn tool call và service từ chối trước khi thực thi vì `round === 3`; arguments của call bị từ chối không được lưu nên không suy đoán tên call đó. Giá/ảnh thật đã upload; chưa tạo XLSX/PDF. Không coi đây là PASS artifact.

Chuỗi hợp lệ có thể cần đọc giá → đọc metadata ảnh → nhân tiền hàng → tính thuế → cộng tổng → tạo XLSX → tạo PDF → câu trả lời cuối, tức tám provider rounds khi model chọn tuần tự. Pha native web riêng E02-3 có thể thêm một round. Ép model ghép tool calls không đảm bảo xử lý các phép tính phụ thuộc.

## Delta nhỏ nhất và giới hạn giữ nguyên

Thay trần bốn bằng **mười provider rounds cho một job SIWC**, tính cả pha public web và các lần compaction gọi provider trong cùng job. Tối đa bốn tool calls mỗi response; vẫn tối đa ba artifacts, tổng deadline110 giây, lease120 giây, context/envelope256KB và64items, bounds argument/result/parser/storage hiện có. Model/effort giữ nguyên ở mọi round; không retry ẩn, không đổi model, không shell tùy ý hoặc thêm mạng ngoài. Đủ budget không đồng nghĩa provider chắc chắn hoàn thành; timeout/limit vẫn trả trạng thái thật.

Chỉ thay bộ đếm/guard trong `ProjectAiService.runChatGpt` dùng chung; dispatcher/registry/ACL/lease/cancel/receipts giữ nguyên. Bộ đếm nằm ở wrapper `respond` để public phase và history compaction không vượt trần. Lượt cuối chỉ được nhận final response, không thực thi thêm tool call khi không còn lượt trả result. Không tăng deadline hoặc artifact limit.

## Kế hoạch sửa và nghiệm thu

1. RED chuỗi phụ thuộc tám rounds với cùng model/MAX, hai artifact thật qua integration; trần mười, quá bốn calls/response, cancel/timeout/revoked ACL không tạo output muộn.
2. GREEN thay bound/counter duy nhất; regression tool error và summary giữ model/effort, không fallback, không bỏ field.
3. Focused + full lint/typecheck/test/build/format, Ponytail/correctness/security/auth review; snapshot/release riêng, không ghi đè candidate đã phát hành.
4. Chạy lại owner live cùng nguồn tổng hợp và request ưu tiên; mở/native validate XLSX/PDF, kiểm số liệu/ảnh, tải sau reload, receipts đúng. Chỉ nhận PASS từ lần chạy mới.

Delta này sửa riêng giới hạn đã đo. E02-3 thiết kế/kế hoạch đã duyệt giữ hiệu lực; các task độc lập về public probe, schema v4 và parser vẫn tiếp tục. Không yêu cầu duyệt lại Office/P1 hoặc mục tiêu E02. Điều kiện xin review đến từ E02-3-PLAN-r1 Task2: “Nếu budget hiện hữu không đủ, trình measured delta trước đổi bound.”
