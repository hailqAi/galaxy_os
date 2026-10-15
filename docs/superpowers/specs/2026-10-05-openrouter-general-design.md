# OpenRouter GENERAL và kết nối LlamaCloud

Thiết kế được owner chỉ định/duyệt trong prompt05/10: thực thi inline trong phiên,
OpenRouter FREE_ONLY qua popup hiện hữu, LlamaCloud chỉ cấu hình dịch vụ tài liệu.
Không cần chọn kiến trúc mới. Mục tiêu là hai câu công khai được trả lời thật trong
cùng conversation GENERAL và đọc lại sau reload. Thiếu key mới chỉ chặn live test.

Tái dùng ai-registry/ai-provider/ProjectAiService, secret env loader và configure-ai.py.
Không dependency/schema/model Codex mới, không RAG/PDF/OCR/Figma/LAN/domain.
Giữ canonical env0600; bổ sung OPENROUTER_API_KEY, LLAMA_CLOUD_API_KEY qua input ẩn,
atomic/preserve sibling; metadata-only ở store hiện hữu, không secret mới trong JSON.

OpenRouter chỉ allowlist `openrouter/free`, tên “OpenRouter — Tự chọn model miễn phí”.
Backend chỉ GENERAL text; từ chối paid/auto/online/plugin/tools/media/Project context.
HTTP native fetch non-streaming, fixed host https://openrouter.ai/api/v1, redirect:error;
history text được kiểm quyền/policy, không opaque state. GET /models catalogue text và
pricing zero, TTL60s, bounded response/deadline; fail closed khi không xác minh được.
POST /chat/completions khóa provider.max_price prompt/completion/request0,
data_collection=deny, không paid fallback/BYOK/plugin. Không nới privacy để tìm PASS.
Không đồng nhất requested router với returned model. Chỉ nhận content không rỗng,
không error/reasoning-only/tool calls; lưu returned model, gateway ID/provider khi có,
tokens/cost có nguồn trong usage JSON hiện hữu. Cost thiếu=UNKNOWN; cost ngoài0 chặn
request tiếp theo trên cùng config revision bằng evidence backend hiện hữu.

Giữ IAM/ai.invoke/tenant/owner/input policy. Đúng hai câu owner cho phép sẽ được duyệt
theo registry hiện hữu; không mở nguồn chín Project. Retry tối đa3/90s và gate trước
mỗi attempt, không SDK/UI retry thêm hoặc xoay provider/key để né quota.

Gemini/Mistral dùng paused metadata riêng: chặn ask/run/retry/probe nhưng cho đọc lịch
sử theo quyền và policy thật. Không xoá/đổi nhãn answer/credential; Kira giữ quota state,
không gọi thử. Default OpenRouter chỉ cho GENERAL chat mới đủ credential/capability;
không đổi conversation/model đang chạy. Answer ghi “Qua OpenRouter · model thực tế”.

LlamaCloud nằm trong connections metadata cùng store, category DOCUMENT_KNOWLEDGE,
không nằm trong AI_MODELS. UI cấu hình hiện hữu chỉ hiển thị metadata credential/status.
Chưa triển khai network xử lý, index/job/session/cloud RAG hoặc gửi tài liệu; connectivity
chưa kiểm nếu chưa có credential/endpoint read-only xác minh đúng. Để dùng sau cần index,
nguồn/phạm vi, quota và authorization được giao riêng.

Nguồn chính thức đã đọc05/10:

- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/guides/routing/routers/free-router
- https://openrouter.ai/docs/api/reference/limits
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/cookbook/administration/usage-accounting
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- https://openrouter.ai/api/v1/models (entry openrouter/free: text input/output, prompt/completion0)
- https://developers.llamaindex.ai/llamaparse/cloud-index-v2/chat/
- https://www.llamaindex.ai/pricing

Release qua prepare-local-release/systemd pipeline hiện hữu, giữ session/DB/storage/
Edge/keeper/public-closed. Targeted tests và auth/cost/secret review trước local commit,
không full M2/clock/PDF/RAG. Không push/merge/remote deploy.
