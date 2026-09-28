# Galaxy OS M2-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`; chủ dự án chọn INLINE. Theo chỉ đạo M2-A, tác giả lập và rà soát kỹ thuật kế hoạch để thực thi, không PLAN_APPROVED_BY_OWNER.

**Goal:** Project đã có → chat nội bộ/khách, lịch sử/file bền vững, quyền hiện tại và publication hai actor trên test stack riêng.

**Architecture:** Reuse Project, User/Session/IAM, FilesService/FileAsset/storage. Thêm room/message/grant/history/release theo target hiện hữu, HTTP polling; không parallel domain, không AI hoặc sửa nghiệp vụ tiền.

**Tech Stack:** Nest11/Prisma6/PostgreSQL17, Next16/React19, TypeScript strict, Vitest3/Playwright1.51; giữ lockfile.

**Spec:** [DESIGN](DESIGN.md), phần M2-A hiện hành, và [DECISIONS](DECISIONS.md). PLAN_STATUS: TECHNICAL_REVIEWED_WITH_DEPENDENT_GATES. Phương thức ủy quyền: “Chủ dự án chốt phạm vi/chính sách bằng chỉ đạo hiện tại, ủy quyền lập và rà soát kỹ thuật kế hoạch để thực thi inline.”

Review độc lập (chỉ đọc) đã thực hiện: năm điểm important. Những điều chỉnh dưới đây là technical rulings, không đổi B1–B5. Task1 không phụ thuộc source-publication mapping; Task4 phải chốt mapping trước code phát hành, không claim toàn PLAN vô điều kiện sẵn sàng. Chưa review SQL/chưa test runtime bằng việc review PLAN.

- File: chỉ `/project-chat/rooms/:roomId/files/:fileId/download` và `/project-chat/releases/:id/download` cho khách; generic `/files` vẫn deny. Shared upload có nhánh ChatRoom kiểm room grant, không synthesize project-level file.upload.
- Authority: `GET /project-chat/projects/:id/candidates`, `POST /project-chat/projects/:id/authorities` với `{userId,actions,roomCeiling,expiresAt?}`, `POST /project-chat/projects/:id/authorities/:grantId/revoke`. IAM role.assign cùng source scope/tier và target-policy, kiểm từng action delegation; grant tường minh chứ không suy role. Room `POST .../grants/:id/renew {expiresAt}`; đang hiệu lực giữ epoch, effectiveAt gia hạn do server và <=30ngày mới; sau hết hạn tạo grant/epoch mới, không copy old history. History DTO thêm `actions: ('READ'|'DOWNLOAD')[]`, chỉ cấp quyền trong ceiling/nguồn của người cấp.
- Poll: query `after` tăng dần, `nextAfter` bằng sequence tin cuối **thực trả**, `hasMore` chỉ cho tập visible; drain pages trước poll tiếp. Không trả room-global latest/count cho scope hẹp. Query `before` giảm dần, UI đảo trình bày; test burst150 visible+hidden với limit100 không mất50tin.
- Source actor: guard bổ sung `assignmentId`, `administrationTier` vào từng permission source từ UserRole/Role thật, không lấy merged tier; projection chỉ permissions của chính assignment. Sau lock phải reload active assignment/role/member/session rồi kiểm lại. Hai bindings cùng role vẫn phân biệt ID/expiry.
- Publication: Task4 còn technical gate ánh xạ từng source có approval flow/asset/version/quyền cụ thể. Không dùng filename, client approval hoặc mặc định APPROVED. Nguồn chưa ánh xạ failclosed, không báo publication complete; giữ ca positive qua service approval thật và source-race/financialdeny.

## Tiếp tục M2-A — phạm vi đã được giao

RESUME_START_SHA: `b2c8fe440c0e4b5ca53940d9c8ded34ed00ab5b8`. INLINE; giữ B1–B5, không xin lại approval. Hai reviewer chỉ đọc: publication/provenance và regression/navigation. Không chạy DB/browser/build đồng thời.

1. **Hồi quy:** khôi phục log gốc 13 lỗi; tái hiện `test/m2-project-chat.integration.test.ts`, `test/project-required-document-upload.integration.test.ts`, `test/admin-reset-password.integration.test.ts`; điều tra cả lỗi mới từ full suite. Giữ timeout/assertion, ghi thao tác đang chờ và phép đo clock/DB. Sửa source hoặc fixture đúng nguyên nhân, targeted → nhóm → full; lặp có giới hạn 10 lần nhóm từng lỗi sau sửa. Log trong `.superpowers/sdd/PLAN/` (ignored).
2. **Publication:** `apps/api/src/project-chat/{project-chat.service,project-chat.dto,project-chat.controller}.ts`, schema/migration additive nếu cần, domain adapter thực sự có nguồn. Test approval khác binary/version, thay bytes sau preview/publish, recipient/permission đổi, publish đồng thời; tải bytes thật qua khách. Map từng nguồn B5, loại thiếu source contract fail-closed và vẫn là blocker. Không generic fallback.
3. **Nháp/navigation:** `apps/web/features/project-chat/project-chat.tsx`, browser `apps/web/tests/browser/m2-project-chat.spec.ts`. Dùng API tương thích Next đang cài, không sửa history.state hoặc thêm history entries giả. RED browser Back/Forward thật → sửa → xác nhận ở lại giữ RAM, rời bỏ nháp, reload không lưu, bfcache reauthorize; không prompt sau revoke.
4. **Race/reconnect/mobile:** bổ sung barrier có kiểm soát vào integration M2 và browser hiện có; send/lock/revoke, stale response, offline/reconnect, một polling loop, mobile tiếng Việt/file/publication. Assertion riêng cho hành vi còn thiếu, giữ IDs 24+30.
5. **Chốt:** targeted/API, Web, browser mở rộng, build/typecheck/lint/format/schema và full API hai lần liên tiếp cùng source/config; không retry tự động. Review correctness/security/authorization/UX/Ponytail, commit source local rồi docs riêng. M2-A chỉ VERIFIED khi không còn ca bắt buộc thiếu.

Lệnh giữ recipe trong VERIFICATION; không thay DB/stack. Expected: các assertion deny/persistence/binary/navigation đạt, exit 0; mọi failure hoặc nguồn chưa đủ ghi PARTIAL, không miễn nghiệm thu.

### Bổ sung kỹ thuật publication đã review trong continuation

- `project-chat.dto.ts/service.ts`, `prisma/schema.prisma` và migration additive: sourceType PROPOSAL/QUOTATION/TECHNICAL/SAMPLE/HANDOVER, FK cụ thể + snapshot trạng thái nguồn; không generic approval. File/binary luôn digest server và pinned.
- `production/production.service.ts`: khóa Project trước đọc lại revise/decide; adapter chỉ nhận SHOP_DRAWING/SAMPLE đã APPROVED, decider khác submitter của revision; SampleApproval pin ID và phiên bản binary.
- `after-sales/after-sales.service.ts/module.ts`: add/sign/complete dùng cùng Project lock; tạo version mới đối chiếu checksum bytes server. Adapter allowlist HANDOVER*MINUTES/PRODUCT_LIST/WARRANTY_DOCUMENT/AS_BUILT_DRAWING, chỉ NOT_REQUIRED hoặc SIGNED*\* có thời điểm; snapshot/UI mô tả trạng thái nguồn, không tạo tác động ký/nghiệm thu.
- Test `m2-project-chat.integration.test.ts`: nguồn chưa duyệt, approval/file khác, Project khác, checksum client giả, stale sau revise/sign, bytes khách đúng bản cũ, quota không cộng đôi quote export; unit production/after-sales hồi quy writers. Lệnh trong apps/api: `E node_modules/vitest/vitest.mjs run test/m2-project-chat.integration.test.ts src/production/production.test.ts src/after-sales/after-sales.test.ts --no-file-parallelism --poolOptions.forks.singleFork`.
- Reviewer `/root/publication_review` đã rà điều kiện/phạm vi khóa và XOR; đây là review kỹ thuật, không bằng chứng chạy test. Contract/phụ lục/payment/kế hoạch giao-lắp vẫn MISSING_SOURCE_CONTRACT, không xây domain mới.

## Global Constraints

### Đối chiếu thực thi inline ngày 2026-09-28

Các checklist bên dưới là kế hoạch gốc, không tự là PASS. Trạng thái thực tế:

| Task | Thực hiện                                                                                          | Giới hạn                                                                |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Stack G00 riêng smoke 3/3; provenance RED→GREEN; commit `b5a0859d45b6711e71cc8bad11f750b8ee498944` | Không cài bwrap; executor/DB/browser vẫn hoạt động bằng approval hợp lệ |
| 2–3  | Schema/grant/history/external identity/tin/cursor/retry/poll API thật                              | Chưa nghiệm thu mọi tổ hợp race trong 24+30 ca                          |
| 4    | Upload/FileAsset thật và PROPOSAL publication hai actor                                            | Chưa đủ adapter cho toàn danh mục B5; không coi publication hoàn tất    |
| 5    | UI nội bộ/khách/mobile/quản trị/publication và Task/ProductLine thật                               | Back/Forward chưa có cảnh báo nháp; bằng chứng browser xem VERIFICATION |
| 6    | Targeted/full checks, reviewer độc lập, báo cáo/commit                                             | Giữ các lỗi full run và ca NOT_RUN, không gom thành VERIFIED            |

Không tạo các file giả định `project-chat-files.service.ts`, `message-contract.ts`, `project-chat.test.ts`, `m2-project-chat.fixture.ts`, `m2-project-chat-files.integration.test.ts`: orchestration đủ dùng trong service hiện hữu của module, integration chung và fixture browser. Không sửa UploadsService/business-entity.policy/user-management.policy chỉ vì từng có trong danh sách dự kiến. Các đường thật:

- `apps/api/src/project-chat/{project-chat.module.ts,project-chat.controller.ts,project-chat.service.ts,project-chat.dto.ts}`; `apps/api/src/access-control/project-chat.policy.ts`; integration `apps/api/test/m2-project-chat.integration.test.ts` (26 ca); `apps/api/test/m2-browser.fixture.ts`.
- Reuse pipeline tại `apps/api/src/files/files.service.ts`, chặn generic bypass trong `files/project-file.ts`, `search/search.controller.ts`, `audit/audit.service.ts`; export `TasksService.visibleWhere` từ TasksModule để dùng đúng predicate cũ.
- `apps/web/features/project-chat/{project-chat.tsx,chat-controls.tsx,project-chat.test.tsx}`, routes `/work`, `/projects/[projectId]/work`; browser `apps/web/tests/browser/m2-project-chat.spec.ts` (8 ca), config `playwright.m2.config.ts` và launcher `scripts/m2-a-serve.mjs`.
- Bảy migration additive: `20260927225352_m2_project_chat`, `20260927225945_m2_chat_history`, `20260927230350_m2_external_identity`, `20260927231222_m2_chat_files_history_provenance`, `20260927234447_m2_chat_publication`, `20260927235059_m2_release_recipient_review`, `20260928001623_m2_chat_domain_links`. Tất cả dưới `apps/api/prisma/migrations/`, chỉ áp DB test, không sửa migration đã áp.
- Contract API thực tế xem controller/DTO: `GET .../link-options`, room create nhận optional `taskId/productLineId`; GET messages trả `viewerId/grantId/scopeToken/locked/links` cùng cursor. `scopeToken` là digest quyền/lịch sử, không token cấp quyền. `X-Chat-Actor` là precondition chống tab khác account, không thay session auth.
- Prepare nhận `{sourceId,fileId,version}`; `GET /project-chat/releases/:id/review`, `/preview`, `POST /publish {confirmed:true,recipientHash}`, `/revoke`, `GET /download`. Không generic `sourceType` do mới có một adapter thật. UI nói rõ loại hỗ trợ.

Review: tác giả kiểm callers/SQL/contract; reviewer độc lập `/root/m2a_plan_review` và `/root/m2a_foundation_review` chỉ đọc (không delegate implementation), phát hiện quyền/history/file/cache và UX đã được ghi/sửa theo regression. Review cuối không chứng minh runtime/tests toàn bộ hoặc owner đã đọc PLAN. Giữ finding Back/Forward và mapping B5 mở, không ghi REVIEW_PASSED toàn gói. Ponytail: không dependency mới/AI/WebSocket/helper-service song song.

Lệnh/test/exit và phần chưa đạt là [VERIFICATION](VERIFICATION.md). Khi tiếp tục phải dùng worktree này, không bắt đầu M0/M1 hoặc merge nhánh cũ.

- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`; không merge/cherry-pick/push/deploy. Gốc chỉ thêm ignore worktree theo skill, không source/runtime.
- Guest expiry bắt buộc, tối đa30 ngày từ effectiveAt, không auto-renew; sau gap là grant mới. Server time, không client time cho joinedAt.
- Grant/admin/publisher không suy role-name/creator; action/scope cùng source. ADMIN không READ, không delegate ADMIN/PUBLISH.
- History default lần cấp hiện tại; khoảng cũ explicit/audit, áp message/file/preview/count. Không edit/delete/retention job.
- Nháp RAM tab, không localStorage/sessionStorage/backend; clear logout/account/revoke. File/publication không public URL.
- Test2 tenant và actors độc lập chuẩn bị/phát hành; không dữ liệu/tài khoản/adapter thật. Lead-only DEFERRED_BY_EXPLICIT_SLICE_SCOPE, M2 tổng thể PARTIAL.

## Review Focus

1. Role binding khác cấp scope/tier rộng hơn: authority route không được ghép — regression task1/2.
2. Revoke trong lúc request chờ lock và replay key cũ — task2/3 race, current auth trước response.
3. Re-add/expiry vẫn lộ filename/reply hoặc bytes qua generic URL — task2/4 deny history mọi đường.
4. Pending upload/finalize race/cleanup tạo lost reference — task4 DB+disk consistency, không success giả.
5. Poll response trễ sau đổi room/logout phục hồi cache hoặc nháp — task5 deferred fetch test + browser.

## Task 1: Môi trường và prerequisite quyền

**Files:** tạo `scripts/m2-a-isolated.env.example`; dùng `scripts/g00-isolated-test.mjs`, `docker-compose.g00.yml`, `apps/api/scripts/g00-isolated-environment.mjs`, `apps/api/test/g00-isolated-smoke.integration.test.ts`. Nếu regression chứng minh cần sửa: `apps/api/src/access-control/current-actor.ts`, `development-auth.guard.ts`, `user-management.policy.ts`, `access-control.test.ts`; không toàn bộ IAM/final-admin.

**Interfaces:** consumes `assertG00Isolation(env)`/G00 check/up/prepare/smoke; produces DB test xác minh danh tính, cookie/storage riêng, permission-source projection cho authority route. `actorsForPermission(actor: CurrentActor, permission: string): CurrentActor[]` giữ đúng permission/scope/tier của từng assignment đã xác minh; nguồn thiếu assignment/tier bị loại, không mượn merged tier hoặc scope.

- [ ] Tạo env test không fallback `.env.local`; namespace/port/storage như DESIGN. Đọc recipe trước; kiểm Docker default unix socket, labels không trùng, port trống, owned root.
- [ ] `node --env-file=scripts/m2-a-isolated.env.example scripts/g00-isolated-test.mjs check`, `up`, `prepare`, `smoke`; Expected check0, identity đúng, smoke3/3 thực DB/auth. Nếu lỗi quyền dùng approval cụ thể, không disable guard.
- [ ] Test RED nhiều source role.assign SELF + action khác ORGANIZATION không cho authority ngoài scope/tier. Nếu code đã deny thì giữ regression, không tạo patch vô cớ.
- [ ] Sửa tối thiểu source projection nếu lỗi tái hiện; targeted `pnpm --filter @galaxy/api exec vitest run src/access-control/access-control.test.ts --no-file-parallelism --poolOptions.forks.singleFork`; Expected PASS.
- [ ] Review diff/guard/isolation và commit riêng file đã kiểm. READY chỉ khi stack smoke và prerequisite có bằng chứng.

## Task 2: Quyền room và mô hình bổ sung

**Files:** sửa `apps/api/prisma/schema.prisma`, tạo migration dưới `apps/api/prisma/migrations/` bằng script prisma:migrate; tạo `apps/api/src/access-control/project-chat.policy.ts`, `apps/api/src/project-chat/project-chat.dto.ts`, `project-chat.service.ts`, `project-chat.controller.ts`, `project-chat.module.ts`, `project-chat.test.ts`; sửa `access.decorators.ts`, `development-auth.guard.ts`, `current-actor.ts`, `access-control.module.ts`, `auth/auth.controller.ts`, `me.controller.ts`, `me.service.ts`, `app.module.ts`. Integration mới `apps/api/test/m2-project-chat.integration.test.ts`; fixture `apps/api/test/m2-project-chat.fixture.ts`.

**Interfaces:** `ProjectChatPolicy.assertRoom(actor, roomId, action, tx)` trả server-resolved room+current grant/history. `ProjectChatService.projects(actor)`, `rooms(actor,projectId)`, `createRoom(actor,projectId,dto)`, `grant(actor,roomId,dto)`, `revoke(actor,roomId,grantId)`, `grantHistory(actor,roomId,grantId,{from,to})`, `lock(actor,roomId,locked)`. Actions READ/SEND/UPLOAD/DOWNLOAD/CREATE/LOCK/HISTORY/ACCESS_ADMIN/PUBLISH tách. Route `/project-chat/projects`, `/project-chat/projects/:id/rooms`, `/project-chat/rooms/:id/{grants,history,lock}`. Authority Project grant endpoint cần IAM role.assign cùng source/target/tier, ceiling không vượt actor; quyền PUBLISH độc lập. Không nhận actor/org từ body.

- [ ] RED integration auth cookie thật: fixture O1 P1/P2 và O2 P3, manager/sender/viewer/outsider/guest/otherGuest/publisher. Assert viewer403send, O2/outsider404, creator không grant, admin không READ/PUBLISH, ceiling reject, guest expiry>30ngày reject.
- [ ] Additive schema: ChatProjectGrant, ChatRoom, ChatRoomGrant, ChatHistoryGrant, ChatMessage, DocumentRelease; organization/member/project/room source FKs, append-only grant events, server sequence và unique key. OrganizationMembership.kind default INTERNAL. Foreign relationships không trộn tenant; Project/Task/ProductLine references validate trước write.
- [ ] `prisma:migrate -- --name m2_project_chat --create-only` chỉ env/test DB + shadow riêng đã xác minh; nếu đề nghị reset: dừng, không đồng ý. Review SQL không drop/update domain cũ rồi `prisma:deploy`/generate. Expected0; root DB untouched.
- [ ] Implement service/DTO/global external deny + minimal `/me`, allow auth/logout/passwordchange only. Recheck live user/session/org/grant under lock. Candidate UI phải từ query scoped, không toàn users. Khóa project trước room; grant revoke/history/write theo cùng lock order.
- [ ] GREEN integration lịch sử mặc định, explicit interval, revoke/re-add không mở gap/cũ, guest grant30ngày/renew-before/renew-after, inactive member, quyền nhiều binding. Expected DB/API deny và events giữ nguyên. Review+commit.

## Task 3: Tin bền vững, cursor, retry

**Files:** service/controller/dto/tests task2; mới `apps/api/src/project-chat/message-contract.ts` chỉ nếu helper được cả test/service dùng.

**Interfaces:** `messages(actor,roomId,{before?,after?,limit?}) -> {items,nextBefore,nextAfter,hasMore}`; `send(actor,roomId,{clientKey,body,attachmentIds?}) -> MessageView`. GET/POST `/project-chat/rooms/:id/messages`. Limit1–100, body1–8000 hoặc attachment, keyUUID. Sequence server dưới room lock; fingerprint payload chuẩn hóa ổn định. Không latestSequence global; cursor chỉ từ tin trả về.

- [ ] RED assertions database: send/reload/login, duplicate/concurrent samekey chỉ1row, payload khác409, samekey khác actor/room/tenant không replay chéo; pagination concurrent không mất/trùng; locked send/replay deny khi grant mất.
- [ ] Implement transaction lock+reauth+unique+hash, DTO trả tối thiểu; cursor theo sequence, history predicate áp trước limit/count. Không reply/search/unread nếu không xây đủ quyền; không generic notification body.
- [ ] GREEN targeted integration; review đối chiếu 24ca01–13/18/21/24 + prompt30ca1–14/22/23/25/26/30; commit đúng files.

## Task 4: Attachment và publication

**Files:** sửa `apps/api/src/files/files.service.ts`, `files.dto.ts`, `files.test.ts`, `apps/api/src/access-control/business-entity.policy.ts`, `apps/api/src/uploads/uploads.service.ts` chỉ references cần thiết; tạo `apps/api/src/project-chat/project-chat-files.service.ts` chỉ orchestration domain gọi FilesService/storage, không upload implementation thứ hai; `apps/api/test/m2-project-chat-files.integration.test.ts`; task2schema/routes.

**Interfaces:** `FilesService.upload` mở target room đã kiểm và idempotency input, giữ pipeline hiện có; `/project-chat/rooms/:id/files` multipart, `/project-chat/rooms/:roomId/files/:fileId/download` cần history+DOWNLOAD, `/project-chat/releases/:id/download` thêm release state/recipient. `prepareRelease(actor,roomId,{sourceType,sourceId,version,fileId}) -> ReleasePreview`, `publishRelease(actor,releaseId)` và `revokeRelease`; `/project-chat/rooms/:id/releases`, `/project-chat/releases/:id/{publish,revoke}`. Không cho generic file attachment bỏ qua publication.

- [ ] RED upload→FileAsset/link→storage bytes→download; source room/tenant khác deny, old filename/preview deny, failure/retry/finalize race đúng, cleanup giữ referenced; file khách pending safety không đọc sớm.
- [ ] Reuse MIME/size/signature/quota/reservation/storage. Generic search/file chỉ trả context có quyền, không projectId mở room-file; room source nguyên bản INTERNAL/EXTERNAL_SOURCE không suy theo filename. Không xóa shared file khi retry lỗi.
- [ ] RED prepare/publish cùng actor hai session deny; publisher thiếusource/share deny; nguồn/version đổi conflict; bản phát hành immutable, recipient download không mở source; restricted category/financial fields failclosed. Mapping sourceType tới domain thật và đủ business status, không boolean client; loại thiếu mapping báo dependency, không giả approved.
- [ ] Implement release version/snapshot/checksum/actors/recipient/revoke + proxy tải reauth. Sửa reference checks trước cleanup. GREEN DB/storage/API cases; review quyền/migration; commit.

## Task 5: UI và polling

**Files:** tạo `apps/web/app/projects/[projectId]/work/page.tsx`, `apps/web/features/project-chat/project-chat.tsx`, `project-chat.test.tsx`, `apps/web/app/work/page.tsx`; sửa `apps/web/app/portal-shell.tsx`, `apps/web/app/lib/api.ts` Actor external projection; reuse existing project/products/tasks/files links; mới `apps/web/playwright.m2.config.ts`, `apps/web/tests/browser/m2-project-chat.spec.ts`.

**Interfaces:** consume task2–4 DTO/API; `ProjectChat({projectId})`, API AbortSignal theo requestInit hiện hữu; polling generation theo actor/room, chỉ1inflight, exponential backoff giới hạn30s, pause hidden/offline. Testserver Web33002/API33001 cookie riêng.

- [ ] RED unit UI: view-only composer reason, loading/error giữ draft, response cũ sau room switch/revoke không restore, pending/send/retry cùng key, beforeunload khi draft, không persist nháp. Render filename/text như text, không HTML.
- [ ] Implement shell4tabs/4groups, mobile1panel, history anchor/no unsolicited scroll, chat identity; management/candidate/expiry/history UI theo server permissions, publication exact preview+recipient+confirmation. Other tabs link thật theo quyền; guest nav không generic finance/projects payload.
- [ ] GREEN unit và browser cookie login sender/viewer/guest/outsider: reload history, file byte, explicitdeny, mobile, expiry/revoke, AI absent. Không mock thay integration. Review UX/security/lean; commit.

## Task 6: Hồi quy, nghiệm thu và handoff

**Files:** tests task2–5, `VERIFICATION.md`, `HANDOFF.md`, `PROJECT_STATUS.md`, `docs/galaxy-os/05-IMPLEMENTATION-STATUS.md`.

**Interfaces:** consume task1identity/task2policy/task3messages/task4file/task5UI; produce evidence SHA/tree/commands/exit+24ca và30ca. Lịch sử chưa test vẫn NOT_RUN; ca22 Lead-only DEFERRED_BY_EXPLICIT_SLICE_SCOPE, Project hiện hữu vẫn phải giữ links/obligations.

- [ ] Hồi quy `/me` (`test/sprint1.integration.test.ts`), `test/project-required-document-upload.integration.test.ts`, IAM/file/upload unit + các integration M2. Chạy env riêng, full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`; không sửa timeout/expectation/guard cho xanh. Python placeholder nếu thiếu venv chỉ tạo theo requirements hiện hữu hoặc báo exactblocker.
- [ ] Fresh whole-branch reviewer đọc spec/plan/diff/evidence, Ponytail/correctness/security/authorization/UX. Fix important bằng RED→GREEN; ghi mọi blocker/giới hạn.
- [ ] Commit source/test theo scope sau checks. Ghi CODE_SHA/TESTED_SHA/TESTED_TREE, nếu đổi source rerun. Docs commit riêng sau đó, không selfhash.
- [ ] Handoff worktree/ports/start-stop nếu app thật chạy; giữ stack hoặc dừng đúng owned namespace sau lưu evidence. Không gỡ worktree, không merge/deploy. M2-A VERIFIED chỉ khi đủ internal+guest+file+browser; M2 overall PARTIAL.

### Chốt continuation đã thực thi

- A: sửa env leak và barrier cleanup; inventory13 đúng log, full bình thường1120PASS rồi1117PASS/3FAIL. Repeat3file dừng lần1 với55PASS/1FAIL; còn clock/runtime stability, không miễn hồi quy.
- B: thêm QUOTATION/TECHNICAL/SAMPLE/HANDOVER vào publication service hiện hữu, FK/snapshot/checksum server, hai migration bổ sung đã review/test-only. Sửa writer revision/handover lock tối thiểu và quota không đếm lại binary. Contract/payment/install vẫn MISSING_SOURCE_CONTRACT.
- C: custom dialog bỏ nháp RAM, cancelable Navigation API cho Back/Forward, hash không đổi ngữ cảnh, native beforeunload; không state/history hack.
- D: barrier source-revision/send-lock/revoke và browser lost response/delayed poll/offline revoke/mobile; các biến thể BFCache/keyboard/file lỗi còn PARTIAL.
- E: code commit `e4b3570e63367a84cef41f1823c9ad1d530ee10d`; review độc lập quyền/provenance và navigation/isolation, INLINE thực thi. Ma trận, lệnh và từng failure cuối ở VERIFICATION; không nghiệm thu VERIFIED. Bước tiếp: ổn định clock, tái chạy ngưỡng đã giao, đóng biến thể và xác định source contract còn thiếu; không cần duyệt lại B1–B5.

## CLOSEOUT — tiếp tục từ0369b32 theo lệnh chủ dự án

T1: `scripts/m2-clock-monitor.mjs`, `scripts/m2-clock.test.mjs`, launcher test và observer các lớp: chỉ đo UTC+monotonic; đánh dấu contaminated, không override Date hay sửa host. Venv riêng đúng README, `pnpm lint` entrypoint gốc.
T2: các request lỗi trong integration M2/upload và browser management; phân biệt setupfail/policy/time, giữ response công khai404. Clockhost chặn acceptance chứ không chặn code độc lập.
T3: service publication/DTO/UI hiện hữu + schema additive, reuse ContractDocument; source CONTRACT/phụ lục, CustomerPaymentSchedule, InstallationPlan+WorkOrder. Source snapshot allowlist server, fingerprint canonical bắt buộc, text/plain tiếngViệt; bản thông tin không giả chữ ký/biênlai/thựcgiao. TypedFK, binary pin và idempotentprepare. Hai phase: chụp dướiProjectlock+reservequota → render/writepending ngoàiProjectlock → reauth/sourcehash + finalize/release nguyên tử. Domainwriters liên quan dùng cùngkhóa; không đổi quy tắc tiền/trạngthái. Reviewer publication đã review thiết kế với lưuý versioncounter/Decimal/sourcehash/cleanup/retry. Test domainwriters thật→prepare/preview/publish2actor/downloadbytes; stale/revoke giữa2phase, retrykey, saiCustomer/appendix, no sideeffect.
T4: `playwright.m2.config.ts` bỏ riêng defaultargument tắtBFCache; browser spec thêm pageshow.persisted thật với lýdo cachemiss, reconnectmax1, uploadlostresponse/filename/mobilepublication. Khôngbỏcacheheaders/sandbox.
T5: monitor mọi acceptance; 10repeat+2full chỉ tính nếuclockclean; Web/browser/build/typecheck/schema/rootlint/format, hai reviewerreadonly, local source/docscommits riêng. M3 chỉgate, khôngcodeAI. Các lệnh nền giữ VERIFICATION; exactresults bổsung sau test, khôngghiPASStrước.

### Kết quả task closeout

- T1: chẩn đoán clock đa lớp và gate theo PID hoàn thành; host repair ngoài quyền, acceptance blocked. Venv riêng và root lint đạt.
- T2: targeted105 đạt theo lớp, log denial phân biệt observations; source scope rỗng và filename multipart là lỗi code đã sửa. Không đóng stability/timeout chỉ bằng targeted.
- T3: cả3source snapshot có code/UI/API, migration79review/test, domainwriter thật→binary; stale/revoke rollback/concurrent prepare kiểm được. Bản ký/biên lai/thực giao không bị giả tạo; browser từng source còn thiếu.
- T4: upload mất response/filename và polling bounded đạt ca browser; proposal mobile/BackForward có bằng chứng. BFCache persisted thật chưa đạt, giữ no-store; mọi biến thể chưa đủ.
- T5: source commit caa6c32, docs riêng; build/typecheck/schema/rootlint/format đạt. Full2/repeat10 bị clock gate; browser fullfail giữ nguyên. M3-ENTRY chỉ BLOCKED trong HANDOFF, không triển khai AI.
