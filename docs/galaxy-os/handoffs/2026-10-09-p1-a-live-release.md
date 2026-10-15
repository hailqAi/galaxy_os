# P1-A đã phát hành; P1-B đang triển khai

Owner đã phê duyệt spec P1 revision 1 và implementation plan P1 revision 1, thực thi Codex CLI trong phiên hiện tại. Task 1–3 đã triển khai và phát hành; Task 4–9 tiếp tục theo approval đó. Không còn gate duyệt P1. Written spec/plan P2/P3 chưa được duyệt, chưa triển khai hai checkpoint đó.

## Chức năng sử dụng được

F5 tại `http://localhost:3000`, mở Project → AI. Owner đã kết nối có catalog/model/chat ở Project được Galaxy cấp INVOKE và quyền nguồn. Không reconnect ChatGPT khi chuyển Project. Main live đã xác minh Showroom Galaxy Centre, Biệt thự Ecopark và Quận 7. Fixture PostgreSQL/Chrome còn kiểm Project PLANNING không room, actor bị từ chối và entitlement staff.

Nguyên nhân: predicate `chatGptProjectAllowed()` đọc allowlist pilot Showroom tại catalog/ask/view/run. Đã bỏ đúng bốn call sites; giữ `authorized()`, Project/actor/source ACL và `ChatGptConnectionService.owner()`. API ask trả 409 cho entitlement AiError của staff thay vì 500; không mở quyền inference staff.

Request mới pin metadata version 2, policy `project-ai-p1-v1`, organization/Project/actor/conversation từ server. Developer context lấy Project name theo `project.read`; dependency này được lưu trước egress và kiểm lại khi output/view, kể cả không gọi tool. Question tổng quát được trả lời bình thường. Returned model khác selected model bị FAILED. Metadata request malformed/scope sai bị ẩn. Version 1 giữ causal/source fences hiện hữu. History vẫn 8 lượt và SIWC vẫn chỉ `task_list` trong P1-A; phần mở rộng thuộc P1-B/P2.

## Source và artifact

- Worktree: `/home/galaxy_os/.worktrees/m2-a-20260928`; branch `m2/project-chat-20260928`.
- CODE_SHA (Git HEAD, dirty): `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`. Không commit/stage/push/PR.
- TESTED_TREE P1-A: `8da5fdb2d7dc9ffc4708ea550bfaf98e29d89968`.
- Source SHA256: `62edbe7afe76209597fdb4bcfdee914f764d8c1db930a6efa698eb9b076a84e7`.
- Archive SHA256: `a89631dd57821265d59c61373fb65654a56562a54c02f33783315c71abe3c694`.
- Deployed: `local-62edbe7afe76`, `/home/galaxy_os/.runtime/releases/p1-a-20261009-r2`; Web build `nCCqjnBGuxfrylb9fIPkT`.
- Main schema86, pending0, Web/API READY. P1-B source/migrations được giữ ngoài snapshot A và chưa apply main.
- Runtime evidence private: `/home/galaxy_os/.runtime/p1-a-20261009/final/`; TDD/review/check logs: `.superpowers/sdd/2026-10-09-p1-project-ai-memory/`.

P1-A files changed so với baseline của phiên (các file đã dirty từ nhiệm vụ SIWC trước đó được giữ):

1. `apps/api/src/project-chat/project-ai.service.ts` — pilot, scope/context, entitlement HTTP, model guard, consumed Project permission.
2. `apps/api/src/project-chat/ai-registry.ts` — strict v2 metadata, giữ v1.
3. `apps/api/src/project-chat/ai-chatgpt-service.test.ts` — outside-pilot/scope/malformed/revoke/model regressions.
4. `apps/api/src/project-chat/ai-registry.test.ts` và `ai-chatgpt-plan.test.ts` — metadata/wire regressions.
5. `apps/api/test/p1-project-ai.integration.test.ts` — PostgreSQL/session/IAM/codec, denied actor/tenant/binding/entitlement/revoke.
6. `apps/web/tests/browser/p1-project-ai.spec.ts`, `apps/web/playwright.m2.config.ts` — Chrome fixture, two tabs/reload/SPA late A response, portable sandbox Chrome.
7. `scripts/m3-browser-provider-fixture.mjs` — guarded synthetic SIWC SSE fixture; không dùng fixture làm bằng chứng OpenAI live.

Không sửa source OAuth/registration/callback/exchange/refresh/credential lifecycle, login, Edge/domain/network, business canonical hoặc provider paused. Env cutover chỉ đổi `GALAXY_RELEASE_ID`. Key/env/provider policy và Edge PID giữ nguyên. Bridge Chrome WSL cũ đã dừng; khởi chạy lại nguyên script loopback33005→Windows loopback33004, không đổi topology/debugging config. Chrome Windows154 đã có owner session200; không tạo session hoặc đọc cookie/token thay login.

## Verification và main live

TDD mới tái hiện pilot từ chối ngoài Showroom, thiếu scope/malformed pin, returned model sai, staff HTTP500 và Project context permission revoke. Fresh reviewer tìm dependency `project.read` của Project name và browser SPA race; đã sửa với RED/GREEN. Ponytail correctness/security/authorization/UX review giữ scope nhỏ, không đổi UI product khi race tests đã đạt.

- Full fixture regression: API1469 + Web573 + Edge5 + document-service1 = **2048 PASS**, log `p1-a-regression-stream.log`, existing stream fixture, không main DB. Run đầu trên fixture M3 cũ bị lỗi PDF env/precondition và v1 assertion; giữ log FAIL, sửa đúng nguyên nhân hoặc dùng fixture verified, không reset dữ liệu.
- Final artifact focused: **58 PASS** (54 unit + 4 PostgreSQL integration), `focused.log`.
- Web focused: **30 PASS**. Browser exact final artifact: **1 PASS**, Google Chrome for Testing155, sandbox enabled, `p1-a-browser-final.log`.
- Build API/Web/Edge, lint, typecheck, format PASS trên final artifact (`static.log`, `p1-a-final-build.log`). Full regression source chỉ khác final ở whitespace của một test; rerun focused trên final. `git diff --check` đã kiểm P1-A, kiểm tiếp khi P1-B thay đổi.
- `pnpm local:status`: main READY/schema86. `pnpm prod:verify-artifacts`: ARTIFACTS_VERIFIED.
- Chrome Windows localhost3000, LAN192.168.1.80:3000, HTTPSos.galaxycentre.vn: Web/API200 cùng release (`route-checks.json`). Authenticated HTTPS chat chưa chạy; domain tab đang401, tách khỏi owner localhost acceptance.

Main owner sử dụng cùng model `gpt-6-luna`:

| Project / bài thử                  | Answer ID                              | Kết quả                                   |
| ---------------------------------- | -------------------------------------- | ----------------------------------------- |
| Showroom: tên/ID Project, sentinel | `a631a342-3f31-4654-8dba-fbfe7b8b50cb` | COMPLETED, 7440ms                         |
| Ecopark: tên/ID Project, sentinel  | `92e133de-0b19-4727-8881-497beceda7e0` | COMPLETED, 4250ms                         |
| Quận 7: tên/ID Project, sentinel   | `f5f957e6-6348-4dfd-a52a-b03f57fba2ea` | COMPLETED, 4184ms                         |
| Ecopark: SQL INNER/LEFT JOIN       | `50fabc07-04b4-47e2-beb6-ba181ed714b2` | COMPLETED, general QA                     |
| Showroom: đọc Task hiện có         | `0d5b8053-1ef2-4fb7-9925-71d2d2361664` | COMPLETED, source thật, 2 provider rounds |

DB trace cả5 có selected/returned model đúng, scope v2 đúng Project/owner/conversation, terminal `response.completed`; sáu provider rounds có upstream request ID **null** vì route không trả header, giữ null thật, không tạo ID. Evidence `main-live.json` có trace redacted theo allowlist; không credential. Three conversations riêng, reload/two tabs không thấy sentinel Project khác. Chỉ tạo chat/câu hỏi có nhãn kiểm thử và đọc Task; không sửa Task/hợp đồng/thanh toán.

Cutover dùng đúng control plane/systemd/manifest hiện hữu, live nằm trong cửa sổ kích hoạt có rollback. Những lần đầu rollback do **script nghiệm thu** thiếu `X-Chat-Actor`, strict locator khi nhiều response cards, và assertion sai với upstream request ID nullable. Giữ logs/backup riêng; không đổi artifact/product cho các lỗi này. Sau sửa assertion, browser/DB trace được kiểm lại trên chính artifact đã tạo5response thật, không gọi lặp inference. Lần cuối `cutover-r4.py` READY; cơ chế rollback đã thực chạy về bản cũ ở các lần gate fail.

Fresh backup `main-before-p1a.dump`: 1443066bytes, SHA256 `39c43fc47af9813b1f34c2437488486556a69b7e266d487984fb9505d1cf548b`. Full restore rehearsal trong schema private `p1a_backup_rehearsal_20261009` của **database fixture hiện hữu**, không tạo DB/reset/main mutation; 229table/11349row có COPY counts/hashes khớp backup (`restore.json`). Dữ liệu backup private không được dùng bởi app fixture. Rollback app về `local-bf73047fa0ee` bằng backup units/manifest trong `rollback-cutover-r4`; giữ DB/storage/key/credential. Không restore DB cho rollback P1-A.

## P1-B đang làm

Task4 đã có schema memory/revision/typed dependency/answer dependency và scoped FKs. Migration tạo bằng `prisma:migrate --create-only`: `20261008202538_p1_project_ai_memory`; chỉ apply fixture. Supplemental `20261008204500_p1_memory_required_metadata` chặn nullable CHECK bypass, không sửa migration đã apply. Một malformed **synthetic fixture revision** do RED cho lọt làm supplemental validation fail; đã dọn đúng1row test, Prisma resolve rolled-back rồi deploy lại nguyên SQL. Main schema không đổi.

Task5 API đã triển khai: private/shared CRUD, immutable revisions, CAS/idempotency, inactive, provenance/source ACL và lexical lookup/cursor. **20 Memory database/API integration +4 cross-Project AI regression PASS**, Memory4/SIWC21/paused-provider5 unit PASS, typecheck/eslint PASS. Tested source: Task/version, private File index, AI answer original lineage, stage_two_plan và financial denial, nested memory/cycle, revoke giữa request, audit rollback/redaction. Không gọi Memory feature live PASS: main chưa migration, chưa UI/tool/history mới; Task6–9 đang tiếp tục.

Task6 probe qua owner đang đăng nhập, giữ nguyên connection: official GET `/v1/models`200 có7slugs, `context_window=272000`; không lấy API model card1.05M làm capacity của SIWC. Official POST `/v1/responses/input_tokens`401 `hardened_oauth_rule_missing`, request ID `req_819a160427e04092b307df6bc6b83c49`. Connection ciphertext hash không đổi, không retry/refesh/OAuth sửa chữa. Tokenizer/profile còn UNVERIFIED; evidence private `/home/galaxy_os/.runtime/p1-b-20261009/capability-probe.json`.

## 16 trạng thái checkpoint

| Trạng thái          | Kết quả | Phạm vi chứng minh                                                    |
| ------------------- | ------- | --------------------------------------------------------------------- |
| P1_PROJECT_AI       | PASS    | Main3Projects/5completed, denied fixture, no reconnect                |
| P1_PRIVATE_MEMORY   | NOT_RUN | CRUD/API fixture PASS; UI/inference/main còn thiếu                    |
| P1_SHARED_MEMORY    | NOT_RUN | Publication/API fixture PASS; UI/main còn thiếu                       |
| P1_MEMORY_ISOLATION | NOT_RUN | Backend/source/cursor tests PASS; worker/UI/main còn thiếu            |
| P2_GENERAL_QA       | NOT_RUN | P1-A SQL JOIN live đạt; chưa benchmark P2                             |
| P2_CONTEXT          | NOT_RUN | P1-A scope đạt; advanced history còn P1-B                             |
| P2_TOOLS            | NOT_RUN | task_list live đạt; chưa mở registry P2                               |
| P2_WEB_SEARCH       | NOT_RUN | Written spec/plan approval P2 còn thiếu                               |
| P2_CITATIONS        | NOT_RUN | Chưa web sources                                                      |
| P3_UPLOAD           | NOT_RUN | Chưa pipeline mới                                                     |
| P3_FILE_PARSING     | NOT_RUN | Chưa P3 acceptance                                                    |
| P3_AI_RETRIEVAL     | NOT_RUN | Chưa SIWC file retrieval                                              |
| P3_10GB_LIMIT       | NOT_RUN | Chat hiện10MiB; chưa bật10GB                                          |
| REGRESSION          | PASS    | P1-A full fixture2048/final focused58/browser1                        |
| SECURITY_ACL        | PASS    | P1-A backend fixtures/source revoke; không chứng nhận P1-B chưa viết  |
| DEPLOYED_RUNTIME    | PASS    | Main local-62edbe7afe76, schema86, localhost/LAN/domain cùng artifact |

Bước tiếp: Task6 history/summary/consumed-context bằng TDD, rồi Task7–9 theo plan đã duyệt. Không xin lại P1 hoặc dùng gate P2/P3 để chặn P1-B. Khi đủ gates của P1-B mới backup/migrate main/cutover với compatible rollback manifest; giữ artifact P1-A đang sử dụng.
