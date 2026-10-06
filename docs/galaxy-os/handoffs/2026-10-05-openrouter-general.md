# Bàn giao OpenRouter GENERAL và kết nối LlamaCloud — cập nhật 06/10/2026

**API_CHAT_MAIN: DÙNG ĐƯỢC. Hai lượt OpenRouter thật đã hoàn tất trong popup localhost:3000, cùng hội thoại cá nhân GENERAL; reload sau phát hành vẫn thấy đủ hai answer.**

## Kết quả đã xác minh

| Trường                            | Trạng thái/bằng chứng                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SECRET_FILE_CANONICAL             | `/home/galaxy_os/.runtime/ai-providers.env`, owner1000/mode0600, đủ5biến, không trùng                                                                                            |
| OLD_3_KEYS_PRESERVED              | TRUE; đối chiếu boolean với backup trước setup, ba giá trị không đổi                                                                                                             |
| OPENROUTER_KEY_SOURCE_AND_STATUS  | Người dùng nhập ẩn tại terminal → canonical env PRESENT → API main LOADED → `/key`200 → hai answer COMPLETED                                                                     |
| LLAMACLOUD_KEY_SOURCE_AND_STATUS  | Người dùng nhập ẩn tại terminal → canonical env PRESENT → API main LOADED; không xác minh kết nối vendor                                                                         |
| JSON_DECISION_AND_REASON          | JSON_RETAINED_METADATA_ONLY; 0secret, registry/activation cần flags, FREE_ONLY, policy, revision, evidence                                                                       |
| API_EFFECTIVE_CONFIG              | API PID524234, đúng artifact/code/release, canonical JSON→env; OpenRouter revision `149a3a77-f9cb-40e7-9141-437a2b846099`; Llama revision `65938e15-aeb2-46e2-81cc-30fd0bf6603f` |
| PROVIDER_ENABLED                  | OpenRouter enabled/FREE_ONLY/generalAvailable/providerReady/NORMAL; Gemini/Mistral paused; Kira giữ QUOTA_EXHAUSTED                                                              |
| OPENROUTER_AUTH                   | GET `https://openrouter.ai/api/v1/key`:200,1call,424ms; metadata tại lúc kiểm used0/limit50/remaining50; đây không phải cam kết quota tương lai                                  |
| REQUESTED_MODEL                   | `openrouter/free`; popup tự chọn mặc định khi mở GENERAL mới                                                                                                                     |
| RETURNED_MODELS                   | Lượt1 `inclusionai/ling-3.0-flash-sante:free` / Novita; lượt2 `cohere/north-mini-code:free` / Cohere                                                                             |
| GENERAL_TURN_1                    | COMPLETED, vendor200,1dispatch/0retry; input82/output633token;9.150s từ UI; answer đã lưu                                                                                        |
| GENERAL_TURN_2                    | COMPLETED, vendor200,1dispatch/0retry; input78/output214token;7.046s từ UI; dùng lịch sử cùng GENERAL, answer đã lưu                                                             |
| GENERAL_SOURCE_COUNT              | 0 ở cả2request `sourceIds:[]` và DB source dependencies0/citations0; không Project/file/RAG context                                                                              |
| HISTORY_RELOAD                    | PASS; đóng/mở và reload, kể cả sau cutover, giữ2answer/cùngsession;0POST AI khi reload                                                                                           |
| FREE_ONLY_COST_EVIDENCE           | Cả2response `usage.cost=0`, upstream inference/prompt/completion cost đều0; backend guard nguyên vẹn, không paid fallback/tools/plugins/BYOK                                     |
| LLAMACLOUD_CONNECTION_TYPE        | DOCUMENT_KNOWLEDGE, credentialConfigured=true/LOADED, connection enabled=false/statusNOT_VERIFIED; không là model GENERAL                                                        |
| LLAMACLOUD_CREDIT_CONSUMING_CALLS | NOT_RUN; không upload/parse/extract/index/session/chat RAG                                                                                                                       |
| CODE_OR_CONFIG_CHANGED            | Chỉ CLI+tests ở code commit `6ffd636`; người dùng thêm2khóa và metadata; duyệt INPUT đúng2câu mẫu qua UI, không mở nguồn Project                                                 |
| CODE_SHA / TESTED_SHA             | `6ffd63614cdec64af11b1958588888db28aeb861`                                                                                                                                       |
| LOCAL_RELEASE                     | `local-d3fd75b21ffe`, API/Web READY; artifact `openrouter-env-active-20261006`; snapshot sạch từ docs HEAD `cbdddee139c41a8252cdeeb2bc5741f143be8445`                            |
| REMAINING_BLOCKER                 | Không còn blocker cho OpenRouter GENERAL đã nghiệm thu; LlamaCloud connectivity chưa kiểm theo phạm vi cấu hình-only                                                             |
| EXACT_USER_ACTION_IF_REQUIRED     | Không cần nhập lại khóa; mở popup và dùng OpenRouter theo đường bên dưới                                                                                                         |

## Hành trình và answer thật

`http://localhost:3000/` → vào trang dự án hiện có → **Mở Hỏi AI dự án** → **Hỏi thông thường** → **Phiên AI mới** → **OpenRouter — Tự chọn model miễn phí**. Nhập câu hỏi; với nội dung thử công khai/tổng hợp, chọn checkbox và **Phê duyệt nội dung nhập** theo cơ chế hiện có, rồi **Hỏi AI**. Giữ IAM, ai.invoke, ownership và policy; không áp phê duyệt này cho hồ sơ thật hoặc9Project.

Chrome cùng actor/session, hội thoại `2bee9972-e5f0-4f6c-9b74-594bf0038308`. Không tạo Project/room/file/demo hoặc tài khoản khác. GENERAL gắn đường UI dự án nhưng không lấy hồ sơ dự án.

1. “Dịch sang tiếng Việt: The delivery is scheduled for Monday.” → **“Việc giao hàng được lên lịch vào thứ Hai.”**
   Answer/request ID `7aa8cc67-2dd8-4f14-8745-8513c724ed66`; gateway `gen-1791256869-tSgOiqo8odS9xtwzaHlY`; API run request `6144d2ae-162a-4bca-9212-c667e68c4ab6`; vendor diagnostic1543ms.
2. “Viết lại bản dịch vừa rồi thành một câu nhắn lịch sự cho khách hàng.” → **“Chúng tôi xin thông báo rằng đơn hàng của bạn dự kiến sẽ được giao vào thứ Hai tới. Nếu bạn có bất kỳ yêu cầu đặc biệt nào hoặc cần hỗ trợ thêm, vui lòng liên hệ với chúng tôi.”**
   Answer/request ID `c2b1eadf-afbd-45d1-8937-c87841bf52ad`; gateway `gen-1791256895-1AgZ6Oh0sUXzwZjwNSDd`; API run request `ed1878d9-01c0-4ae6-867e-d1b1354ddf4f`; vendor diagnostic660ms.

Hai clientKey riêng, mỗi lượt một POST tạo answer và một POST run; không dùng retry câu1 làm câu2. Router trả hai model khác nhau; label UI/DB giữ đúng tên thực tế. Answer final không rỗng, không reasoning-only. Kiểm cost câu1 trước khi gửi câu2.

## CLI, verification và release

Lệnh nhập thiếu đã được kiểm PTY với khóa giả; người dùng đã chạy và nhập đủ2khóa, **không cần chạy lại để sử dụng chat**:

```bash
python3 -B /home/galaxy_os/.worktrees/m2-a-20260928/scripts/configure-ai.py setup-missing
```

`--file` của CLI cũ là metadata JSON. `setup-missing` tự dùng canonical JSON/env, không theo shell override; OpenRouter lưu/kích hoạt trước LlamaCloud tùy chọn. Backup private `ai-credential-backups` ngoài Git tracking; atomic0600/flock/CAS; candidate dùng chung JS resolver, kiểm giới hạn32768/Unicode trước ghi. Rerun không hỏi/ghi lại khóa đã có. Nếu chủ động đổi trực tiếp khóa env sau này, `activate-existing --provider openrouter` đổi revision để evidence cũ hết hiệu lực, giữ policy/evidence; không nhập lại khóa. Root checkout không có helper; worktree/artifact đang dùng cùng resolver5biến, không tạo store thứ hai.

- Fresh CLI25/25 và API OpenRouter/service/registry32/32 PASS; Astra high correctness/secret và Ponytail review PASS. Mock/fixture cho negative tests; runtime không mock/hard-code.
- Frozen artifact API/Web/Edge build PASS theo pipeline; Edge chỉ build, không restart. Không sửa adapter/UI/auth/mode/policy code sau khi hai lượt live đã đạt. App chat source giữa artifact nghiệm thu ban đầu và bản cuối không đổi; bản cuối đưa CLI đã review vào artifact.
- Cutover API/Web bằng units hiện hữu; session/DB/storage/canonical env+JSON giữ nguyên byte trong activation, schema84 không đổi, Edge PID308598 giữ, public domain CLOSED. Reload cuối giữ cùng actor, model/haianswer; không gửi thêm inference chỉ để lặp PASS.
- Scan3212file API/Web build với cả5credential: không giá trị secret, không env thật trong artifact. Các log runtime/build/cutover được kiểm boolean không chứa credential. Không key trong Git/argv/unit/client; JSON0secret.
- Không gọi mới Gemini/Mistral/Kira; không LlamaCloud credit call. Không fullM2/PDF/OCR/RAG/clock campaign; không schema/migration/Figma/layout/typography/LAN/domain changes. Commit local, không push/merge.

## Evidence và nguồn

Private `/home/galaxy_os/.runtime/env-activation-20261006/`: `preservation.json`, `source-audit.json`, `runtime-metadata.json`, `metadata.json`, `account-metadata.json`, `openrouter-free-turn-1.json`, `openrouter-free-turn-2.json`, `persisted-evidence.json`, `reopen.json`, `restore.json`, `log-secret-check.json`, test/build logs. `release/`: secret-boundary/cutover-result và staged units; env/backup không vào Git. DOCS_COMMIT_SHA là commit chứa cập nhật này, ghi SHA thực vào private `final.json` sau commit.

Lịch sử triển khai05/10 ở Git và `/home/galaxy_os/.runtime/openrouter-20261005/`; [evidence vendor cũ](2026-10-05-api-chat-main.md). Báo cáo MISSING trước khi người dùng nhập đã được thay bằng evidence LOADED/auth/chat thật ở trên. LlamaCloud Chat/RAG trên cloud sau này cần index, nguồn/phạm vi, quota và quyền/session tương ứng; chưa triển khai.

Nguồn chính thức đã đọc: [Quickstart](https://openrouter.ai/docs/quickstart), [Free router](https://openrouter.ai/docs/guides/routing/routers/free-router), [Provider selection/max_price](https://openrouter.ai/docs/guides/routing/provider-selection), [Limits/key metadata](https://openrouter.ai/docs/api_reference/limits), [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [LlamaCloud Chat trên index/session](https://developers.llamaindex.ai/llamaparse/cloud-index-v2/chat/), [LlamaCloud pricing](https://www.llamaindex.ai/pricing). Router không phải model cố định; “free” không phải bằng chứng privacy/actual cost hoặc quota vô hạn.
