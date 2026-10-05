# Bàn giao OpenRouter GENERAL và kết nối LlamaCloud — 05/10/2026

**Hai lượt chat thật chưa đạt: thiếu credential OpenRouter.** Adapter, guard và UI đã triển khai/phát hành; không lấy dropdown hoặc catalogue làm PASS live.

## Kết quả hiện hành

| Trường                            | Bằng chứng/trạng thái                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPENROUTER_ADAPTER                | DEPLOYED; native fetch vào endpoint cố định `https://openrouter.ai/api/v1/chat/completions`, text GENERAL, không redirect/fallback                                                                          |
| OPENROUTER_CREDENTIAL_LOADED      | NO; canonical env không có `OPENROUTER_API_KEY`, metadata entry chưa được tạo bằng nhập khóa ẩn                                                                                                             |
| FREE_ONLY_ENFORCEMENT             | Backend chỉ nhận `openrouter/free` + FREE_ONLY; catalogue text/pricing kiểm có TTL60s/cap4MiB; `max_price` prompt/completion/request0; `data_collection:deny`; không tools/plugins/media/BYOK/paid fallback |
| REQUESTED_MODEL                   | `openrouter/free` là cấu hình mục tiêu; chưa có request inference live                                                                                                                                      |
| RETURNED_MODELS                   | NOT_RUN; không suy ra upstream/model thực tế                                                                                                                                                                |
| GENERAL_TURN_1                    | NOT_RUN — CREDENTIAL_PENDING                                                                                                                                                                                |
| GENERAL_TURN_2                    | NOT_RUN — CREDENTIAL_PENDING                                                                                                                                                                                |
| USAGE_COST_EVIDENCE               | NOT_AVAILABLE: chưa inference; không tự ghi cost0. Cost total thiếu được giữ UNKNOWN; cost details nullable được bảo toàn                                                                                   |
| GENERAL_SOURCE_COUNT              | 0 theo contract/test; chưa có lượt OpenRouter live để ghi count runtime                                                                                                                                     |
| HISTORY_RELOAD                    | OpenRouter NOT_VERIFIED; lịch sử GENERAL Gemini cũ đọc lại được sau reload và pause                                                                                                                         |
| GEMINI_MISTRAL_PAUSED             | YES; config/API/UI paused, option disabled có nhãn tạm dừng; không đổi revision/credential/history                                                                                                          |
| KIRA_QUOTA_STATE                  | Giữ QUOTA_EXHAUSTED402/insufficient_quota từ evidence trước; không gọi lại/fallback/nạp tiền                                                                                                                |
| LLAMACLOUD_CONNECTION_TYPE        | DOCUMENT_KNOWLEDGE trong `connections.llama_cloud`, không thuộc AI_MODELS/dropdown GENERAL                                                                                                                  |
| LLAMACLOUD_CONFIG_STATUS          | Metadata REGISTERED; CREDENTIAL_PENDING/CONNECTIVITY_NOT_VERIFIED; canonical env chưa có `LLAMA_CLOUD_API_KEY`                                                                                              |
| LLAMACLOUD_CREDIT_CONSUMING_CALLS | NOT_RUN; không Parse/Extract/Index/Chat session/upload/read index                                                                                                                                           |
| CODE_SHA / TESTED_SHA             | `dae8e081810490f53c13ad5010495a280ad9e4f9`                                                                                                                                                                  |
| DOCS_COMMIT_SHA                   | Commit chứa handoff này; SHA thực được ghi trong private `final.json` và báo cáo sau commit                                                                                                                 |
| DEPLOYED_LOCAL_RELEASE            | `local-fd0f306f0c40`, API/Web READY cùng artifact `openrouter-general-final-20261005`                                                                                                                       |
| REMAINING_BLOCKERS                | Nhập OpenRouter replacement credential tại terminal; sau đó enable đúng config, metadata `/key`, hai lượt UI, kiểm cost từng lượt và reload. LlamaCloud credential chỉ chặn kiểm kết nối tương ứng          |

## Đường dùng và bước tiếp tục

`localhost:3000` → Chọn dự án để hỏi AI → trang làm việc dự án hiện có → Mở Hỏi AI dự án → Hỏi thông thường → Phiên AI mới → Model AI: **OpenRouter — Tự chọn model miễn phí**.
Hiện model bị khóa vì credential chưa có. Popup/typography/P04 và hội thoại hiện hữu giữ nguyên; không tạo Project/demo/database khác.

Lệnh đã được kiểm bằng PTY với giá trị giả, không echo input. Chạy ở terminal local tương tác; xác nhận `openrouter.ai`, nhập replacement key ẩn. Không dán key vào chat/argv/pipe/history.

```bash
python3 -B /home/galaxy_os/.worktrees/m2-a-20260928/scripts/configure-ai.py key --provider openrouter --file /home/galaxy_os/.runtime/ai-providers.json
```

CLI giữ key cũ atomic0600/owner1000, metadata-only JSON; entry mới vẫn disabled. API đọc canonical env ở lượt kế tiếp, không cần restart cho thay file này. Sau khi nhập, bật OpenRouter bằng CLI enable hiện hữu rồi dùng đường UI thường: checkbox công khai/tổng hợp và Phê duyệt nội dung nhập đúng từng câu qua cơ chế INPUT có audit, sau đó Hỏi AI. Không approve Project/source hoặc đổi classification dữ liệu thật.

Câu1: “Dịch sang tiếng Việt: The delivery is scheduled for Monday.”
Câu2: “Viết lại bản dịch vừa rồi thành một câu nhắn lịch sự cho khách hàng.”

Trước câu2 kiểm response thật không rỗng, usage/cost và gateway request ID; positive cost/detailed cost chặn outbound tiếp cùng revision, kể cả retry/cancel. Không quay paid hoặc gọi provider đã pause. Save requested/returned model, provider khi vendor trả, usage/cost/status/retry/time trong usage hiện hữu; không schema mới. Mỗi lượt clientKey riêng; reload/reopen không tự gửi lại.

Khi cần nhập LlamaCloud sau này, CLI key hỗ trợ provider `llama_cloud`, cùng canonical env và input ẩn/host xác nhận. Chưa có endpoint read-only được lựa chọn/kiểm trực tiếp trong lượt này. Sử dụng Chat/RAG trên cloud về sau cần index, nguồn/phạm vi được phép, quota và quyền/session tương ứng; chưa triển khai.

## Xác minh mới và giới hạn

- API affected62/62, Web affected13/13, Python credentialCLI15/15 PASS; types/lint/format/diff check PASS. Web package lint có một warning `app/account/profile/page.tsx:154` đã tồn tại.
- Astra high review cost/secret/host/IAM/mode/policy PASS; Ponytail diff/correctness PASS. Đã sửa regressions cost details thiếu total/null, 200error có cost, durable stop trước retry, cost/cancel race; giữ trạng thái CANCELLED và bằng chứng phí.
- Chrome cùng user/session: me200 + ai.invoke; API/Web health200 đúng release; Gemini/Mistral disabled với nhãn tạm dừng; lịch sử GENERAL Gemini cũ vẫn có bản dịch; reload không có POST AI. Dynamic OpenRouter history/default/manual model switch và hai lượt live chưa được nghiệm thu vì thiếu credential.
- Frozen artifact build API/Web/Edge PASS theo pipeline hiện hữu; Edge chỉ build dependency pipeline, không restart/đổi chức năng. Hai code commits local `cc1efe8` và `dae8e08`; không push/merge.
- 14 product files snapshot khớp byte với CODE_SHA; pending docs snapshot được đánh dấu dirty thật. Artifact scan3212files: không có giá trị credential trong Web/API build; env/keys ngoài artifact/unit. Metadata process xác nhận đúng cwd/code/release và config canonical, không key ở Web/process env.
- Cutover chỉ API/Web/manifest; schema84/checksum inventory và DB/storage/session env giữ nguyên, Edge PID308598 giữ; public domain vẫn đóng. Không migration/reset/source permission/memory architecture changes.
- Không gọi thử Gemini/Mistral/Kira; không LlamaCloud credit call. OpenRouter chỉ public GET/models200 không Authorization, catalogue checked `2026-10-05T06:55:56.117015+00:00`:763948bytes, ID `openrouter/free`, input/output text, prompt/completion pricing0. Đây là lớp catalogue, chưa phải cost/live evidence.
- Không chạy full M2/RAG/citation/PDF/OCR/clock; focused regression theo phạm vi owner. Negative tests dùng mock/fixture; runtime không mock/hard-code.

## Evidence và nguồn chính thức

Private `/home/galaxy_os/.runtime/openrouter-20261005/`: catalogue.json, verification.json, pause-registration.json, metadata.json, logs RED/GREEN. Thư mục `final/`: cutover-result.json, secret-boundary.json, chrome-readiness.json, process-metadata.json và final.json sau docs commit. Tất cả không chứa key/Authorization; không đưa private env/backup/profile Chrome vào Git.

Thiết kế/plan: `docs/superpowers/specs/2026-10-05-openrouter-general-design.md`, `docs/superpowers/plans/2026-10-05-openrouter-general.md`. Evidence vendor cũ: [bàn giao trước](2026-10-05-api-chat-main.md), không thay thế nghiệm thu OpenRouter.

Nguồn chính thức đã đọc: [Quickstart](https://openrouter.ai/docs/quickstart), [Free router](https://openrouter.ai/docs/guides/routing/routers/free-router), [Provider selection/max_price](https://openrouter.ai/docs/guides/routing/provider-selection), [Limits/key metadata](https://openrouter.ai/docs/api_reference/limits), [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [LlamaCloud Chat trên index/session](https://developers.llamaindex.ai/llamaparse/cloud-index-v2/chat/), [LlamaCloud pricing](https://www.llamaindex.ai/pricing). Router không phải model cố định; “free” không phải bằng chứng privacy/actual cost hoặc quota vô hạn.
