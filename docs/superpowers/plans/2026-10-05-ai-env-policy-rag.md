# Kế hoạch AI: env API, policy và RAG

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Chủ dự án chọn INLINE; một người sửa source, một reviewer độc lập cuối lượt.

**Goal:** Giữ credential hoạt động, tách chat thường/RAG và chứng minh citation trên DB fixture riêng, phát hành qua artifact/systemd.

**Architecture:** Tái sử dụng registry, adapter fetch, ChatAiConversation/Answer/Dependency, lexical index và ACCESS_ADMIN. Secret tách khỏi metadata bằng một resolver backend/CLI, không thêm framework, IAM hay migration.

**Tech Stack:** NestJS/Prisma/PostgreSQL, Next.js, Node fetch, Python CLI, systemd.

**Spec:** Chỉ đạo chủ dự án trong phiên 05/10/2026, các mục 1–12; `docs/galaxy-os/milestones/M3/DESIGN.md` là nền hiện hữu. Phương án env riêng, fixture riêng, hai chế độ, inline và phát hành đã được chủ dự án chốt. Không dùng prompt cũ làm ủy quyền mới.

## Ràng buộc chung

- Baseline HEAD `bbd139032fd693e22492af5ac02a1dfc106669bf`, tree `212655545a70e3b1313575e2524fde9e53a20558`, worktree sạch. Runtime code `11af11543196b80dc6f35abbfba9b1b329768390`, release `local-df7ba5a5c974` đã đọc lại.
- Giữ popup560/1100, P04, 16/26, session/localhost3000/LAN/keeper/Edge; public đóng.
- Không reset/seed DB thật, đổi key/host/model, fallback vendor, nguồn dữ liệu song song hoặc push/merge.
- Secret canonical `/home/galaxy_os/.runtime/ai-providers.env`; JSON canonical giữ metadata và tham chiếu nguồn secret rõ ràng. Backup ngoài Git, owner/mode0600.
- Loader backend đọc env chuyên biệt; không shell source/eval, không đưa key vào process Web/build hoặc systemd manager. Định dạng mỗi dòng KEY=JSON_STRING, kiểm parser riêng; không gọi đó là systemd/dotenv syntax.
- Mode env không fallback JSON hoặc biến GOOGLE_API_KEY. CLI và API dùng cùng resolver. Env mới thiếu/rỗng/sai phải chặn đúng provider.
- Policy pilot vẫn synthetic/public-approved; ai.invoke và cờ client không cấp egress. Nội dung tự nhập cũng cần phê duyệt server có thẩm quyền; không coi mode GENERAL là bộ lọc nội dung nhạy cảm.
- Hai chế độ dùng cùng domain; đổi mode bắt đầu ngữ cảnh sạch, giữ hội thoại cũ. Model switch giữ hội thoại và kiểm lại quyền đích.
- Tối đa3 outbound/lượt; deadline90s chung; chỉ adapter sở hữu retry. Retry phải kiểm lại quyền, không retry quota dài hạn hoặc subtype429 chưa rõ. Không giới hạn lượt/ngày mới.
- Không claim live từ mock; provider vendor chưa đạt ghi DEGRADED/BLOCKED. Image/PDF giữ capability hiện có.

## Review Focus

1. Env ký tự đặc biệt, symlink/owner, conflict, missing key và rollback không làm thay credential hoặc khôi phục khóa thu hồi — Task1.
2. Retry-After dài hơn deadline, revoke trong backoff, cancel và double-submit không gửi thêm — Task2/3.
3. Lịch sử RAG lọt GENERAL hoặc đổi provider; nguồn bị thu hồi qua history/delivery/citation — Task3.
4. Admin chỉ duyệt trong Project và nguồn mình có quyền; metadata/audit không lộ secret hoặc tên nguồn cấm — Task3.
5. Live fixture dùng cùng pipeline, synthetic marker/citation version đúng, runtime chính không đổi datasource — Task4/5.

### Task 1: Resolver env và chuyển credential an toàn

**Files:** `scripts/configure-ai.py`, resolver secret dùng chung mới trong `scripts/`, `scripts/test_configure_ai.py`, `apps/api/src/project-chat/ai-registry.ts`, `ai-registry.test.ts`, `ai-activation.ts`.
**Interfaces:** Consumes store providers hiện hữu; produces root `credentialSource: { mode: 'env', path: absolutePath }`, resolver đọc key riêng có kiểm quyền, chẩn đoán chỉ metadata.

- [ ] Viết test env đặc biệt/invalid newline, no fallback, preserving revision/evidence, conflict không ghi đè, CLI/API cùng nguồn; chạy RED.
- [ ] Thêm parser/resolver dùng chung, writer atomic và lệnh stage migration; bảo toàn metadata/policy. Child metadata writer không nhận secret env.
- [ ] Chạy `python3 -m unittest discover -s scripts -p test_configure_ai.py` và `pnpm --filter @galaxy/api exec vitest run src/project-chat/ai-registry.test.ts`; Expected: PASS, chỉ fake credential.
- [ ] Commit đúng file Task1. Chưa chuyển active runtime cho đến khi artifact mới hiểu source mode.

### Task 2: Chẩn đoán vendor và retry hữu hạn

**Files:** `ai-provider.ts`, `ai-registry.ts`, `ai-multi-provider.test.ts`, `project-ai.service.ts`.
**Interfaces:** ProviderOptions bổ sung callback gate trước mỗi attempt; AiError giữ code nội bộ, status upstream và metadata sạch; không response body raw.

- [ ] RED cho503→success,3attempt max, Retry-After/deadline,429 quota/unknown, cancel/revoke trước retry; giữ model/credential.
- [ ] Phân loại code vendor có căn cứ, backoff+jitter trong deadline90s; log request_id/stage/provider/model/policy/outbound/status/config_version, không prompt/secret.
- [ ] Chạy `pnpm --filter @galaxy/api exec vitest run src/project-chat/ai-multi-provider.test.ts src/project-chat/ai-provider.test.ts`; Expected: PASS.
- [ ] Commit Task2; không gọi live để săn PASS.

### Task 3: Chat GENERAL, RAG và đường duyệt nguồn

**Files:** `ai-registry.ts`, `project-ai.service.ts`, `project-chat.dto.ts`, `project-chat.controller.ts`, `configure-ai.py`, `apps/web/features/project-chat/project-ai.tsx`, các tests hiện hữu.
**Interfaces:** Request metadata thêm mode GENERAL/PROJECT (legacy=PROJECT); settings/approval chỉ ACCESS_ADMIN. Approval xác định actor, thời gian, revision, Project, provider, nguồn/version hoặc nội dung chính xác; thu hồi không xóa source/history.

- [ ] RED integration: GENERAL không index/retrieve/metadata Project, không gửi lịch sử PROJECT; policy denied outbound0; caller không có ACCESS_ADMIN không tự approve.
- [ ] Tái dùng config writer + audit approval/revoke; lọc nguồn hợp lệ trước outbound, báo phạm vi; kiểm ở retrieval/dispatch/retry/delivery/cache/history.
- [ ] Hai lựa chọn mode và thông báo trạng thái tiếng Việt trong khung hiện có; không đổi bố cục. Giữ model/nháp và không auto resend.
- [ ] Test API fixture `m3-project-ai.integration.test.ts`, Web `project-ai.test.tsx`; Expected: PASS trên DB/storage/session cô lập, vendor mock.
- [ ] Commit Task3.

### Task 4: Fixture RAG và bằng chứng live

**Files:** Test fixture/browser hiện hữu và smoke riêng có opt-in; `ACTIVATION.md`, `../VERIFICATION.md`.
**Interfaces:** DB55435/Redis56382/API33001/Web33002 fixture hiện hữu; chỉ process live được phép đọc env secret, metadata approval riêng. Không copy DB thật.

- [ ] Tạo synthetic Rev03, PI Rev02 khác mã, bản cũ, nguồn khác Project/room; nghiệp vụ→index lexical→ask→citation.
- [ ] Chạy negative tests bằng mock: source/project/actor/revoke, quota/concurrency, model switch, cancel/idempotency. Xác định duy nhất bài API skip.
- [ ] Smoke nhỏ Kira sau env; live RAG/citation/câu nối tiếp/chat mới, Chrome mở đúng version. Gemini/Mistral mỗi provider một bộ smoke có retry hữu hạn; ghi subtype thật và blockers.
- [ ] Cross-model live chỉ khi provider thứ hai đủ điều kiện; không đổi sang mock rồi gọi live PASS.

### Task 5: Review, chuyển env và phát hành local

**Files:** Artifact/config ngoài Git, tài liệu `ACTIVATION/HANDOFF/VERIFICATION`, `05-IMPLEMENTATION-STATUS.md`, `PROJECT_STATUS.md`.

- [ ] Chạy hồi quy API/Web/Python phần liên quan, lint/typecheck/test/build/format; giữ blockers chính xác, không lặp chiến dịch clock/M2/database.
- [ ] Fresh review Astra/high: correctness/security/auth/UX và Ponytail diff; sửa Important bằng RED→GREEN.
- [ ] Backup riêng; stage env atomic, so sánh boolean; build artifact mới bằng pipeline hiện hữu. Cutover đúng systemd, không DB rollback.
- [ ] API effective source/revision sau restart; chỉ sau đó loại key khỏi active JSON. Lưu rollback code+source mode tương thích và backup0600, không tái dùng khóa thu hồi.
- [ ] Chrome/main health/LAN/Edge/session/popup regression; giữ9Project thật DENIED.
- [ ] Commit code đúng scope rồi docs kết quả thật; báo đủ trường user yêu cầu và SHA/tree/release, không push/merge.
