# Năm PDF P04 và công cụ AI theo Project — kế hoạch INLINE

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Một người ghi source; reviewer độc lập cuối đợt. Các bước dùng checkbox.

**Goal:** Áp năm PDF mới, giữ chat thống nhất, hoàn thiện file/bộ nhớ/công cụ và phát hành local với bằng chứng riêng từng tầng.

**Architecture:** Tái sử dụng ProjectAi, AiSurfaceProvider, ProjectChat, ProjectAiService, registry OpenRouter và FileAsset. Layout đổi vị trí hiển thị của cùng controller; công cụ chạy backend theo scope actor/Project cố định, kết quả có provenance; không thêm agent framework hoặc kho nhớ khác.

**Tech Stack:** Next.js/React/TypeScript/CSS, NestJS/Prisma/PostgreSQL, ExcelJS, Poppler local và các thư viện đã cài.

**Spec:** Brief chủ dự án trong phiên ngày 06/10/2026, “TRIỂN KHAI ĐÚNG 5 PDF FIGMA MỚI”; manifest và ngoại lệ tại `docs/galaxy-os/milestones/M3/ui-figma/FIVE-PDFS-20261006.md`. Charter/access canonical giữ nguyên.

## Global Constraints

- Tiếng Việt; body chat16/26; popup560/1100; mobile375. Năm PDF là chuẩn chính, Figma bổ sung.
- Không reset/clean/stash, không sửa AGENTS hoặc migration đã áp dụng. Chỉ commit local paths đúng scope; không push/merge.
- Không GENERAL/PROJECT selector, approve/revoke input, synthetic checkbox hoặc cấu hình provider trong composer.
- Project-only enforced trước payload; giữ tenant/actor/room/source/version/field ACL và revoke. Không tự duyệt/phát hành nghiệp vụ.
- OpenRouter FREE_ONLY/privacy giữ. API trả phí chỉ contract/mock cho tới có cấu hình và ngân sách được bật. Không thêm env key tự động.
- Test destructive/fixture chỉ DB cô lập; main chỉ file/chat nhỏ private trong Project đã chọn. Giữ session/runtime/Edge/keeper/public đóng.
- CODE_SHA/TESTED_SHA là Git commit thật, TESTED_TREE tách snapshot. Từng tầng code/mock/vendor/main/mobile có evidence riêng.

## Review Focus

1. Đổi Project hoặc room khi request/upload đến muộn: không lộ answer/attachment tại Project mới (T1/T2 browser).
2. Source revoke sau tool trước delivery/download: derived output không tiếp tục tiết lộ (T2/T4 integration).
3. URL redirect/DNS thay đổi và query có dữ liệu riêng: chặn egress trước request (T3 unit).
4. Model tool arguments/schema vượt ngân sách hoặc lặp tạo artifact: reject/idempotency/cancel đúng (T3/T4 integration).
5. XLSX cached formula, DOCX hình/zip bomb, PDFscan nhiều trang và thiếu capability: giới hạn thật, trạng thái đúng (T2 file tests).

### Task 0: Bảo toàn baseline

**Files:** 33 paths trong receipt `.runtime/five-pdfs-20261006/baseline.json`; không stage tự động file khác.
**Interfaces:** Consumes dirty tree + runtime manifest. Produces checkpoint Git SHA và nguồn chuẩn cho các task sau.

- [x] Đọc status/HEAD/branch, handoff, process; so byte code/test/migration với artifact r3.
- [x] Fresh `pnpm test` với env fixture, lint/typecheck/format cần thiết; Expected: PASS hoặc blocker ghi đúng.
- [x] Review độc lập/Ponytail, quét secret/path; commit checkpoint chỉ 33 paths trong receipt.

### Task 1: Năm màn PDF, một controller AI

**Files:** `apps/web/features/project-chat/{project-ai,project-ai-surfaces,project-ai-workspace,project-chat}.tsx`, `apps/web/app/globals.css`, tests tương ứng và `apps/web/tests/browser/m3-unified-ai.spec.ts`.
**Interfaces:** Consumes `/project-chat/projects/:id/{rooms,ai}` và conversation/answer/source hiện có. Produces layout workspace giữa/phải, direct có Project selector trái; popup giữ controller/history.

- [x] RED browser: empty CTA tạo AI không room; chọn AI nằm giữa; một composer; sidebar lịch sử bên phải; popup↔page không dispatch mới; room không tự nhận answer.
- [x] Chuyển bố cục/presentation, dùng native controls và font/token/asset hiện có; model/nguồn/history dữ liệu thật; loading/error/capability/read-only conditional.
- [x] GREEN focused UI/browser; side-by-side từng PDF, mobile375, nội dung dài/reflow tương đương200%/focus (keyboard thiết bị thật chờ nghiệm thu). Expected: không tràn trang, send tiếp cận được, controls pilot vắng.
- [x] Commit scoped UI/manifest sau kiểm.

### Task 2: Bộ nhớ, PNG/JPG, DOCX/XLSX và scan PDF

**Files:** `apps/api/src/project-chat/{ai-native-source,ai-source,project-ai.service}.ts`, `apps/api/src/files/project-file.ts`, tests native/integration/browser.
**Interfaces:** Consumes authorized FileAsset/version bytes; produces bounded text/page/sheet/cell/image source context trên index/lifecycle hiện có.

- [x] RED file tests DOCX paragraphs/headings/tables/images, zip/macro/external link, PDFscan bounded pages; giữ PDFtext hiện có.
- [x] Implement extractor bằng dependency hiện có; images lấy bytes authorized; trạng thái partial/unsupported rõ.
- [x] GREEN memory A/B/newchat/private/revoke/injection/version-order; composer Chrome fixture ảnh/DOCX/XLSX và PDFscan riêng. Vendor/main chuyển T6 sau artifact cutover. Expected: nội dung và locator đúng, original download giữ bytes.
- [x] Commit scoped file/memory.

### Task 3: Công cụ và web

**Files:** `apps/api/src/project-chat/ai-tools.ts`, `ai-tools.test.ts`, `ai-provider.ts`, `project-ai.service.ts`, registry hiện có và integration tests.
**Interfaces:** Tool arguments không nhận Project/actor; handler nhận scope backend. Result mang provenance, cost class, status và giới hạn; provider loop dùng existing request/cancel/idempotency.

- [x] RED tests schema/call budget/cancel, scoped source read/search, Decimal calculate, field permission, public query và SSRF/redirect/rebinding/size/MIME/timeouts.
- [x] Nối tool loop OpenRouter theo capability thật; local tools miễn phí độc lập FREE_ONLY. Tavily Search một adapter disabled khi chưa cấu hình/budget; đọc trang bằng fetch HTTP local có kiểm SSRF, không cần thêm Extract trả phí. OpenAI Responses chuyển T5 cùng adapter image/audio, không bỏ phạm vi.
- [x] GREEN mock/local; live web chỉ khi configured/authorized. Expected: không fake web/citation, không raw SQL/shell/path/model scope override.
- [x] Commit scoped tools.

### Task 4: Artifact bản nháp thật

**Files:** reuse file/export services sau inventory, `ai-tools.ts`, `project-ai.service.ts`, UI answer file card và tests.
**Interfaces:** Consumes authorized input source versions/request owner; produces private FileAsset/version DOCX/PDF/XLSX, provenance và download có recheck.

- [x] RED real export/render/download/revision test: số đối soát Decimal, formula injection, revoke, idempotent retry, original signed version không đổi.
- [x] Reuse export engines; nháp/revision không phê duyệt, ghi source/request/audience bằng mechanism thật.
- [x] GREEN PDF render/extract tiếng Việt, DOCX OPC/extractor và XLSX workbook/bảng/ảnh/pagebreak, API/browser download đúng bytes. Word desktop chưa nghiệm thu. Commit scoped.

### Task 5: Image/audio capability

**Files:** adapter/registry công cụ hiện có từ T3, media output/input UI khi capability bật; tests.
**Interfaces:** Consumes capability/provider/budget admin; produces versioned AI media/transcript đúng conversation, không chat-model giả tính năng.

- [ ] RED mock capability off/cost denied; image source ACL/version, transcript Project, cancellation/idempotency.
- [ ] Dedicated OpenAI Responses/image/audio API contracts theo docs chính thức; disabled/live chỉ theo cấu hình thật; microphone explicit gesture/permission, secure-context reason trên HTTP LAN.
- [ ] GREEN local/mock; live thiếu cấu hình ghi NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET, không cản task khác. Commit scoped.

### Task 6: Hồi quy, review và release

**Files:** canonical STATUS/PROJECT_STATUS/handoff/manifest; pipeline artifact/systemd sẵn có.
**Interfaces:** Consumes tested commits/artifact; produces local release + exact CODE_SHA/TESTED_SHA/TESTED_TREE/DOCS_COMMIT_SHA.

- [ ] Full lint/typecheck/test/build/format + focused browser sau cuối code; Expected PASS, từng lỗi ghi riêng.
- [ ] Independent whole-branch correctness/ACL/egress/cost/UX/Ponytail review, xử lý RED→GREEN các blocker.
- [ ] Build artifact riêng, cutover qua pipeline hiện có; verify localhost và LAN hiện hành, main vendor/source/download, không paid fallback.
- [ ] Commit docs đúng bằng chứng; bàn giao capability matrix, sai khác PDF, phần live/mock/NOT_RUN và blockers thật.
