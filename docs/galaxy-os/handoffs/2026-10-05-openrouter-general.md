# Bàn giao OpenRouter GENERAL và kết nối LlamaCloud — 05/10/2026

**Hai lượt chat thật chưa đạt: thiếu credential OpenRouter.** Adapter, guard và UI đã triển khai/phát hành; không lấy dropdown hoặc catalogue làm PASS live.

## Bổ sung env ngày 06/10 — WAITING_FOR_SECURE_INPUT

Đối soát giới hạn canonical env/JSON, private env API/Web đang chạy và tên override của process API: ba khóa cũ PRESENT/LOADED; OpenRouter và LlamaCloud MISSING_LOCAL_SECRET, không có nguồn local hợp lệ để tự chuyển. Không đọc clipboard/history/chat hoặc tìm rộng trên ổ đĩa. Canonical env owner1000/mode0600; JSON có 0 secret, giữ theo quyết định **JSON_RETAINED_METADATA_ONLY** vì registry/activation còn dùng flags, FREE_ONLY, policy, revision và evidence.

CLI CODE_SHA=TESTED_SHA `6ffd63614cdec64af11b1958588888db28aeb861`: chỉ sửa `configure-ai.py` và kiểm thử. `setup-missing` mặc định canonical, OpenRouter lưu/kích hoạt trước LlamaCloud tùy chọn; không hỏi/ghi lại khóa đã có. Backup private `ai-credential-backups` ngoài Git tracking, atomic0600, khóa cập nhật/CAS, candidate được resolver hiện hữu kiểm trước ghi. `activate-existing --provider openrouter` dành cho khóa đã đổi trực tiếp trong env: không nhập lại, giữ policy/evidence và đổi revision để evidence cũ hết hiệu lực. `--file` của CLI cũ vẫn là đường metadata JSON, không phải nơi ghi secret.

Fresh CLI25/25 và API OpenRouter/service/registry32/32 PASS; Astra high correctness/secret review và Ponytail PASS. Bao gồm kích thước env, Unicode, xung đột cập nhật, ký tự đặc biệt, input ẩn/empty/cancel, bảo toàn ba khóa/evidence/policy và rerun idempotent. Không thay adapter/UI/IAM/schema. Root checkout không có helper này; worktree và artifact API đang chạy dùng cùng resolver 5 biến, cùng canonical path; không tạo helper/store thứ hai ở root.

Chrome cùng session: settings200, ai.invoke, ba credential cũ LOADED; OpenRouter PROVIDER_ENTRY_MISSING, LlamaCloud CREDENTIAL_PENDING. Gemini/Mistral vẫn paused, Kira QUOTA_EXHAUSTED. Chưa gọi `/key` hoặc inference/OpenRouter, không gọi ba vendor cũ hay dịch vụ LlamaCloud. GENERAL hai lượt, returned model/cost và reload lịch sử OpenRouter vẫn NOT_RUN. Source count0 mới là contract, chưa có evidence lượt live.

Runtime vẫn `local-fd0f306f0c40` / code `dae8e081810490f53c13ad5010495a280ad9e4f9`; không phát hành/restart bản chẩn đoán chỉ để lặp thiếu key. Loader đọc lại canonical config theo request. CLI mới chạy ở worktree đã kiểm, chưa đưa vào artifact live; release theo pipeline và nghiệm thu main tiếp tục khi có input an toàn. Evidence giới hạn trong `/home/galaxy_os/.runtime/env-activation-20261006/`.

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

Lệnh đã được kiểm bằng PTY với giá trị giả, không echo input. Chạy một lần ở terminal local tương tác: nhập OpenRouter trước; LlamaCloud có thể Enter để bỏ qua. CLI hiển thị host, canonical env và vai trò metadata JSON. Không dán key vào chat/argv/pipe/history.

```bash
python3 -B /home/galaxy_os/.worktrees/m2-a-20260928/scripts/configure-ai.py setup-missing
```

CLI giữ key cũ atomic0600/owner1000, metadata-only JSON và kích hoạt OpenRouter FREE_ONLY sau khi lưu; chưa coi credential là live verified. API đọc canonical env ở lượt kế tiếp, không cần restart cho thay file này. Sau khi xác nhận API main đã nạp đúng revision, kiểm `/key` rồi dùng đường UI thường: checkbox công khai/tổng hợp và Phê duyệt nội dung nhập đúng từng câu qua cơ chế INPUT có audit, sau đó Hỏi AI. Không approve Project/source hoặc đổi classification dữ liệu thật.

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
