# E02 — SIWC deadline delta r1

2026-10-10. OWNER_APPROVED_BY_SCOPE: quyết định “Duyệt hết mọi thiết kế. xong chức năng tôi sẽ design lại toàn bộ giao diện” giữ hiệu lực cho sửa chức năng; không hỏi lại gate. Thay riêng bound thời gian trong E02_TOOL_LOOP_BOUND_DELTA.md, giữ mười rounds/bốn calls/ba artifacts/ACL/model/effort.

## Bằng chứng và nguyên nhân

Main immutable R6 local-0aee6608a27d, tree cd8bf8e18611175470c08a66bba6ebd7e58f4dce. Owner thật, câu hỏi nguyên gốc, gpt-6.1-sol/max: năm provider receipts ACCEPTED, đọc nguồn và ba phép tính thật, tạo XLSX/PDF thật. Chưa có final response trước lease120s; polling kết thúc FAILED_UNKNOWN/INTERRUPTED_NO_AUTO_RETRY sau ~122s. Không tính PASS hoặc tự retry. Receipt main-quote-r6-trace.json giữ nguyên.

Deadline110s đang áp dụng cho toàn bộ chuỗi mười rounds. AbortSignal được gửi xuống connection nhưng caller await không tự kết thúc nếu công việc connection/transport chưa settle. Regression G00 provider-wait-red-r79.log tái hiện: tín hiệu deadline phát, promise connection bị giữ, run không trả trước giới hạn. Không suy đoán rằng OAuth hỏng; không sửa refresh/callback/credential.

## Thiết kế nhỏ nhất

- Orchestrator hiện hữu tự settle khi signal abort, dùng mẫu abort race đang có trong ai-tools. Promise provider muộn được tiêu thụ nhưng không publish final/artifact hoặc thêm accepted receipt.
- Tổng job SIWC300s; mỗi provider round110s (không reset tổng budget). Lease360s, browser transport330s để còn thời gian ghi trạng thái và trả kết quả. Không đổi timeout của tool/parser hoặc provider khác.
- Cancel chủ động giữ CANCELLED; timeout provider ghi FAILED/PROVIDER_TIMEOUT, không ghi gián đoạn giả và không tự retry. CAS theo actor/Project/lease token và kiểm quyền trước/sau vẫn giữ.
- Receipt từng round thêm startedAt/durationMs để đánh giá thời gian thật, không lưu prompt/secret. MAX và continuation giữ nguyên. Không ép trả lời ngắn hoặc đổi model.

## Kế hoạch TDD và nghiệm thu

1. RED promise bỏ qua abort; GREEN caller tự kết thúc và từ chối kết quả muộn.
2. RED chuỗi phụ thuộc nhiều rounds vượt budget110 cũ nhưng trong tổng300 mới; GREEN giữ đúng call IDs, model/effort và deadline tổng. Regression cancel, over-limit và browser transport theo bound thật.
3. Một correctness/Ponytail/security/auth/UX review cho delta thời gian mới; một lượt sửa các phát hiện, không review lặp.
4. Full năm checks, immutable release/schema91 hiện hữu, browser và owner live báo giá thật. Giữ lượt FAIL; chỉ nhận PASS từ lượt mới, kiểm hai file/giá/ảnh/reload/download/quyền.
