# P1-B — quyết định riêng về gate token budget

Revision 1. **PENDING OWNER APPROVAL.** Đây là đề nghị điều chỉnh đúng một gate do capability SIWC không khả dụng; không thay spec/plan P1 revision 1 đã duyệt, không mở lại thiết kế Memory hoặc OAuth. Chưa cho phép migration/cutover theo ngoại lệ này.

## Gate và bằng chứng

Spec P1 mục 8.1 yêu cầu: “Implementation phải thu được profile/budget evidence cho model dùng trong nghiệm thu P1-B”. Plan Task 6 yêu cầu ghi missing profile/live thành blocker P1-B. Review độc lập xác nhận byte/item guard và vài response.completed không thay bằng chứng token capacity.

Owner hiện có 7 model SIWC thật; metadata `/v1/models` trả context_window 272000 nhưng không cung cấp tokenizer/output-reserve profile. Probe duy nhất `/v1/responses/input_tokens` trả HTTP401 `hardened_oauth_rule_missing`, request ID `req_819a160427e04092b307df6bc6b83c49`. Probe dùng nội dung tổng quát không nhạy cảm; không sửa/refresh/reconnect credential, không retry/fallback. Record connection có ciphertext hash không đổi.

[OpenAI token counting](https://developers.openai.com/api/docs/guides/token-counting) lưu ý số token gồm cả định dạng request/tool schema; tokenizer text không đủ để khẳng định count toàn request. Tài liệu đã đọc không xác minh encoding của 7 slug này. Không dùng char/4 hoặc context window của API public khác để tạo profile giả.

## Ngoại lệ được đề nghị

Cho phép **tiếp tục nghiệm thu và phát hành P1-B với token budget UNVERIFIED**, nếu toàn bộ các điều kiện còn lại dưới đây đạt. Điều chỉnh chỉ yêu cầu token profile VERIFIED trước phát hành; không đổi IAM, source isolation, migration, browser, live hoặc rollback gates.

- Giữ `profile=null`; inputTokens/inputLimit/tokenizerVersion vẫn null. Không ghi VERIFIED hoặc tuyên bố hỗ trợ đầy đủ context capacity của model.
- Giữ kiểm tra toàn wire request: tối đa 256000 byte/64 item và schema/field limits đã kiểm chứng; dành chỗ cho call/output, kiểm lại mỗi continuation. Đây là giới hạn codec, **không phải phép đo token**.
- Recent complete pairs, summary có nguồn, retrieval riêng đúng conversation/Project tiếp tục theo implementation đã review. Lịch sử còn thiếu được báo PARTIAL; không fallback tám lượt hoặc âm thầm cắt câu hỏi/tool JSON.
- Mọi provider round dùng đúng selected model, kết thúc response.completed hoặc lỗi thật. Vượt envelope trả lỗi; provider từ chối context/capability thì báo đúng, không đổi model/provider hoặc giả kết quả.
- Trước cutover, nghiệm thu OpenAI thật trên candidate: X/Y ở hai Project, private/shared được phép, conversation mới, hơn tám lượt, summary và ba read tool/citations. Ghi actual provider usage, selected/returned model và terminal mỗi round. Mocks chỉ dùng kiểm protocol; không làm bằng chứng live.
- Full regression/static/build/format, browser, ACL/revocation, backup restore, additive migration và compatibility rollback P1-A phải đạt. Không phát hành khi các gate này thiếu.
- Trong báo cáo tách `MODEL_TOKEN_PROFILE=BLOCKED/UNVERIFIED` khỏi kết quả CRUD/retrieval/tool/live của model thực đã thử. Capability các model chưa thử giữ NOT_RUN/UNVERIFIED.

## Giới hạn và lựa chọn giữ gate

Không có preflight token count đáng tin cậy; câu hỏi/lịch sử dài có thể được provider từ chối dù wire hợp lệ. Không đảm bảo toàn capacity/reasoning/output reserve của 7 model. Bằng chứng usage của bài thử chỉ chứng minh những bài thử đó.

Nếu owner không duyệt ngoại lệ này, main tiếp tục P1-A; P1-B giữ source/fixture đã kiểm thử, không migration/cutover. Khi có tokenizer/route-count evidence hợp lệ, hoàn thiện profile theo spec hiện hành. P2/P3 written spec/plan vẫn có gate riêng và công việc chuẩn bị độc lập tiếp tục.

## Self-review

Ngoại lệ không bỏ security/ACL/live/backup gate, không cấp entitlement cho staff, không đổi connection hoặc paused providers. Chỉ owner mới có quyền đổi yêu cầu nghiệm thu đã duyệt. Approval phải nhắc đúng addendum revision 1; im lặng không được hiểu là đồng ý. Chưa sửa bản spec/plan được duyệt.
