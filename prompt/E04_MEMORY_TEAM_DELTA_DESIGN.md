# E04 R4 — phần bổ sung Memory và vai trò AI

Trạng thái: OWNER_APPROVED ngày 2026-10-11T20:14:29.575814+00:00; user trả lời “Duyệt phần mới R4” trong phiên Codex CLI hiện tại. Phần mới chưa triển khai. Nguồn: yêu cầu E04 ngày 2026-10-12, charter Galaxy, source P1-B và E03 spec/plan đã duyệt. Bugfix file, context, upload, web, rich chat và durable run tiếp tục theo approval E03 hiện hữu; tài liệu này không mở lại các mục đó.

## Lựa chọn và phạm vi

Đề xuất kế thừa worker ChatAiAnswer, registry, source/file/draft/artifact và P1-B. Các vai trò là nhiệm vụ trong một run, dùng connection/model/effort đã chọn. Một chat đơn giản dùng một tác nhân có tools. Những nhiệm vụ cần chuyên môn hoặc kiểm độc lập mới giao vai trò con.

Hai cách khác đã cân nhắc: chỉ thêm tên vai trò vào prompt không tạo execution/contract đủ kiểm; framework sáu agent/server riêng tăng tài nguyên, quyền và checkpoint trùng. Phương án đề xuất dùng delegation local có contract và ngân sách chung, không thêm provider hoặc framework.

R1 đọc file thật phát hành trước R4. Analysis Worker chạy code do model sinh là phạm vi riêng có điều kiện: chỉ bổ sung khi case thật chứng minh reader sandbox và thao tác bảng tính hiện hữu chưa đủ. Reader sandbox hiện có không được báo là Analysis Worker.

## Những gì P1-B đã có

Chat/file/transcript gốc, memory NOTE private/shared, immutable revisions, category NOTE/REQUIREMENT/TECHNICAL/DECISION/ISSUE, verification, editor/provenance, versioned dependencies, summary riêng cùng actor/Project, inactive/tombstone, audit và fresh authorization đã có. Giữ domain và applied migrations.

Thiếu cụ thể: source AI_ANSWER hiện chỉ nhận COMPLETED, nên không thể gắn correction vào câu hỏi của lượt lỗi/PARTIAL; model chưa có output proposal được lưu/duyệt như candidate; chưa có child-role execution contract và benchmark lựa chọn team.

## A. Correction và Memory Curator

Mở rộng selector của source AI_ANSWER bằng locator part=QUESTION. Locator trống vẫn dùng bằng chứng câu trả lời COMPLETED như hiện nay. QUESTION chỉ chứng minh câu hỏi nguyên gốc, không chứng minh câu trả lời hoặc quyết định nghiệp vụ.

Proof QUESTION dùng ID/question/owner/Project/conversation/createdAt bất biến, version hash rõ ràng; chỉ đọc terminal lượt thuộc quyền actor hiện hành. Fresh authority, owner/conversation, revoke và Project isolation được kiểm ở backend. Không dùng trạng thái RUNNING làm nguồn memory đã duyệt. Locator JSON hiện có nhận selector mới; không cần tạo domain/table riêng hoặc sửa migration đã áp dụng.

Memory Curator trả proposal private, UNVERIFIED có yêu cầu gốc, lỗi, correction, lý do, scope, expected result và source locators. Proposal được lưu trong checkpoint/result hiện hữu, tối đa5 proposals mỗi run, mỗi content tối đa8000 ký tự và20 source refs theo P1-B. Không tự sửa head/revision đã xác nhận, không tự publish hoặc tạo skill chung.

UI có proposal card và hành động lưu qua memoryCreate hiện hữu, command key/idempotency giữ retry một ghi chú. Việc lưu chỉ tạo NOTE private/category phù hợp. Người dùng muốn dùng chung vẫn qua quyền PUBLISH và kiểm nguồn như P1-B. Retrieval hiện tên nguồn/version/verification; proposal chưa duyệt không thay quyết định/hợp đồng và không thành instruction.

Correction evaluation dùng bài held-out trong cùng scope trước/sau candidate được lưu, so đáp án/coverage/artifact với ground truth. Cải thiện retrieval/templates/evals không được gọi là train lại model. Skill chung vẫn candidate/test/review/version/rollout hoặc rollback qua quyền rõ ràng.

## B. Vai trò có execution thật

Lead/Planner là run chính. Tool delegation local có các vai trò Document Analyst, Data & Artifact Specialist, Verifier và Memory Curator; Web Researcher dùng public research adapter hiện hữu với query enum/template đã lọc, không nhận private goal hoặc toàn hồ sơ.

Mỗi nhiệm vụ có taskId/parentRunId/tenant/Project/actor/conversation/source version+SHA/model/effort/tools/budget/deadline/input contract/output contract. Backend cấp scope và allowlist, model không truyền actor/Project/path/SQL/credential hoặc tự nâng quyền. Child không được tạo child khác; handoff depth1.

Child sử dụng cùng SIWC connection/model/effort snapshot. Delegation local không gửi field multi_agent/background/max_output_tokens hoặc trường SIWC chưa hỗ trợ. Cùng tally tối đa10 provider requests/40 tool calls và deadline run tối đa1800s hiện hữu; không nhân ngân sách theo số vai trò. Khi không đủ ngân sách, giữ phần có thật và báo thiếu.

Bắt đầu tuần tự một child; chỉ cho tối đa hai nhiệm vụ đọc độc lập chạy đồng thời sau benchmark tài nguyên. Parser nặng một job. Tính toán đợi dữ liệu; artifact đợi kiểm số; kiểm artifact đợi bytes thật. Không song song bước phụ thuộc.

Output specialist là structured data giới hạn32KB, có facts/locators/coverage/assumptions/unresolved/artifact refs. Coverage/ACL và artifact IDs được backend kiểm với ledger/storage hiện hữu; không tin tỷ lệ do model khai. Verifier trả lỗi cụ thể, locator và evidence; việc hai AI đồng ý không đủ xác minh. Lead giữ câu trả lời tốt và sản phẩm đầy đủ; cùng model nên không bắt model yếu viết lại.

Checkpoint lưu child state trước/sau tool boundary, dùng lease/cancel/idempotency của run. Crash không replay thao tác ghi đã có receipt/artifact. Parent Stop/deadline/revoke dừng child và không tạo output trùng. Không giữ browser request để chờ team.

## Product code và verification

Chạm ai-tools/registry, ai-run checkpoint contracts, project-ai.service và UI memory/result hiện hữu; dùng P1-B create/read/proof/audit. Chỉ tách helper khi cần tránh lặp logic; không tạo memory store hoặc queue cạnh tranh.

TDD: QUESTION source của lượt failed/PARTIAL; old empty-locator không trở thành proof sai; cross-Project/actor/revoke; proposal UNVERIFIED/private/idempotent; child model/effort/tool allowlist/callID; shared tally/deadline/cancel/recovery; public child không nhận sentinels; verifier phát hiện một số sai có locator; simple chat không delegation.

Fresh full regression và browser/provider live bắt buộc cho từng release slice. Benchmark cùng yêu cầu/model/effort/source giữa single+tools và team, ghi đúng/coverage/artifacts/thời gian/usage/tài nguyên. Chỉ bật lựa chọn team cho loại việc có lợi ích thực qua kết quả, không coi có nhiều agent là đã cải thiện.

R4 không đợi hoặc thay đổi engine ảnh; ComfyUI thiếu engine/model/workflow/bytes vẫn BLOCKED riêng. Các repo chưa runtime install/adapter/registry/model-visible/execution/result không được báo tích hợp.

## Self-review

Không placeholder hoặc mục tiêu chưa xác định. Không thay goals E03, nguồn chuẩn, DB, OAuth, model/effort, upload10GB, paused providers hoặc business approvals. Phần cần duyệt mới chỉ A và B; sau duyệt sẽ viết plan cụ thể trong /prompt trước implementation. Không commit/push theo yêu cầu hiện hữu.
