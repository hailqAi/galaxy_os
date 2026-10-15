# E02 — delta SIWC tools, Workspace deferred

**ID/version:** E02-SPEC-r1. **Time:** 2026-10-10T08:56:24+07:00.
**Status:** OWNER_APPROVED — “Duyệt E02-SPEC-r1”, phiên 2026-10-10. Bản được duyệt sha256 `77252373d22312013c0533fe91c2ad39c33e1e6bf85889ddf7da9e16885feaea`. **Execution:** Codex CLI trong phiên hiện tại, đã được owner chọn.
**Source:** [E02, toàn bộ 433 dòng](GALAXY_AI_E02_SIWC_TOOLS_ONLY_2026-10-10.txt) và chỉ đạo trực tiếp owner.
**Supersession:** chỉ thay hướng tiếp tục Workspace của E01; giữ P1/E01 approvals, dữ liệu, Create, memory và bằng chứng lịch sử. Đây là thiết kế delta đã được duyệt; approval thiết kế không thay bằng chứng implementation/acceptance.

## 1. Kết quả và phương án

Đích sớm nhất: người dùng yêu cầu báo giá nháp trong Project Chat, SIWC gọi công cụ Galaxy, lấy dữ liệu/ảnh tổng hợp được phép, tính Decimal, tạo XLSX/PDF thật và trả file còn tải được sau reload. DOCX nối cùng pipeline; Workspace không tham gia. Mọi kết quả mặc định AI_DRAFT, không phát hành hoặc phê duyệt nghiệp vụ.

Chọn **tái sử dụng source E01/r6 và domain hiện hữu**. Thay engine ngay bằng OfficeCLI làm tăng phụ thuộc trước khi có failure cụ thể; xóa sâu Workspace trước làm chậm Create và tăng rủi ro mất shared code. Hai phương án đó được hoãn. Không thêm chat, provider, memory, storage, queue hoặc artifact entity cạnh tranh.

Triển khai từng lát E02-0 → E02-1 → E02-2, sau đó E02-3/4/5/6. Phát hành từng lát khi đủ regression/browser/provider/artifact gates; không đợi image generation hoặc engine memory mới.

## 2. Baseline mới kiểm tại phiên này

- Root operational entry: `/home/galaxy_os`, branch `g00/build-test-isolation-20260914`, HEAD `1a59665854c99a1298f47a71c6852917eb2c8e7c`.
- Canonical product: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, CODE_SHA/base `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, có dirty/untracked work được giữ nguyên.
- Fresh `pnpm local:status`: READY, Web3000/API3001, `local-651479a7e9ce`, schema90/pending0. API PID5073/Web PID5420 tại immutable artifact `e01-t1-p1-b-20261009-r3`.
- Fresh `pnpm prod:verify-artifacts`: ARTIFACTS_VERIFIED. Deployed TESTED_TREE lịch sử `502db7d7c12415ff642400589d57994e04c2719e`; không dùng làm tree của E02 chưa triển khai.
- `m3-isolated.env.example` isolation check PASS về cấu hình; chưa chứng minh PostgreSQL55435 chạy được. R18 reserved-port failure là báo cáo lịch sử cần reproduce.
- Browser MCP hiện báo không tìm thấy Chrome executable. Chưa browser/provider live mới, không suy từ 37 lượt hoặc2120 tests lịch sử.

## 3. Dependency map trước cleanup

Paths trong bảng tính từ canonical; callers đã đọc bằng rg và source. Không phân loại theo từ khóa đơn lẻ.

| Nhóm                        | Source/callers                                                                                                                                                        | Xử lý E02                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Workspace provider      | `project-ai-workspace.service.ts`: prepare/models/prepareAuto/retry/tick; `workspace-agent-api.ts`: trigger/poll; `workspace-connector-auth.ts`; Workspace controller | Chặn dispatch/poll/retry mới và fallback sang Workspace trên backend, không chỉ UI. Giữ lịch sử/view/cancel và identity checks. Không claim remote cancel. |
| A — Workspace configuration | `settings/workspace-agent.service.ts`, DTO/controller, `features/settings/workspace-agents.tsx`, settings/consent routes                                              | Hiển thị WORKSPACE_DEFERRED_BY_USER, không render credential form trong luồng chat. Không xóa encrypted credential/config/table.                           |
| B — shared orchestration    | `ProjectAiService`, `ChatAiAnswer`, tool registry/runner, source proofs, FilesService/upload, FileStorage                                                             | Giữ; hạ tầng dùng chung tiếp tục nhận SIWC/local jobs, progress/cancel/result persistence.                                                                 |
| C — SIWC/File/Draft         | `ai-chatgpt-plan.ts`, `ai-tools.ts`, `ai-document.ts`, `ai-native-source.ts`, SIWC connection/capability services                                                     | Giữ13 SIWC tool names đã có, bao gồm create_document/revise_draft; chỉ quảng cáo executor READY.                                                           |
| C — UI/memory               | `project-ai.tsx`, memory/history services, file cards/download, local presentation='workspace'                                                                        | Giữ bố cục workspace local, Create, nguồn, ảnh, Markdown, memory. Chỉ bỏ lựa chọn provider Workspace và catalog/config requests dành riêng provider.       |
| A — persisted state         | Workspace jobs/grants/config và migrations schema90                                                                                                                   | Dormant; kiểm active jobs trước release, giữ audit/data. Không drop/rollback/reset DB.                                                                     |

Cleanup sâu A không thuộc critical path. Một env cũ `FEATURE_WORKSPACE_AGENTS=true` không được tự khôi phục dispatch đã deferred. AUTO chỉ dùng SIWC và báo capability không hỗ trợ rõ; không chuyển model hoặc route ngầm. Retry của job Workspace cũ bị chặn; view/cancel có ACL vẫn tồn tại.

## 4. E02-1: catalog, effort, context và tool loop

Giữ catalog account-specific qua connection generation hiện hữu, chỉ visibility=list theo [SIWC models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). Không hardcode bảy model hoặc lọc Showroom/Workspace. Model thiếu capability hiện lý do; không selectable giả rồi fallback.

Mở **kiểm chứng giá trị max**, không gán max=xhigh. Phải cập nhật cùng chuỗi capability input/UI, question DTO, SIWC pin schema, adapter payload và tests; composer chỉ cho chọn sau capability receipt chấp nhận đúng model/connection. Không bật max cho mọi model bằng một cờ. Retry/summary/tool rounds dùng pin cố định; metadata ghi requested/sent/observed model/effort và accepted/evidence, observed=null khi thiếu provider telemetry. Không dùng lời model tự nhận.

Reuse `runChatGpt`, namespace tools và createToolRunner; giữ call_id, toàn bộ continuation cần thiết, validate complete arguments/output, recheck actor/Project/source trước execution/reinjection/storage. Giữ bound số calls/rounds/thời gian minh bạch và nhiều call trong một round; lỗi partial không ghi REQUEST_FULFILLED. Không cho arbitrary shell/code.

Giữ question nguyên văn, P1 history/summary/retrieval/current ACL. Profile tokenizer/context UNVERIFIED vẫn là ngoại lệ owner đã duyệt; không liên quan revoke/OAuth credential. Guards bytes/records là transport guards, không là token capacity. Không cắt lại8lượt hoặc gửi Project vô hạn.

[SIWC limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) đã mở lại: store=false/stream=true, HTTP input context, namespace function tools; không dùng hosted image/file-search/interpreter/MCP/tool-search/Files-upload API từ ví dụ API-key.

## 5. E02-2: Create văn phòng đầu tiên

Reuse documentInput v1, renderDocument (ExcelJS/PDFKit/OOXML), draftTool, FilesService.upload, file metadata/download ACL, source index và answer usage.artifacts. Contract v1 giữ numeric strings/no formula, định dạng docx/pdf/xlsx và giới hạn đã có; không âm thầm mở workbook calculation hoặc file10GB qua Buffer.

Fixture báo giá có nhãn tổng hợp: mã dài/text, số lượng/đơn giá/thuế, Decimal tổng, một ảnh PNG/JPEG thuộc đúng Project. Cùng dữ liệu có version cho XLSX và PDF; mở workbook và đọc PDF/ảnh độc lập để kiểm số/tổng/nguồn. Thiếu giá phải đánh dấu thiếu. Không sửa catalogue/customer/business records để tạo fixture.

Kết quả chỉ READY sau bytes/storage/hash/MIME/validator; preview dùng derivation an toàn hiện hữu. PDF có Poppler read/render check; DOCX phải mở/render lại, không chỉ kiểm extension; thiếu renderer là blocker riêng. Artifact card dùng backend download route thực; reload/revoke/restart có test. Idempotency answer/tool key giữ, revise tạo revision mới, original giữ nguyên.

`revise_draft` bổ sung expectedVersion khi mở edit theo E02-4 bằng extension tương thích và test conflict; không bỏ bảo vệ version. Multisheet/formula/calculation/PPTX là capability mở rộng phải có contract version và executor riêng trong registry hiện hữu, không tạo provider/tool engine thứ hai.

## 6. Các lát tiếp theo và ranh giới

- **E02-3 web:** giữ r6 privacy fence; native web chỉ chạy trong public-query phase tách khỏi actor/Project/private memory/history/tools. Query được xét theo egress policy, không mặc định model tự soạn query là đã sanitize. Private synthesis dùng kết quả/citations như untrusted data và cùng pinned model/effort. Reuse publicTarget/fetchPublicPage SSRF/DNS/redirect/size checks; PROJECT_ONLY không outbound. Không bật Tavily/keyed provider paused. P2 spec hiện hữu được dùng làm nguồn thiết kế, chưa tự nhận written approval.
- **E02-3 input:** reuse upload/source/parser/retrieval, original/hash/version, bounded PDF page/XLSX range/image vision; coverage ORIGINAL/DERIVATIVE/EXCERPTS rõ, không nói đọc toàn khi chưa đủ.
- **E02-4 Office/PPT:** thử OfficeCLI/PPT Master trước, PptxGenJS upstream khi gap thật. Native editable text/shapes/charts, slide render/layout, revise CAS; không fake PPT bằng slide ảnh. v1 không đổi ý nghĩa.
- **E02-5 large file:** reuse UploadSession/chunk/hash/lease/quota/cancel/cleanup, nối conversation attachment/promote theo ACL; limit10000000000bytes, streams ngoài RAM/DB binary. P3 written spec và retention policy là gate riêng; không tự xóa working/customer source hoặc tuyên bố10GB live từ boundary mock.
- **E02-6 image/memory:** generative image NOT_READY đến khi có engine/weights/resources/license/workflow proof. Local crop/compose có nhãn riêng; không bật paid image fallback. Giữ P1-B; engine memory ngoài chỉ benchmark khi thiếu sót đo được, không thay truth.

Các latch sau cần contract chi tiết/plan gắn source và executor trước triển khai; approval thiết kế này không duyệt retention delete, business publish, mua credits hoặc cài stack/model chưa review.

## 7. Verification, release và rollback

TDD focused cho changed callers, guards, max rejection/acceptance, many-tools, original question, draft idempotency/ACL/version. Negative dependency: Workspace OFF và trigger/poll spy không được gọi trong khi SIWC Create/memory chạy. Test fixture chỉ dùng isolated identity `galaxy_os_g00_20260930m3`; không dùng main làm test DB.

Chạy focused rồi năm lệnh repo lint/typecheck/test/build/format:check trên final source, serial resource-heavy jobs; dùng private PDF binary/library env đã có. Không gọi isolated runner `run`/`down` vì có lifecycle/cleanup; đọc/check và reuse fixture giữ data. Host-port/browser blocker phải có evidence và được xử lý đúng phạm vi.

Independent review + Ponytail lean/correctness/security/authorization/UX, backup restore/compatibility, immutable candidate, exact candidate browser/provider/artifact acceptance trước main cutover. User đã cho phép phát hành khi đủ gate. Rollback app về r3 schema90-compatible, giữ file/memory/history/jobs; không rollback/reset data. CODE_SHA, TESTED_TREE mới, source digest và deployed identity báo riêng.

## 8. Gate còn thiếu và self-review

P1 và phần E01 còn phù hợp dùng approvals cũ. **Gate mới đã đạt:** owner duyệt E02-SPEC-r1 và E02-PLAN-r1 trực tiếp trong phiên; triển khai inline Codex CLI đã chọn. Không hỏi lại hai gate này. Chưa có approval cho artifact mới chỉ từ mục tiêu IMPLEMENT_AND_VERIFY. Không hỏi lại mục tiêu, P1, Workspace entitlement hoặc execution method.

Self-review: dependency A/B/C được map từ callers; không có code deletion/destroying migration; v1/precision/private-shared/ACL invariants giữ; native web privacy không được nới vì Workspace deferred; unsupported MAX không bị đổi nhãn/fallback. Test/live/release evidence tách; scope từng lát và blocker thực có chỗ ghi. Đây không phải báo cáo đã hoàn tất E02.
