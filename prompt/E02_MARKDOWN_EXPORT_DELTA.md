# E02 — Markdown export delta r1

2026-10-10. OWNER_APPROVED_BY_SCOPE: chỉ đạo giữ/hoàn thiện Markdown export và approval toàn bộ thiết kế chức năng; không redesign UI hoặc hỏi lại gate.

## GAP / REUSE

Đối chiếu source hiện hành: answer lưu Markdown trong ChatAiAnswer và history hiện hữu; không thấy route tải Markdown hoặc nút export trong SIWC chat. Workspace trả answerMarkdown là dữ liệu job, không chứng minh export dùng được. Đây là thiếu chức năng trong scope E02, không dependency/library gap.

## Thiết kế / kế hoạch tối thiểu

Tái sử dụng ProjectAiService.ownedAnswer/view và history/ACL hiện hữu. Route GET `/project-chat/projects/:id/ai/answers/:answerId/markdown` chỉ trả answer COMPLETED còn quyền hiện tại, dưới dạng attachment `text/markdown; charset=utf-8`, filename server cố định. Nội dung giữ hỏi/trả lời nguyên gốc, nhãn BẢN NHÁP, nguồn/version/provenance và đường dẫn artifact đang được cấp quyền; không gọi model, không tạo domain/storage mới, không phát hành/gửi ngoài. Nút `Tải Markdown` trong answer hoàn tất dùng URL backend thật; reload dựng lại từ DB. Bộ nhớ/confirmation status không đổi.

TDD: RED route nội dung/download/reload, Project/actor sai hoặc grant revoked/answer failed không export, không gọi provider; GREEN reuse view. Unit/UI button đúng completed state. One independent final review for this new functional delta, one parent fix pass then fresh full checks/frozen browser and current owner export+reload. Triển khai sau freeze R7 decoder/deadline để không trì hoãn mốc báo giá đang verify. Không dùng test cũ/docs PASS cho route mới.

R8 small functional completeness delta: current Create menu only exposes Office formats; generative image NOT_READY exists in docs but has no visible in-product capability state. Reuse existing menu, add disabled Tạo ảnh entry with clear engine/model/workflow/resource prerequisites; no hosted tool claim, provider call, model fallback or UI redesign. Test visible honest state and absence of executable image tool. Video remains separate. This is within owner blanket functional design approval.

2026-10-10 execution delta: R7 is frozen, never deployed because full browser fixture failures remain; R8 will release reviewed R7 decoder/deadline plus this small functional delta after fresh full/frozen/live gates. This meets the planned after-freeze ordering; no repeat design gate or unverified browser14 claim. Markdown RED r95 -> GREEN r97API2/web23, source typechecks PASS. Image UI RED r96 genuine missing entry; implementation added disabled entry/conditions, no executable image tool, native input vision unaffected.
