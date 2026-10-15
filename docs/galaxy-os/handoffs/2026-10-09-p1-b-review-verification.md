# P1-A đang phục vụ; P1-B đã triển khai và kiểm thử, chưa phát hành

Ngày 09/10/2026. Owner đã duyệt spec và implementation plan P1 revision 1, thực thi Codex CLI trong phiên hiện tại. Không hỏi lại phê duyệt P1. Task 1–3 đã phát hành P1-A; Task 4–8 đã triển khai P1-B. Task 9 đang thực hiện, **chưa hoàn thành** vì còn gate token-profile, candidate/main live, migration và cutover. P2 chỉ có written spec chờ duyệt; P3 chưa triển khai.

## 1. Chức năng người dùng có thể dùng ngay

Main tại **http://localhost:3000** đang phục vụ P1-A `local-62edbe7afe76`, API/Web READY, schema86. Đăng nhập Galaxy owner ở **http://localhost:3000/login**; không cần reconnect ChatGPT. Chrome Windows thật đã kiểm lại trang login200, ô Email/Mật khẩu và nút Đăng nhập hiện. Session của các tab Galaxy hiện trả401, nên chưa thể làm bài inference mới bằng phiên đó.

P1-A bỏ điều kiện pilot chỉ Showroom, giữ Galaxy INVOKE và provider entitlement. Owner đã nhận năm câu trả lời OpenAI thật tại Showroom, Ecopark và Quận7; selected/returned model đều `gpt-6-luna`, terminal `response.completed`. Reload/two tabs/chuyển Project đã kiểm. Owner có quyền cả9Project; negative actor được kiểm bằng backend fixture thật, không giả tạo session/grant trên main. [Handoff P1-A](2026-10-09-p1-a-live-release.md) giữ trace và bằng chứng phát hành chi tiết.

**Giao diện Memory P1-B chưa xuất hiện trên cổng3000** vì candidate chưa được phát hành. Không dùng build của worktree/fixture làm bằng chứng runtime main có Memory.

## 2. Source và artifact

| Thành phần                 | Giá trị                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| Worktree / branch          | `/home/galaxy_os/.worktrees/m2-a-20260928` / `m2/project-chat-20260928` |
| CODE_SHA                   | `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, source chưa commit          |
| Main artifact              | `/home/galaxy_os/.runtime/releases/p1-a-20261009-r2`                    |
| Main release / schema      | `local-62edbe7afe76` / 86, READY                                        |
| Main TESTED_TREE           | `8da5fdb2d7dc9ffc4708ea550bfaf98e29d89968`                              |
| Main source SHA256         | `62edbe7afe76209597fdb4bcfdee914f764d8c1db930a6efa698eb9b076a84e7`      |
| Main source archive SHA256 | `a89631dd57821265d59c61373fb65654a56562a54c02f33783315c71abe3c694`      |
| Main Web build             | `nCCqjnBGuxfrylb9fIPkT`                                                 |
| P1-B candidate artifact    | `/home/galaxy_os/.runtime/releases/p1-b-20261009-r1`                    |
| P1-B candidate release     | `local-0397d1fe9b05`, BUILT, chưa phục vụ main                          |
| P1-B TESTED_TREE           | `4268ce84f959b3bfe04aaef8a4f79da49177f421`                              |
| P1-B source SHA256         | `0397d1fe9b057a57d07eeae8b9e7d91db2209f208d22e265b5843df30c188219`      |
| P1-B source archive SHA256 | `e65586e8214f507a1e062eabe0fe066f1f9d39b5edc01ca775455a086ab2ab7c`      |
| P1-B Web build             | `8L_63yaEIE-HvgMwIxPA7`                                                 |
| P1-B expected schema       | 88 PLANNED; schema88 đã kiểm ở fixture, main vẫn86                      |

P1-B snapshot có875file, hash đối chiếu với source trong artifact sau build. Các cập nhật handoff/STATUS và spec P2 sau freeze là tài liệu ngoài snapshot đó; không tuyên bố toàn dirty worktree hiện tại chính là TESTED_TREE của candidate. Freeze dùng Git metadata đọc và tính blob/tree hash; không stage/commit hoặc đổi Git index/objects. Không reset/clean/stash/discard. Các thay đổi SIWC có trước P1 được bảo toàn.

Fresh readonly `pnpm local:status` xác nhận main API3001/Web3000 đều nằm trong artifact P1-A và READY/schema86. `pnpm prod:verify-artifacts` đạt ARTIFACTS_VERIFIED. Log tại `.superpowers/sdd/2026-10-09-p1-project-ai-memory/review-main-final-status.log` và `review-main-artifacts.log`.

## 3. Product code P1-B đã viết

Memory có tenant/Project/owner/visibility, immutable revisions, CAS/idempotency, provenance/source intersection, trạng thái, audit và inactivation. Private chỉ owner; shared cần quyền đọc/công bố tương ứng và xác nhận thao tác rõ ràng. AI summary luôn private/conversation/UNVERIFIED, không là quyết định nghiệp vụ đã duyệt.

Backend kiểm scope/source/version ở CRUD, search, tool execution, reinjection, answer delivery và citation. Composite scope FK/SQL constraints và source DAG có giới hạn bảo vệ isolation; không có global memory/cache/vector index hoặc worker framework mới. Summary dùng lease/CAS của answer hiện hữu, không giữ Project lock qua network.

History bỏ giới hạn cứng8lượt: giữ whole recent pairs, summary có nguồn và retrieval theo scope, kiểm toàn wire mỗi continuation. Model profile chưa xác minh vẫn null/UNVERIFIED; byte/item guard không được gọi là token budget đã đo. Receipt và UI báo PARTIAL khi phần lịch sử có quyền không vào context. Ba read tools mới thực thi memory search/read và conversation history qua backend, trả matched call_id; citation dùng server-bound handles và kiểm nguồn hiện hành.

UI có private/shared, tìm/xem/sửa/version/nguồn/inactive, lưu câu trả lời vào private note, preview rõ trước shared create/edit, giữ draft khi CAS conflict, abort/scope guard khi đổi actor/Project/conversation. Không dùng frontend làm authorization.

31 product files khác immutable P1-A, theo `.runtime/p1-b-20261009/final/product-changes.json`:

- `apps/api/prisma/schema.prisma` và hai migration `20261008202538_p1_project_ai_memory/migration.sql`, `20261008204500_p1_memory_required_metadata/migration.sql`.
- `apps/api/src/audit/audit.service.ts`.
- `apps/api/src/project-chat/ai-chatgpt-plan.ts`, `ai-chatgpt-plan.test.ts`, `ai-chatgpt-service.test.ts`, `ai-history.ts`, `ai-history.test.ts`, `ai-openrouter-service.test.ts`.
- `apps/api/src/project-chat/ai-registry.ts`, `ai-registry.test.ts`, `ai-tools.ts`, `ai-tools.test.ts`.
- `apps/api/src/project-chat/project-ai-history.service.ts`, `project-ai-history.service.test.ts`, `project-ai-memory.service.ts`, `project-ai-memory.service.test.ts`, `project-ai.service.ts`.
- `apps/api/src/project-chat/project-chat.controller.ts`, `project-chat.dto.ts`, `project-chat.module.ts`.
- `apps/api/src/settings/settings.service.ts`, `chatgpt-connection.test.ts`: capability presentation/tests; **connection lifecycle implementation không đổi trong P1-B**.
- `apps/api/test/p1-project-ai.integration.test.ts`, `p1-project-memory.integration.test.ts`.
- `apps/web/features/project-chat/project-ai-memory.tsx`, `project-ai-memory.test.tsx`, `project-ai.tsx`, `project-ai.test.tsx`.
- `apps/web/tests/browser/p1-project-ai.spec.ts`.

Không có dependency mới. Không sửa OAuth/callback/registration/token exchange/refresh, entitlement staff, provider paused, network/Edge/domain hoặc nghiệp vụ ngoài phạm vi.

## 4. Review và sửa lỗi bằng TDD

Một lượt independent whole-P1-B review trước Task9 release, so với immutable P1-A: 0 Critical, 5 Important code findings và 1 Important release gate. Thực hiện một lượt sửa có failing regression; không lặp review hoặc tạo candidate mới cho cùng diff.

| Nguyên nhân                                                                         | Sửa và bằng chứng                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail GET đến muộn có thể đưa note cũ vào draft mới                                | Invalidate read generation khi edit/new; Chrome tái hiện wrong PATCH, sau sửa POST201 tạo note mới và revision cũ không đổi                                       |
| Private note từ answer dùng summary bị404 vì source resolver thiếu conversation gốc | Resolve summary qua owned answer conversation/provenance thực; direct summary vẫn bound current conversation; real DB kiểm nguồn khác Project/owner bị chặn       |
| Summary vượt envelope làm originals bị loại sớm                                     | Assembler chỉ loại original khi summary đã admitted; regression14summary lớn giữ original hoặc ghi omitted đúng                                                   |
| Receipt/UI không báo lịch sử bị thiếu                                               | Persist COMPLETE/PARTIAL từ actual assembly; view/UI thông báo PARTIAL, không lộ IDs/count của dữ liệu denied                                                     |
| Tab visibility refresh làm mất draft                                                | Suspend protected UI khi auth refresh, giữ draft trong lifetime đúng scope và recheck current auth/source trước hiện lại; Chrome hidden/visible giữ unsaved draft |

RED logs: `review-history-red.log`, `review-summary-note-red.log`, `review-notice-red.log`, `review-completeness-red.log`, `review-browser-red.log` trong ledger directory. GREEN và full checks bên dưới chạy sau các sửa này. Reviewer không thực hiện main migration/live, backup/cutover hoặc token calibration; executor không dùng review thay các gate đó.

## 5. Verification mới trên source P1-B

Log directory: `.superpowers/sdd/2026-10-09-p1-project-ai-memory/`.

| Kiểm tra                                      | Kết quả / bằng chứng                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Focused backend units                         | PASS62; `review-backend-green.log`                                                    |
| Focused Web units                             | PASS35; `review-web-green.log`                                                        |
| PostgreSQL/IAM integration                    | PASS32 = Memory28 + cross-Project AI4; `review-db-green.log`                          |
| Chrome fixture browser                        | PASS5; `review-browser-green.log`                                                     |
| Full regression một lượt                      | PASS2110 = API1526 + Web578 + Edge5 + document-service1; `review-full-regression.log` |
| Lint / typecheck                              | PASS; `review-lint-green.log`, `review-typecheck.log`                                 |
| Build worktree / final Web / frozen candidate | PASS; `review-build.log`, `review-web-final-build.log`, `review-candidate-build.log`  |
| Format / diff                                 | PASS; `review-format.log`, fresh final `review-final-doc-checks.log`                  |
| Prisma validate/generate/status               | PASS trên fixture88; `review-prisma.log`; không deploy main                           |

Chrome fixture dùng Chrome for Testing155 sandbox enabled, production Web33002/Nest33001 và PostgreSQL/IAM thật ở fixture đã có. Bao gồm private/shared preview, source denial/revocation, version/CAS, reload, two Project tabs/late stream, mobile375/keyboard và hai regression draft mới. Provider fixture synthetic; **không phải OpenAI live hoặc nghiệm thu immutable candidate/main P1-B**. Không reset DB/stack để chạy tests; không chạy nhiều full suites song song.

P1-A OpenAI live từ main có5response.completed/6rounds, đúng model. P1-B OpenAI live, summary live và ba tools live **NOT_RUN**; native search cũng NOT_RUN, không được dùng function schema/unit mocks làm live evidence.

## 6. Gate token profile và quyết định riêng đang chờ

Spec P1 mục8.1 yêu cầu: “Implementation phải thu được profile/budget evidence cho model dùng trong nghiệm thu P1-B”. Plan Task6 ghi missing profile/live là blocker. Review xác nhận byte/item guard và một số lượt completed không đủ chứng minh token capacity.

Probe account thật: GET `/v1/models`200 trả7model/context_window272000, không tokenizer/output-reserve; POST `/v1/responses/input_tokens`401 `hardened_oauth_rule_missing`, request ID `req_819a160427e04092b307df6bc6b83c49`. Chỉ một lần với synthetic public input, không retry/refresh/đổi credential/provider; encrypted connection hash không đổi. Evidence private `.runtime/p1-b-20261009/capability-probe.json`.

[Addendum P1-B revision1](../../superpowers/specs/2026-10-09-p1-b-unverified-budget-release-addendum.md) đã trình owner, **PENDING OWNER APPROVAL**. Chỉ đề nghị cho nghiệm thu/phát hành với token profile UNVERIFIED; mọi security/backup/browser/real OpenAI/migration/rollback gate giữ nguyên. Không thay approved spec/plan hoặc tự diễn giải approval P1 thành approval ngoại lệ.

Rủi ro nếu ngoại lệ được duyệt: request dài có thể bị provider từ chối dù hợp lệ trong codec256000byte/64item; không chứng nhận đầy đủ context capacity của7model. Nếu không duyệt, main giữ P1-A và P1-B không migration/cutover cho tới khi profile có bằng chứng hợp lệ. Im lặng không phải approval.

## 7. Backup, migration rehearsal và rollback đã chuẩn bị

Private evidence: `/home/galaxy_os/.runtime/p1-b-20261009/backup-preparation/`. Fresh main dump1444950byte, SHA256 `6576afa4ae454980059b1b217c47a51586c22e53efe75ad3431f166ad2ba5f3b`; manifest/API-Web user units đã backup. Host thiếu pg_restore nên dùng binary trong container hiện hữu chỉ đọc dump, không restore vào main.

Restore toàn backup vào private schema `p1b_backup_rehearsal_20261009` của fixture DB hiện hữu:230COPYtables/11445rows, row counts/payload hashes đúng backup. Sau đó áp dụng hai migration SQL thật trong namespace này;27.022s,230table nghiệp vụ/rows/hashes không đổi. Đây là restore/migration rehearsal cô lập, không main migration. Không reset/delete hoặc thêm database/stack.

Migration SHA256 đã review:

- `20261008202538_p1_project_ai_memory`: `7804c566b26fa24479a988978e05ec8c670d04a1e2b5017b8e89842675b09547`.
- `20261008204500_p1_memory_required_metadata`: `a76b138bde65eb955113f7014a7b7991e56384565d7e64483386d7dce2654a74`.

Hai migration additive; SQL lock timeout/transaction và required metadata guard được kiểm. Không rewrite applied migration. Main schema86 chưa bị đổi; baseline86migration checksums trong candidate khớp main.

`final/p1-a-fallback-schema88.template.json` và `planned-schema88-build-manifest.json` chỉ là template/planned evidence, **chưa installed**. Sau main migration phải đối chiếu actualschema88 rồi mới kích hoạt manifest tương thích. Rollback B về A phải giữ additive schema88/data mới, không dùng manifest86/drop bảng/restore DB để lùi app. Main migration/compatibility readiness/candidate owner live/cutover còn NOT_RUN.

## 8. Trạng thái nghiệm thu

Trạng thái chính là nghiệm thu runtime/chức năng yêu cầu, không thay bằng fixture PASS.

| Trạng thái          | Kết quả | Phạm vi bằng chứng                                                                      |
| ------------------- | ------- | --------------------------------------------------------------------------------------- |
| P1_PROJECT_AI       | PASS    | Main P1-A3Project/5completed; denied actor backend fixture                              |
| P1_PRIVATE_MEMORY   | BLOCKED | CRUD/source/version fixture PASS; chưa main/candidate OpenAI live, token gate pending   |
| P1_SHARED_MEMORY    | BLOCKED | Explicit publication/ACL fixture PASS; chưa main/candidate live                         |
| P1_MEMORY_ISOLATION | BLOCKED | Backend32/browser5 fixture PASS; main B acceptance chưa chạy                            |
| P2_GENERAL_QA       | NOT_RUN | P1-A SQL JOIN live có bằng chứng; chưa benchmark P2                                     |
| P2_CONTEXT          | NOT_RUN | P1 context/history source kiểm riêng; chưa P2 acceptance                                |
| P2_TOOLS            | NOT_RUN | P1 task_list live;3Memory/history tools fixture, chưa P2 tools live                     |
| P2_WEB_SEARCH       | NOT_RUN | Native/fallback chưa probe/implementation P2                                            |
| P2_CITATIONS        | NOT_RUN | P1 Project handles fixture; Internet citations chưa live                                |
| P3_UPLOAD           | NOT_RUN | Chưa nối uploader resumable vào SIWC chat                                               |
| P3_FILE_PARSING     | NOT_RUN | Không lấy parser cũ làm P3 nghiệm thu                                                   |
| P3_AI_RETRIEVAL     | NOT_RUN | SIWC file pipeline chưa triển khai/real AI đọc file                                     |
| P3_10GB_LIMIT       | NOT_RUN | Chưa bật/nghiệm thu10.000.000.000byte; disk/RAM precheck không là PASS                  |
| REGRESSION          | PASS    | P1-B source full2110/static/build; fixture, không OpenAI live                           |
| SECURITY_ACL        | PASS    | Current source real PostgreSQL/IAM integration + Chrome fixture; main B riêng chưa chạy |
| DEPLOYED_RUNTIME    | PASS    | Main P1-A READY/schema86; B candidate chưa phát hành                                    |

MODEL_TOKEN_PROFILE: BLOCKED/UNVERIFIED. PROJECT_WEB_COMBINATION, FILE_AI_READ_LIVE và LARGE_FILE_10GB: NOT_RUN. Không báo hoàn thành P1-B/P2/P3 hoặc “như100%ChatGPT”.

## 9. Điểm tiếp tục

Không lặp discovery/review/plan P1. Owner đăng nhập Galaxy bình thường ở `/login`; không yêu cầu mật khẩu/token hoặc reconnect ChatGPT. Quyết định mới duy nhất của P1-B là addendum token-profile cụ thể đã trình. Khi được duyệt, tiếp tục Task9 bằng fresh backup nếu dữ liệu đổi, environment/compatibility gate, actual main migration, candidate browser/OpenAI X/Y/private/shared/>8turn/summary/3tools/citations, rồi cutover/verify. Không đổi OAuth/network để vượt blocker.

[Written spec P2 revision1](../../superpowers/specs/2026-10-09-p2-general-ai-web-design.md) đã hoàn thiện và tự review, được trình một lần cho written-spec gate. Chưa được duyệt; chưa viết plan/code P2. Spec nêu exact model/read tools, public search phase cách ly dữ liệu riêng, native capability probe/fallback công khai hợp lệ, SSRF/citations/UI/benchmark và rollback. Native/fallback endpoint availability chưa chứng minh phải ghi BLOCKED khi không có đường hợp lệ; không kích hoạt paused/keyed provider. Sau spec approval mới viết plan đầy đủ theo gate, không dùng spec chưa duyệt để sửa code.

[Written spec P3 revision1](../../superpowers/specs/2026-10-09-p3-chat-files-design.md) đã hoàn thiện/self-review và được trình tại written-spec gate: conversation target trên UploadSession hiện hữu, streaming/resume/quota/resource, scoped chunk index/extraction/vision/citation và rollout10GB sau full-transfer evidence. Chưa được duyệt; chưa plan/code/migration P3. Giữ P1-A chạy trong lúc các gate độc lập còn chờ. Không commit/tag/push/PR hoặc chỉnh AGENTS.md. Handoff/STATUS cập nhật kết quả thật; các checkpoint cũ là lịch sử.
