# GENERAL qua popup main — 05/10/2026

Phạm vi owner: chỉ chat API tại localhost3000, hai câu mẫu công khai; không RAG,
nguồn Project, thiết kế UI, schema, chuyển key hoặc provider mới.

**API_CHAT_MAIN: CHƯA DÙNG ĐƯỢC theo nghiệm thu đủ hai lượt thành công.**
Gemini đã trả một câu thật qua UI và lưu; câu tiếp gặp503. Kira hiện hết quota,
khác evidence PASS của lượt trước. Không sửa code để che lỗi vendor.

## Baseline và cấu hình đã đối chiếu

- Worktree canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, branch
  `m2/project-chat-20260928`, HEAD `ef4d4a4ef0def3bb712eadaa0fb55f2fea4496d8`, sạch đầu lượt.
  Diff từ code SHA dưới đến HEAD chỉ có năm file tài liệu; không reset baseline.
- Runtime READY, release `local-a33d8a12318c`, API/Web cùng code SHA
  `3a00f4ed9274fa5d7fb9c47dc3ea2ef3e4eb43c7`, BUILD_ID `wVAJZE1Lwm17a1L7QI9Jt`.
  API PID487972/Web487385, artifact `ai-env-policy-final-v2-20261005`, systemd.
- API process trỏ metadata `/home/galaxy_os/.runtime/ai-providers.json`;
  `credentialSource.mode=env`, path `/home/galaxy_os/.runtime/ai-providers.env`.
  Metadata không có key; Web process không có credential env. Không đọc/in key.
- API/settings qua phiên Chrome hiện hữu: me200/ai.invoke, cả ba
  `credentialState=LOADED`, `adminEnabled/providerReady/generalAvailable=true`.
  Revision giữ: Gemini `42f289ab-f8da-422b-b737-f3565c202f0c`, Mistral
  `6b102872-8ff0-40b5-b962-c895732ed9d4`, Kira
  `004d59a2-0baa-4ef2-9028-8bcc6ac41f16`. Sau lỗi, model khác vẫn khả dụng.

## UI và live result mới

Chrome đang hiển thị, cùng phiên đăng nhập; nối CDP hiện hữu33005 vì Chrome MCP
không tìm được executable. Không mở Chrome/profile/server mới hoặc đăng nhập fixture.
Từ `/`: **Chọn dự án để hỏi AI → chọn dự án hiện có → ✦ Hỏi AI → Hỏi thông thường
→ Phiên AI mới → chọn model → nhập câu → xác nhận dữ liệu công khai → Phê duyệt
nội dung nhập (quyền hiện có) → Hỏi AI**. Policy vẫn duyệt từng câu mới.

Chỉ duyệt INPUT đúng câu1 cho Kira/Gemini/Mistral và câu2 cho Gemini, trong Project
container hiện có; không APPROVE PROJECT/SOURCE. Ba chat cá nhân mới, không dữ liệu demo.
Mọi answer-create đều `mode=GENERAL`, `sourceIds=[]`, không room/file/product context.
Code artifact tách index/media/egress Project trong GENERAL; adapter chỉ nhận question,
sources rỗng và lịch sử cùng mode, không tên khách/địa chỉ/summary. Không đổi classification.

| Model                 | Answer/request ID                      | Vendor / attempts / thời gian                           | Kết quả UI/lưu                              |
| --------------------- | -------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| kira-3.5-pro          | `1e967fe9-abd1-407c-93aa-2200649f9f9d` | 402, `insufficient_quota`, 1attempt,200ms               | FAILED/QUOTA_EXHAUSTED, giữ nháp            |
| gemini-3.8-flash câu1 | `963bafd2-fc20-4a24-a1e0-8b0c9a7897e6` | 200,1attempt,4272ms                                     | COMPLETED, trả và lưu bản dịch              |
| gemini-3.8-flash câu2 | `bf4a6453-8f6c-4930-a5dd-4f4b9f5e4675` | 503→503→503, Retry-After30s mỗi lỗi;3attempt, UI68459ms | FAILED/TEMPORARY_ERROR, giữ nháp/lượt trước |
| mistral-medium-3-5    | `e259971a-1a40-4eaf-98e5-c31c6cd45fcd` | 429/code1300,1attempt,395ms; không Retry-After          | FAILED/RATE_LIMITED_UNKNOWN, giữ nháp       |

Gemini cùng conversation `dc7c9ff6-4722-4b5d-8eb6-5514f4b8d0e7` cả hai câu;
answer thật: “Việc giao hàng được lên lịch vào thứ Hai.” Mở lại popup rồi reload
thật vẫn thấy answer và lỗi lượt2. Không spinner vô hạn, không POST mới khi mở lại/reload.
Để lại popup GENERAL/Gemini/cùng conversation với nháp câu2, không gửi lại để săn PASS.

Mỗi lượt chỉ1answer-create và1run từ UI. Gemini chỉ adapter retry tối đa3/90s;
native fetch, không SDK hay UI retry nhân tầng, không fallback. Mistral host/model/
version/tham số theo adapter cố định; configured maxOutputTokens8192 dưới limit32768,
reasoning default, không media/lịch sử. Không có căn cứ xác định quota subtype/reset.

## Kiểm tra và giới hạn

- `pnpm --filter @galaxy/api test src/project-chat/ai-registry.test.ts src/project-chat/ai-multi-provider.test.ts`:36/36PASS, mock; input policy, RAG egress, retry và phân loại lỗi/secret.
- `pnpm --filter @galaxy/web test features/project-chat/project-ai.test.tsx`:10/10PASS.
- `python3 scripts/local-runtime.py status`:READY, cùng release/process/artifact;
  chạy read-only được cấp quyền do sandbox chặn netlink. Không restart/deploy.
- Không sửa product code/config credential; chỉ policy INPUT đúng câu mẫu qua UI và
  tài liệu/evidence. Không chạy full M2/PDF/migration; không build vì product không đổi.
  Ponytail/correctness review chỉ diff tài liệu, không có auth/mode/policy code đổi cần Astra.

Evidence riêng0700: `/home/galaxy_os/.runtime/api-chat-20261005/` gồm
`{kira-3.5-pro,gemini-3.8-flash,mistral-medium-3-5}-turn-*.json`,
`provider-diagnostics.json`, `process-metadata.json`, `metadata.json`,
`reopen.json`, `restore.json`. Chỉ câu công khai/answer/metadata allowlist, không
cookie/key/raw vendor body; mỗi receipt có Galaxy HTTP request ID. Galaxy run201
không đồng nghĩa vendor200. Không coi test46PASS là live hai-lượt PASS.

Owner action: Kira kiểm và khôi phục quota/credit theo402 insufficient_quota;
Mistral kiểm Limits/Usage hoặc hỏi hỗ trợ với429/code1300, chưa biết reset;
Gemini chờ lỗi503 phía vendor được giải quyết. Không mua/nạp/tăng hạn mức hoặc
thử lặp. Bước tiếp chỉ nghiệm thu lại GENERAL khi blocker vendor được xử lý.
Phiên dừng sau API chat; các phần khác giữ nguyên.
