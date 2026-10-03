# M3 — Bàn giao AI đa nhà cung cấp và Figma

## Cập nhật 04/10 — UI PDF đã phát hành, live AI còn thiếu credential

Release hiện hành `local-49bd3faf2e63`, code/tested `de274d3e1c38dfb0136fee25334f031b95eb328b`,
tree `030849c361c7c34f64ee6373c4fe715ac7473b57`. [Bàn giao UI và trạng thái cuối](ui-figma/HANDOFF.md)
chứa manifest PDF/function map/deviations, activation và evidence theo UNIT/INTEGRATION/
CHROME/LIVE_PROVIDER. API1272/Web557/Edge5/document1/Python37 và Chrome28 theo nhóm
cùng build đạt; main/LAN/session/public gate/keeper/logs đã kiểm. Web flag AI đã đồng bộ.
Cả3provider configLoaded=true nhưng credentialConfigured=false; live NOT_RUN.
Các kết quả và release bên dưới thuộc lượt03/10, không thay trạng thái hiện hành.

## Phạm vi và cách dùng

Lối vào vẫn **http://localhost:3000/ → Project → Làm việc → Hỏi AI**.
Bộ chọn có Gemini 3.8 Flash, Mistral Medium 3.5, Kira 3.5 Pro. Mỗi answer giữ
model/provider đã dùng. Lựa chọn lưu riêng actor/Project trong sessionStorage
(chỉ model ID); Gemini được đề xuất lần đầu khi hợp lệ. Model đã lưu bị tắt
vẫn giữ trạng thái tắt, không tự fallback.

Đổi model giữ conversation, source index và quyền hiện hữu. Request đã gửi
chốt model/provider/revision/payload; retry giữ chốt đó. Khi POST chưa rõ kết
quả, UI hiện lượt đã chốt và cho chọn retry hoặc tạo lượt mới; nháp khác không
bị xóa. Không tự đăng câu trả lời vào room khách, không copy Project/bộ nhớ.

Đây là chat có nguồn của nền M3: chưa có nguồn hợp lệ trả `NO_SOURCES`; không
tạo citation giả để giả vờ đã đọc Project. Retrieval vẫn lexical, chưa semantic.
Lịch sử tối đa 6 lượt gần nhất được dựng lại sau kiểm quyền và egress. Nguồn
cũ bị thu hồi chặn toàn answer dẫn xuất; không chỉ giấu citation.

## Trạng thái kết nối

Cả ba adapter đã triển khai và qua contract/mock integration. Cả ba chưa có
khóa thay thế, chưa xác minh quyền truy cập model của tài khoản, chưa live-test.
`BLOCKED_BY_CREDENTIALS` không ảnh hưởng health Web/API. Không dùng khóa từng
dán trong chat và không khẳng định các khóa đó đã được thu hồi.

Google dùng Interactions native, `store:false`; Mistral dùng Chat Completions
chính thức; Kira dùng subset Chat Completions đã đối chiếu tại host Kira.
Requested/returned model lưu riêng nếu API trả; không xác minh độc lập upstream
của Kira. Không lưu/replay thought, signature hoặc state opaque. Không raw thought,
streaming chưa kiểm output, tools, shell, arbitrary web fetch hay fallback.

Reasoning: Gemini mặc định/low/medium/high; Mistral mặc định/none/high; Kira chỉ
mặc định nhà cung cấp. Không áp một tham số effort chung lên ba API.

## Khóa thay thế và policy

Nhập ở terminal local dưới đúng owner service `hailq_glx`, không gửi khóa vào
Codex, HTTP LAN, shell argv/history hoặc browser. Ví dụ từ worktree canonical:

```bash
python3 scripts/configure-ai.py key --provider google_gemini
python3 scripts/configure-ai.py key --provider mistral
python3 scripts/configure-ai.py key --provider kira
```

Lệnh yêu cầu gõ lại host cấp khóa rồi đọc input ẩn; nếu không tắt echo được thì
chặn trước khi đọc. File riêng `/home/galaxy_os/.runtime/ai-providers.json`,
owner service, mode0600, atomic replace và lock; không nằm trong Git/artifact.
Không ghi placeholder đè key khác. Mỗi lần thay key đặt kết nối disabled và xóa
live evidence cũ. Có lệnh `status`, `enable`, `disable`, `approve-project`,
`approve-source`; xem `--help`. Chỉ bật sau khi xác nhận đúng console/host.

API đọc file qua `GALAXY_AI_CONFIG_FILE` trong environment của **systemd API**,
đọc lại ở mỗi gate. Thay key không cần restart Web/API. Chỉ shell export không
đủ cấu hình service. Không GET trả key; màn quản trị chỉ đọc metadata và yêu
cầu `ACCESS_ADMIN` đồng thời với quyền AI hiện hành.

Chủ dự án đã chọn **không giới hạn số lượt/ngày**. Vẫn giữ concurrency1/provider,
input JSON tối đa64000byte, output mặc định8192token, timeout90s, reservation120s.
Cancel/timeout không chứng minh provider chưa xử lý/tính phí. Không retry tự động,
không exactly-once billing, không báo chi phí0 khi chưa có đơn giá đáng tin.

Pilot chỉ `SYNTHETIC_PUBLIC_APPROVED`: Project được duyệt bằng organizationId/
projectId và từng source index ID/**version** được duyệt. User xác nhận câu hỏi
không có nội dung mật/cá nhân. Nguồn có READ hoặc PUBLISHED vẫn cần egress approval.
Không có Project thật nào được tự duyệt; không index/upload chín Project main.
Google billing/tier chưa xác minh; Mistral retention/training chưa xác minh;
Kira là trung gian và có thể chuyển tới đối tác. Không suy ra paid/ZDR/no-training.

Live smoke còn phải chạy cho **từng provider** sau nhập key: câu tiếng Việt,
fixture văn bản có đáp án, câu nối tiếp, đổi model trong cùng hội thoại và mở
citation đúng nguồn. Có thể nghiệm thu text từng provider độc lập; không lấy
mock làm live. Không tự sửa các cờ live chỉ để mở nút.

## File và mức hỗ trợ

- Text: extraction và lexical RAG hiện hữu, giữ source/version/checksum/locator.
- Gemini ảnh PNG/JPEG và PDF: đường native inline đã code và kiểm mock; vẫn **tắt
  trên main**, chưa image/PDF live. Tối đa3file, tổng8MB; PDF tối đa10trang/file,
  không encrypted/JavaScript; locator từng trang, gửi toàn PDF ngắn đã chọn.
- PDF dùng parser local `pdfinfo` qua subprocess có timeout/buffer limit. Local
  cài riêng Poppler22.02.0 từ gói Ubuntu chính thức trong `.runtime/pdf-tools`,
  không chạy script vendor hoặc sửa OS. Env `GALAXY_AI_PDFINFO` và
  `GALAXY_AI_PDF_LIBRARY_PATH` chỉ định parser/library, không chứa khóa.
- Mistral/Kira hiện chỉ text; không gọi OCR tính phí hoặc gửi raw binary.
- Không có extractor Word/Excel sẵn trong nền AI: trả unsupported, không giả đọc đủ.
- Không dùng provider file storage/handle, nên expiry/re-upload handle hiện N/A.
  ChatFile/version hoặc publication gắn FileAsset/checksum và storage Galaxy vẫn là nguồn gốc, kiểm ACL/version trước và sau I/O.
- Hai binary thiếu baseline giữ `MISSING_BINARY`; không tạo file rỗng.

## API và phần bàn giao Figma

Prefix `/api/v1/project-chat/projects/:projectId/ai`; giữ API conversation/index/
answer/run/cancel/source của M3. `GET /ai` thêm `models`; `GET /ai/settings` cho
admin. Body tạo answer thêm `model`, `reasoning`,
`dataClassification:'SYNTHETIC_PUBLIC_APPROVED'`, `sourceIds` UUID tối đa3.
Client key cũ phải giữ toàn payload; thay payload trả409. Backend kiểm tenant,
Project, INVOKE, room/history/publication/source version, rồi policy và quota.

Registry phân biệt published, accountVisible, adminEnabled, credentialConfigured,
available/reason, adapterImplemented, lastTest, textLiveVerified và capability.
`available` nghĩa được phép thử theo cấu hình hiện tại, không đồng nghĩa live PASS.
Capability cụ thể có text, documentTextFallback, imageInput, pdfInput,
structuredOutput, reasoningModes, streaming, context/output limits và evidence.
Mistral/Kira output ceiling là giới hạn triển khai local; context chưa xác minh
là null. Registry chưa bật toàn catalogue vendor. Usage chỉ token thực khi API trả.

| Điểm redesign     | Component/source hiện tại                                               | Giữ logic                                                                 |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ModelSelector     | `apps/web/features/project-chat/project-ai.tsx`, export `ModelSelector` | disabled reason, preference actor/Project, reasoning đúng provider        |
| AIComposer        | form trong `ProjectAi` cùng file                                        | nháp, pilot consent, request pin, retry/cancel, source selection          |
| Answer            | export `AiAnswer`                                                       | nhãn model/provider/time, status, token thực, uncertainty, quyền dẫn xuất |
| SourcePanel       | aside `Nguồn câu trả lời` trong `ProjectAi`                             | backend handle, version/page/line, route download có quyền                |
| Provider settings | details trong `ProjectAi`, API `settings`                               | ACCESS_ADMIN, không key, host/policy/hạn mức/evidence                     |
| Domain/adapter    | `ai-registry.ts`, `ai-provider.ts`, `project-ai.service.ts`             | không phụ thuộc màu sắc/layout                                            |

State chính: thiếu key, model disabled/unavailable, policy blocked, unsupported
file/reasoning, missing binary, quota/concurrency, key invalid, rate limit,
safety block, timeout chưa rõ kết quả, cancelled, access revoked, no sources,
completed. Figma có thể thay trình bày mà không tạo provider/memory khác.

## Release và bằng chứng

Baseline `local-f93ef7df2fbc`; source đầu lượt `3c27d94`, branch
`m2/project-chat-20260928`, worktree `/home/galaxy_os/.worktrees/m2-a-20260928`.
Không migration mới; schema83 giữ nguyên. Chỉ commit local file đã review;
không push/merge/remote deploy. Đã chuyển release `local-b5045512d8b0`, Web/API systemd READY. Chrome chính
localhost3000 xác minh3 lựa chọn thiếu key, admin settings và reload. Kết quả cuối tại
[VERIFICATION](VERIFICATION.md). Public domain giữ đóng; LAN/Edge/keeper giữ
cơ chế hiện hữu, đóng Codex thật vẫn deferred theo quyết định trước.
