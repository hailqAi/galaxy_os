# P1 Project AI and Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Owner chọn Codex CLI, thực thi trực tiếp trong phiên hiện tại; không cần chọn lại phương thức.

**Goal:** Phát hành P1-A để owner chat thật ở mọi Project được phép, sau đó P1-B để memory/history dùng đúng nguồn và không lộ giữa Project/actor.

**Architecture:** Sửa gate pilot trong ProjectAiService, giữ IAM và connection SIWC. Memory/revision/dependency nằm trong ProjectChat, dùng PostgreSQL lexical retrieval và source policies hiện hữu. Context assembler dùng token budget và summary riêng của conversation; không thêm provider hoặc nguồn dữ liệu nghiệp vụ song song.

**Tech Stack:** NestJS/strict TypeScript, Prisma 6.19/PostgreSQL, Next.js, Zod, Vitest, Playwright, Node crypto; tokenizer chỉ khi đúng encoding/capability đã được kiểm chứng.

**Spec:** [P1 revision 1 đã được owner duyệt](../specs/2026-10-09-p1-project-ai-memory-design.md). SHA256 nội dung đã duyệt: `792e1ca8d564b004086f0c55d3a774b3bded693c2f770a47387456464dcc0a51`. Giữ nguyên spec này; approval được ghi trong handoff/status, không sửa lại thiết kế để thực thi.

**Plan status:** `WRITTEN_PLAN_REVIEW_PENDING`, revision 1. Spec và phương thức thực thi đã duyệt; plan này chưa được duyệt. Không product mutation trước gate plan. Sau approval bắt đầu Task 1 ngay; không thêm gate thiết kế cho các task đã nằm trong spec/plan.

## Global Constraints

- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, HEAD nền `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` cùng diff SIWC chưa commit. Không reset/clean/stash/ghi đè; không commit/tag/push/PR khi chưa có chỉ đạo riêng.
- P1-A không migration, không đợi Task 4–9. Schema hiện hành 86, rollback P1-A về `local-bf73047fa0ee`, artifact `siwc-stream-items-20261008-r4`.
- Giữ `ProjectAiService.authorized()` và `ChatGptConnectionService.owner()`; không hardcode Project IDs, nới ACL, tự cấp grants hoặc mở owner credential cho staff.
- Giữ OAuth/registration/callback/exchange/refresh/lifecycle, kết nối owner, login, paused API-key providers, domain/Edge/Windows–WSL network. Không remote connection.
- Policy version `project-ai-p1-v1`; scope server gồm organizationId/actorId/projectId/conversationId và grant/generation/model tại execution. Không dùng ID do model khai làm scope.
- PRIVATE/SHARED visibility bất biến. Content 1–8.000 ký tự; query tối đa 200; API limit 1–50/default20; tool limit 1–10; sourceRefs tối đa20; sourceVersion tối đa200; SHA256 hex64. Không tự publish summary hoặc duyệt nghiệp vụ.
- Memory update/inactive có clientKey+expectedVersion; revision bất biến, audit cùng transaction không chứa content. Xóa P1 là inactive; rollback không drop tables hoặc đè dữ liệu mới.
- SIWC stateless, `store:false`, `stream:true`, terminal phải `response.completed`; không gửi `max_output_tokens`, provider metadata hay field route không hỗ trợ. Giữ exact selected model, không fallback.
- Profile budget phải có evidence cho đúng model; reserve 25% context, tối thiểu4.096 tokens và đáp ứng output limit đã biết. Unknown ghi UNVERIFIED, không gán token capacity/encoding giả hoặc âm thầm dùng lại tám lượt.
- P2/P3 chỉ là phạm vi tiếp theo. P1 không mở business writes, web hoặc file inference chưa được nghiệm thu; giới hạn file10.000.000.000bytes được xử lý ở P3, không sửa multipart trong P1.

## Review Focus

1. History version1 thiếu causal pin hoặc tool sources đã revoke: không được trở thành context có quyền chỉ vì nâng metadata lên version2. Tests Task 1/6/7.
2. Hai tab cùng clientKey nhưng payload/version khác, hoặc worker cũ hoàn tất sau inactive: không ghi đè, không hồi sinh note và không publish late output. Tests Task 5/6/8.
3. Shared note xuất phát từ private/source tài chính: explicit publication không bỏ dependency, không lộ private origin ID/content qua citation/audit/count. Tests Task 5/7.
4. Source không đọc được nằm giữa các trang kết quả, cursor giả thuộc Project khác hoặc dependency có cycle: lọc trước snippet/ranking/paging, không bỏ ACL khi vượt resource bound. Tests Task 5/7/9.
5. Unicode tiếng Việt, số đo/Decimal, tool result và encrypted continuation làm request vừa token nhưng vượt wire bytes/items: kiểm toàn body, giữ call_id, không truncate câu hỏi/JSON hoặc đổi model. Tests Task 6/7.

## Execution context, files và interface boundaries

Tất cả path tương đối tính từ canonical. TDD RED/GREEN phải có output mới cho từng logic; không dùng test cũ làm chứng minh fix. Mỗi task kết thúc diff review phạm vi của nó và targeted checks. Task 3/9 có full regression, review độc lập theo requesting-code-review, Ponytail correctness/security/authorization/UX và release gate. Không tự sửa lỗi ngoài phạm vi; ghi blocker có evidence.

| Phần       | File và trách nhiệm                                                                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-A       | Sửa `apps/api/src/project-chat/project-ai.service.ts`, request pin/parse trong `ai-registry.ts`; tests SIWC/registry/codec, PostgreSQL integration; frontend chỉ sửa khi regression chứng minh caller không nhận catalog/scope đúng    |
| Memory     | Tạo `apps/api/src/project-chat/project-ai-memory.service.ts` và unit test: CRUD/revision/ACL/lexical search trong transaction Project đã authorize; controller gọi facade của ProjectAiService, service không resolve owner credential |
| History    | Tạo `apps/api/src/project-chat/ai-history.ts` và test: token/wire packing; `project-ai-history.service.ts` và test: summary/history đọc/ghi theo lease, scoped callbacks. Không tạo worker infrastructure hoặc vector store mới        |
| Data       | Sửa schema, tạo `apps/api/prisma/migrations/20261009_p1_project_ai_memory/migration.sql`; audit feed, DTO/module và API integration tests                                                                                              |
| Tools      | Sửa `ai-tools.ts`, `ai-chatgpt-plan.ts`, dispatcher/view/citation trong ProjectAiService; memory/history proofs khác web/tool business contracts                                                                                       |
| UI         | Tạo `apps/web/features/project-chat/project-ai-memory.tsx` và test; tích hợp `project-ai.tsx`/surfaces; dùng controls/layout/draft/error patterns đang có                                                                              |
| Acceptance | Tạo API `test/p1-project-ai.integration.test.ts`, `test/p1-project-memory.integration.test.ts`; browser `p1-project-ai.spec.ts`, `p1-project-memory.spec.ts`; thêm testMatch của config M2 và SIWC transport fixture có guard          |

ProjectAiService giữ điểm authorize duy nhất cho inference và memory facade. Memory/history service nhận transaction+scope và callback kiểm nguồn từ orchestrator; không inject ProjectAiService ngược lại để tạo dependency cycle. Callback do backend xây, không nhận từ HTTP/model. Các constructor callers hiện có trong `ai-chatgpt-service.test.ts`, `ai-openrouter-service.test.ts` và module được cập nhật khi dependency mới xuất hiện.

Execution scope/types được định nghĩa cùng component sở hữu, không tạo package dùng chung mới:

```ts
// ai-registry.ts: request metadata mới, không phải field gửi tới OpenAI.
type AiRequestScope = Readonly<{
  organizationId: string;
  projectId: string;
  actorId: string;
  conversationId: string;
}>;
type AiConsumedContext = {
  policyVersion: 'project-ai-p1-v1';
  scope: AiRequestScope;
  answerId: string;
  invokeGrantId: string;
  usedHistoryAnswerIds: string[];
  memoryRevisionIds: string[];
  summaryRevisionIds: string[];
}; // usage.execution ở P1-B, không phải OpenAI metadata.
// project-ai-memory.service.ts
type MemoryScope = Readonly<{
  actor: CurrentActor;
  projectId: string;
  invokeGrantId: string;
  policyVersion: 'project-ai-p1-v1';
  conversationId?: string;
}>;
type MemorySourceRef = {
  kind:
    | 'AI_ANSWER'
    | 'CHAT_MESSAGE'
    | 'FILE_INDEX'
    | 'TASK'
    | 'PROJECT_RECORD'
    | 'MEMORY_REVISION';
  id: string;
  version: string;
  locator: Record<string, unknown>;
};
type MemorySourceProof = {
  ref: MemorySourceRef;
  ownerId: string | null;
  conversationId: string | null;
  permissions: string[];
  sourceConfirmed: boolean;
  dependencies: MemorySourceRef[];
};
type ResolveMemorySource = (
  tx: Prisma.TransactionClient,
  ref: MemorySourceRef,
) => Promise<MemorySourceProof>;
```

MemoryView gồm `{id, version, visibility, kind, content, category, verification, provenance, sources, createdAt, updatedAt, canEdit}`; MemoryPage `{items: MemoryView[], nextCursor: string|null}`. MemoryWriteInput/MemoryQuery/MemoryChangeInput/MemoryInactiveInput là types từ DTO/Zod trong Task 5; signatures dưới đây dùng đúng tên đó. Không export raw Prisma row/content trái quyền.

Verification commands trong các task dùng fixture env đã export, không load `.env.local` main vào integration. Khi dùng env wrapper, spawn pnpm với `env:process.env`, kiểm exit code; không in env. Trước integration/full suite: guard `node --env-file=scripts/m3-isolated.env.example scripts/g00-isolated-test.mjs check`; chỉ `up`/`prepare` trên fixture đúng identity nếu cần. Không dùng `run`/`down` vì chúng xóa volume. Full suite chạy với isolation guard và PDF tools private đúng runtime; browser M2 dùng33001/33002, không chiếm3000/3001. Default Playwright config dùng3000 không chạy cạnh main.

## P1-A — thực hiện và phát hành trước

### Task 1: Bỏ pilot predicate, pin scope và gửi context thật

**Files:** Modify `project-ai.service.ts:1218,2143,2419,3099`, `ai-registry.ts:754`; tests `ai-chatgpt-service.test.ts`, `ai-registry.test.ts`, `ai-chatgpt-plan.test.ts`. Không sửa settings/connection hoặc env.

**Interfaces:** Consumes `authorized(actor,projectId,run)`/`owner(actor,generation?,tx?)`. Produces metadata version2 với `policyVersion` và `scope:AiRequestScope`, version1 parser còn hợp lệ; `private projectContext(tx, actor, projectId, conversationId, grantId): Promise<{role:'developer';content:string}>`. Public list/ask/run/history signatures không đổi.

- [ ] **RED tests:** mở rộng fixture hiện hữu thành `fixture(targetProjectId = projectId)`; pilot env vẫn chỉ trỏ Showroom, actor/DB row/access scope dùng targetProjectId. Thêm tests tên `allows catalog ask view and run outside the obsolete pilot`, `pins server scope and rejects a forged scope`, `keeps v1 causal checks`, `does not publish a different returned model`. Assert:

  ```ts
  expect(models.every((m) => m.available)).toBe(true);
  expect(result.status).toBe('COMPLETED');
  expect(request.model).toBe('account-model');
  expect(request.input.find((i) => i.role === 'developer')?.content).toContain(
    targetProjectId,
  );
  expect(serializedRequest).not.toContain('other-project-secret');
  expect(mismatchedModelAnswer.answer).toBeNull();
  ```

- [ ] **Run RED:** `pnpm --filter @galaxy/api exec vitest run src/project-chat/ai-chatgpt-service.test.ts src/project-chat/ai-registry.test.ts src/project-chat/ai-chatgpt-plan.test.ts --no-file-parallelism --poolOptions.forks.singleFork`. Expected failure outside allowlist/new scope, không phải missing test environment.
- [ ] **Fix pilot:** xóa `chatGptProjectAllowed()` và bốn call sites ở catalog/ask/view/run, giữ `authorized`/owner/model/source checks. Catalog hợp lệ available thật; key pilot env không được đọc ở branch mới. `rg` xác nhận không còn production caller của predicate; env rollback không đổi.
- [ ] **Pin/context:** request parser discriminated versions1/2, v2 chỉ SIWC với policyVersion/scope và historyAnswerIds. Ask v2 pin server scope; claim/run/view đối chiếu scope với row/actor/Project, không nâng version1 bằng dữ liệu client. `projectContext` lấy DB Project name, actorId/displayName/conversation, permission read đã recheck; JSON dữ liệu đặt sau chỉ dẫn không tin nội dung tên/nguồn làm instructions. Prompt cho phép kiến thức chung và `task_list` đúng quyền. Exact model request/returned mismatch thành lỗi `MODEL_MISMATCH`, không COMPLETED. Không đổi history8turn ở task này.
- [ ] **GREEN:** chạy lại lệnh RED, `pnpm --filter @galaxy/api typecheck`; tests existing disconnect/revoke/stream missing completed/pinned history vẫn đạt. Review diff chỉ P1-A, không thêm capability chưa có evidence.

### Task 2: Chứng minh backend và UI đa Project không bỏ ACL

**Files:** Create `apps/api/test/p1-project-ai.integration.test.ts`, `apps/web/tests/browser/p1-project-ai.spec.ts`; Modify fixtures/config M2, `project-ai.test.tsx`, `project-ai-surfaces.tsx`/`project-ai.tsx` chỉ nếu test phát hiện lỗi scope. Reuse actual IAM/session/PostgreSQL và codec SSE.

**Interfaces:** Task 1 endpoints `/api/v1/project-chat/projects/:id/ai` và conversations/answers/run; frontend `aiSessionKey(projectId,scope,context)` và pinned model hiện hữu. Fixture transport dùng synthetic SIWC connection trong DB fixture, không owner credential main.

- [ ] **RED integration:** fixture T1 owner có INVOKE/permission ở A ACTIVE và B PLANNING không room; C denied, T2 denied, actor có Galaxy INVOKE nhưng không owner plan denied, permission/action scope không được ghép từ hai binding. A/B GET catalog→create conversation→ask→run→history phải đúng Project/model/completed; C trả404/403 theo contract và0provider call. Revoke sau claim/trước publish phải answer hidden/failed. Assert:

  ```ts
  expect(a.body.models.map((m) => m.id)).toEqual(
    b.body.models.map((m) => m.id),
  );
  expect(doneB.body.status).toBe('COMPLETED');
  expect(deniedProviderCalls).toBe(0);
  expect(historyBText).not.toContain('sentinel-A');
  ```

- [ ] **RED UI/browser:** chọn exact model ở B, chuyển A→B→A, reload và hai tabs; delay response A sau khi mở B, không xuất A trong B hoặc POST trùng. Unit assertions `expect(screen.queryByText('sentinel-A')).not.toBeInTheDocument()` ở B; browser kiểm request Project/conversation/model thật. Fixture network chặn public ngoại trừ stub official SIWC endpoint, có `response.completed`, gắn nhãn FIXTURE.
- [ ] **Verify RED / correct smallest caller:** API `pnpm --filter @galaxy/api exec vitest run test/p1-project-ai.integration.test.ts --no-file-parallelism --poolOptions.forks.singleFork`; Web `pnpm --filter @galaxy/web exec vitest run features/project-chat/project-ai.test.tsx features/project-chat/project-chat.test.tsx`. Nếu original scope logic đã đạt, giữ nguyên code UI và thêm regression; chỉ sửa failure có root cause.
- [ ] **GREEN browser:** fixture API/Web đúng candidate build trên33001/33002, guard M3; `pnpm --filter @galaxy/web exec playwright test --config=playwright.m2.config.ts p1-project-ai.spec.ts`. Thêm tên test trong testMatch. Chrome thiếu: triển khai/test API/Web tiếp tục; bundled Chromium legacy config chỉ supplementary, không gọi M2/main acceptance PASS. Dùng Chrome có sẵn hoặc manual exact artifact để hoàn tất gate, không mở CDP/network mới.
- [ ] **Review:** chứng minh0business writes, owner generation không đổi trong fixture inference, source/tool/output recheck; không self-grant, không private context copy giữa surfaces. Ghi riêng unit/integration/browser fixture.

### Task 3: Full gates, live và release P1-A độc lập

**Files:** immutable source/artifact/evidence tại `/home/galaxy_os/.runtime/p1-a-20261009/`; reuse `scripts/prepare-local-release.py`, runtime manifest/control plane; cập nhật STATUS/handoff sau kết quả thật. Không product changes P1-B trước snapshot A.

**Interfaces:** Task 1–2 validated source; existing prepared release/manifest/units. Produces `P1_PROJECT_AI=PASS` chỉ khi artifact được phục vụ và main acceptance hai Project completed đúng model; rollback artifact cũ và schema86 giữ.

- [ ] **Fresh full checks:** fixture guard đúng DB/storage; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check`. Chạy tuần tự theo dependency, lưu exit/count/source fingerprints; failure áp dụng systematic-debugging, không nới ACL/timeout hoặc sửa unrelated code cho xanh. Không chạy all tests với main DB.
- [ ] **Request review:** sau checks, invoking requesting-code-review để reviewer mới kiểm diff P1-A cùng source callers, rồi Ponytail lean/correctness/security/auth/UX review. Sửa findings phạm vi P1-A và chỉ rerun checks bị ảnh hưởng. Không merge/commit/PR.
- [ ] **Prepare one artifact:** dùng `python3 scripts/prepare-local-release.py build --output <new-private-p1a-release-path> --manifest <verified-current-manifest-path>`; các path lấy từ runtime hiện hành, không từ report cũ. Freeze/test source, hash artifact và record CODE_SHA + TESTED_TREE/digest đúng snapshot; production bundle không credential. Backup DB/manifest/units đủ rollback, kiểm restore dump trên DB cô lập; giữ storage/host key private, không copy vào artifact.
- [ ] **Candidate acceptance/live:** exact candidate build/browser và SIWC live bằng owner session/entitlement thật; dùng Showroom `50000000-0000-4000-8000-000000000003` và Ecopark `50000000-0000-4000-8000-000000000001`, hoặc hai Project thật còn quyền sau recheck. Cùng selected slug có trong catalog; hỏi Project name/ID, SQL JOIN, Task hiện có; trace requested/returned/model, tool execution khi cần, `response.completed`, latency,0reconnect và0business writes. Negative fixture C không gán thành main denied. Không tự tạo session/Project/grant main hoặc đọc cookie/token để thay login hợp lệ.
- [ ] **Cutover/smoke/rollback:** đủ gate mới cài artifact bằng control plane hiện hữu với schema86/env/connection nguyên trạng; main hai Project completed và reload/two-tab đúngscope, `pnpm local:status`/`pnpm prod:verify-artifacts` khớp manifest/artifact. Bất kỳ gate bắt buộc thiếu thì BLOCKED giữ artifact cũ, tiếp tục code P1-B sau approval plan nhưng không báo A live PASS. Smoke fail rollback app về `local-bf73047fa0ee`, không DB restore/drop. Handoff ghi source files/tests/live receipt/artifact/functional availability,16states và blocker duy nhất cần user nếu có.

## P1-B — memory, history và isolation

### Task 4: Additive memory schema và migration có scope constraints

**Files:** schema, migration mới đúng path trong file map; Create `apps/api/test/p1-project-memory.integration.test.ts` (database constraint section). Không sửa applied migrations/seed quyền.

**Interfaces:** Produces ChatAiMemory/Revision/Dependency/AnswerMemoryDependency theo spec4, composite keys `[id,organizationId,projectId]`, creator/editor membership và summary conversation-owner FK. Dependencies typed fields `answerSourceId`, `messageSourceId`, `indexSourceId`, `memorySourceRevisionId` nullable; TASK/PROJECT_RECORD dùng sourceId+server resolver. CHECK đúng kind, typed ID bằng sourceId, không có typed field thừa. Summary revision có unique `[organizationId,projectId,inputDigest]`; inputDigest bao gồm actor/conversation/model/policy/covered IDs/source versions, NOTE có inputDigest null.

- [ ] **RED database tests:** valid NOTE/revision insert phải thành công trước thử malformed source. Assert cross-Project/cross-tenant revision/answer-source/summary-owner FK reject; PRIVATE summary bắt buộc conversation, enum/version/content limits hợp lệ. `expect(validInsert).resolves...` và `expect(forgedInsert).rejects...`; lỗi thiếu table là RED của validInsert, không là green security test.
- [ ] **Run RED:** fixture guard, `pnpm --filter @galaxy/api exec vitest run test/p1-project-memory.integration.test.ts --no-file-parallelism --poolOptions.forks.singleFork`; không apply trên main.
- [ ] **Generate/review SQL:** fixture-only `pnpm --filter @galaxy/api prisma:migrate --create-only --name p1_project_ai_memory`; dừng nếu reset requested. Tên folder dùng timestamp CLI nếu khác tên dự kiến và cập nhật plan/evidence path, không rename applied migration. Tables/relation fields theo spec, revision content không lưu lặp ở head; unique version/clientKey/dependency(locatorHash), scope/read index. Không backfill conversation thành shared memory hoặc sửa nghiệp vụ.
- [ ] **Apply/generate/GREEN:** fixture `prisma:deploy`, `prisma:validate`, `prisma:generate`, rồi lệnh RED và `prisma:status`; reapply deploy no-op. Rehearsal schema additive tương thích artifact P1-A, kiểm lock/time và rollback app giữ tables. Backup/main migrate deploy chỉ ở Task 9 sau toàn gate.
- [ ] **Review migration:** FK/checks đủ tenant/project, không destructive SQL, không grant tự động. Lưu SQL hash và verification fixture; schema main vẫn86 trong lúc phát triển.

### Task 5: Memory CRUD, provenance, ACL và API thật

**Files:** new memory service/unit test; controller/DTO/module/ProjectAiService facade; AuditService và `apps/api/test/sprint1.integration.test.ts` audit assertions; memory integration file Task4. Constructor callers theo file map.

**Interfaces:** MemoryService `list(tx,scope,query:MemoryQuery,resolve):Promise<MemoryPage>`; `read(tx,scope,id,version:number|undefined,resolve):Promise<MemoryView>`; `revisions(tx,scope,id,query:MemoryQuery,resolve):Promise<MemoryPage>`; `create(tx,scope,input:MemoryWriteInput,resolve):Promise<MemoryView>`; `update(tx,scope,id,input:MemoryChangeInput,resolve):Promise<MemoryView>`; `inactivate(tx,scope,id,input:MemoryInactiveInput):Promise<{id:string,status:'INACTIVE',version:number}>`; `search(tx,scope,input:{query:string,visibility:'PRIVATE'|'SHARED'|'ALL',limit:number},resolve):Promise<MemoryView[]>`. tx/scope/resolve có types ở interface block chung. ProjectAiService facade `memoryList`, `memoryRead`, `memoryRevisions`, `memoryCreate`, `memoryUpdate`, `memoryInactive` nhận actor/projectId và DTO tương ứng, dùng `authorized` rồi delegate; `private resolveMemorySource(tx, scope, ref):Promise<MemorySourceProof>` nối source policies hiện hữu, không circular service injection.

- [ ] **RED CRUD/security:** private X tại A, Y tại B và actor2; POST idempotent cùng clientKey/hash, khác hash409; PATCH cùng expectedVersion hai requests chỉ một200/một409, old revision content không đổi; inactive sau source revoke vẫn thành công theo owner/PUBLISH, retrieval không có X. Assert `expect(statuses.sort()).toEqual([200,409])`, `expect(bText).not.toContain('X-private-A')`, `expect(actor2Text).not.toContain('X-private-A')`.
- [ ] **RED source/publication/audit:** SHARED thiếu scoped chat.publish/PUBLISH403; reader phải có INVOKE/project.read và mọi source ACL; publishFrom chỉ private NOTE chính actor/currentVersion, summary/actor khác rejected. Giữ financial/file/room deps; không trả private origin ID trong source/citation/audit feed. SourceChanged409/STALE, query wildcard/cursor khácscope không oracle. Audit throw rollback; logs/beforeData/afterData không content. DAG cycle/node budget exceeded denied, không skip dependency.
- [ ] **Run RED:** unit mới và `test/p1-project-memory.integration.test.ts`, cùng Vitest single-fork args của Task4. Unit kiểm pure hashing/DTO; PostgreSQL integration kiểm session/IAM/scopes/CAS/transaction, không gán mock thành backend proof.
- [ ] **Implement service/resolver:** immutable revisions + CAS + idempotency/hash, source validation ngay trước write/read; callback FILE_INDEX dùng `sourceScope`/`checkSource`, AI_ANSWER dùng `ownedAnswer`/`view` + expanded original dependencies, CHAT_MESSAGE dùng room READ/history, TASK dùng Task service scope/version, PROJECT_RECORD chỉ existing `stage_two_plan` contract với ProjectId và Decimal string/field permissions, MEMORY_REVISION cùng scope và recursive ACL. SOURCE_CONFIRMED chỉ từ canonical approved status, không từ AI answer/note. Visited set/DAG bounded, vượt resource error explicit. Private-derived nguồn không được bỏ khi công bố; plain USER_INPUT chọn để publish là explicit new note và origin audit riêng.
- [ ] **Implement endpoints/lookup:** `/memory` GET/POST, `/:memoryId` GET/PATCH/DELETE, `/revisions` GET theo spec6. Strict DTO/Zod, enums/limits globalconstraints; no org/actor override. Lexical query reuse `sourceTokens`, parameterized Prisma SQL, filter memory scope rồi validate source trước excerpt/rank/count/nextCursor. Cursor chứa last visible id/time và visibility, recheck scope; không cursor của denied row. Thiếu read trả opaque404, known forbidden publish403, stale/idempotency/version409. Audit events entityType ChatAiMemory metadata/hash only; exclude cả organization/system audit feed, revision feed đi qua memory ACL.
- [ ] **GREEN:** targeted unit/integration + API typecheck; verify private management không gọi owner resolver/OpenAI, staff Galaxy rights không tự có inference. Bất kỳ publish không đủ thẩm quyền giữ UNVERIFIED/USER_CONFIRMED; không sửa official approval.

### Task 6: Token history assembler và summary worker đúng conversation

**Files:** `ai-history.ts`/test, `project-ai-history.service.ts`/test, ProjectAiService history/run/view pin integration, `ai-registry.ts`/tests; dependency/lockfile chỉ nếu tokenizer verified cần thiết; memory integration thêm worker tests.

**Interfaces:** `ModelHistoryProfile={model,contextTokens,outputReserveTokens,tokenizerVersion,evidence}`; verified profile hoặc null, không capacity giả. `assembleHistory(input:HistoryAssemblyInput):HistoryAssembly` pure, output `{inputItems,usedAnswerIds,summaryRevisionIds,memoryRevisionIds,budget}`. Inputs gồm mandatory question/context/tools, visible turn candidates, summary/note candidates, profile/countTokens và actual wire limits. HistoryService `assemble(scope,answer,signal,callbacks):Promise<HistoryAssembly>` và `search(tx,scope,query,limit,resolve):Promise<HistoryHit[]>`; callbacks dùng authorize/source/model respond hiện hữu, chỉ server.

- [ ] **RED budget/lineage:** 12 lượt ngắn đủ budget phải giữ hơn8, lượt cũ X vẫn retrieve sau compaction; mandatory question quá budget trả INPUT_BUDGET_EXCEEDED, Unicode/byte/items toàn wire vượt thì không serialize. Freeze candidates lúc ask, không thêm later completed turn; version1 thiếu causal history không được nâng thành trusted v2/v3, v2 của P1-A vẫn đọc theo semantics cũ. Assert `expect(assembly.usedAnswerIds.length).toBeGreaterThan(8)`, `expect(used).not.toContain(laterId)`, `expect(revokedSummarySent).toBe(false)`, `expect(unknown.budget.status).toBe('UNVERIFIED')`.
- [ ] **RED worker:** A/B/conversation/owner scopes, lease token mất, duplicate job inputDigest, concurrent update/inactive/revoke trước write; summary chưa completed không READY. `expect(staleWorkerWrites).toBe(0)`; sourceVersion changed và lost reader permission không đánh dấu shared note stale toàn cục. Không mixed encrypted continuation/hidden reasoning vào summary.
- [ ] **Run RED:** new history tests + SIWC service tests + memory integration, Vitest commands single fork như Task4/5; profile/tokenizer test có Unicode/numeric examples và measured usage calibration, không chấp nhận char/4 là token actual.
- [ ] **Verify capability/implement packer:** đối chiếu metadata/tài liệu chính thức cho đúng selected slug, probe input usage/route limits qua SIWC hiện hữu; record redacted evidence theo model, không token/catalog lifecycle change. Nếu encoding xác minh được, dùng tokenizer library nhỏ/pinned và tests; nếu không, giữ profile null/UNVERIFIED và explicit limitation, không chặn A. Packer theo spec8: count full expanded body/schema/instructions; reserve25%/>=4096 + documented output requirement; recent complete pairs, scoped summaries, relevant memory/old-turn retrieval, dedup, byte/item guards. Continuation opaque dùng conservative bound/evidence, không giả exact token count hidden reasoning.
- [ ] **Implement summary/history persistence:** summary PRIVATE/conversation UNVERIFIED, source/turn IDs do server ghi. Batch theo budget với inputDigest+model+policy, dùng same selected model đến response.completed, không giữ Project lock trong network. Summary job dùng lease của RUNNING ChatAiAnswer và UUID token trong usage.summaryJob server-only; token/scope/grant/lease phải còn khớp trước write, không thêm worker infrastructure hoặc ghi draft revision giả. Final transaction tạo head/revision/deps cùng nhau; unique inputDigest xử lý duplicate job, read cached summary vẫn recheck ACL. Server giữ toàn lineage nguồn gốc; khi dùng summary cũ không coi nó là nguồn xác nhận mới, không self-cycle. Revoke/stale loại summary và tạo lại chỉ từ turn còn quyền, originals vẫn tồn tại. Không worker của staff dùng owner credential.
- [ ] **Integrate used lineage/GREEN:** P1-B dùng request metadata version3 với scope/policy như v2 và `historyAnswerIds` frozen candidates; v1/v2 parser/causal semantics vẫn giữ, không sửa old rows. `usage.execution:AiConsumedContext` do server ghi trước egress và memory/summary deps trong DB. Thêm `executionMetadata(usage:unknown):AiConsumedContext|null` trong ai-registry dùng Zod strict; completed v3 thiếu proof hoặc scope/answer/grant sai bị hidden, không coi missing proof là empty history. View v3 recheck consumed inputs; không đưa denied candidate vào model hoặc giữ chúng thành hidden context. Không gom tất cả savedToolSources của mọi turn vào mảng12source hiện hữu: history/memory lineage trong deps, toolSources chỉ current execution; tránh đổi8turn thành lỗi12source. Run RED tests/typecheck, lưu missing profile/live như blocker P1-B, không báo history/model PASS từ fixture.

### Task 7: SIWC memory/history tools, reinjection và citations

**Files:** `ai-tools.ts`/test, `ai-chatgpt-plan.ts`/test, ProjectAiService dispatcher/view/citation, service tests và memory integration. Memory/history callbacks từ Task5/6, không mở business writes hoặc keyed web.

**Interfaces:** `search_project_memory({query,visibility,limit})`, `read_project_memory({memoryId,version})`, `search_conversation_history({query,limit})` inputs strict theo spec6.2. Output memory/history handle có server scope/revision/locator; `ChatAiAnswerMemoryDependency` pin consumed revisions, consumed history IDs trong usage.execution của requestv3. Citation route hiện hữu resolve type mới theo ACL, không dùng URL/handle bịa của model.

Memory/history citations lưu ở `usage.memoryCitations` dưới type `MemoryCitationRef={handle:string,label:string,kind:'MEMORY'|'HISTORY',memoryRevisionId?:string,historyAnswerId?:string}`: Zod strict và đúng một ID theo kind. Handle T_SHA24 do backend tạo từ execution scope + revision/answer ID + version; resolver kiểm DB dependency/consumed proof của answer trước đọc. Không gán memory thành AI_DRAFT/PUBLIC_WEB trong ToolSource cũ, không đưa toàn lịch sử vào mảng savedToolSources12. Citation metadata không lưu thêm bản sao memory content, legacy task/web source codec giữ nguyên. Task7 định nghĩa/validate MemoryCitationRef trong ai-tools; Task8 dùng API citation presentation, không tin private source ID của frontend.

- [ ] **RED executor:** codec advertises tools đúngnamespace, model call→service query thật→function_call_output đúngcall_id→inference tiếp đến completed. Fake projectId/org/actor args bị reject; malformed/unknown handle hoặc out-of-Project memory không đọc. Tool response deny/revoke trước reinjection không đưa text vào network; mock transport chỉ kiểm protocol, integration kiểm executor/IAM thật.
- [ ] **Assertions:** `expect(toolCallsExecuted).toBeGreaterThan(0)`, `expect(secondRequest.input).toContainEqual(expect.objectContaining({type:'function_call_output',call_id:'memory-call'}))`, `expect(secondRequestText).not.toContain('sentinel-B')`, `expect(revokedCitation.status).toBe(404)`.
- [ ] **Run RED:** Vitest `ai-tools.test.ts`, `ai-chatgpt-plan.test.ts`, `ai-chatgpt-service.test.ts`, memory integration single fork. Existing namespace/task/calculation/write contracts phải không hỏng hoặc vô tình được advertise trên SIWC.
- [ ] **Implement dispatcher/proofs:** register3readtools, permission capabilities recheck, bound immutable scope; memory search batch<=16KB, read<=8.000chars, history excerpts có provenance. Rebudget từng round theo Task6, không cắt JSON/orphan call_id; limits/timeout hiện hữu trả error đúng và không retry vô hạn. Pin DB memory deps/used history trước egress, recheck trước COMPLETED và history/citation read. UI nguồn luônserverhandle; missing/invalid nguồn không fake citation.
- [ ] **GREEN/integration:** source grant/version hoặc memory inactive giữa tool read/reinjection/final publish đều hidden/failed, derived answer không lộ qua reload/citation. Exact model/response.completed receipt còn đủ. Project A/B simultaneous execution gắn đúng answerProject, không global cache. Không dump request text vào audit/log.

### Task 8: UI memory và context switching có thể sử dụng

**Files:** new `project-ai-memory.tsx`/test, `project-ai.tsx`/test, surfaces nếu cần, new browser memory test/config; browser fixture memory handlers khớp API Task5, không static-success thay server result.

**Interfaces:** Component `ProjectAiMemory({projectId,conversationId,onMemoryChanged})`, scope-local fetch/abort và MemoryView API shape. Existing AI message panel/citation links và controls được reuse; shared/private UI state riêng mỗi Project, không singleton cache.

- [ ] **RED UI:** mặc định private; create/update/inactive chỉ hiển thị sau server ack; giữ draft khi lỗi409/403; SHARED phải preview/click “Công bố”, summary không có nút publish. “USER_CONFIRMED” là ghi chú người dùng xác nhận, không nhãn quyết định đã duyệt. Memory delete nói inactive/audit giữ. Assert `expect(sharedPostCount).toBe(0)` trước click publish, `expect(draft).toBe(originalDraft)` sau lỗi, `expect(screen.queryByText('sentinel-A')).not.toBeInTheDocument()` ở B.
- [ ] **Run RED:** Web Vitest `project-ai-memory.test.tsx`, `project-ai.test.tsx`, `project-chat.test.tsx`; browser memory flow khi backend Task5/7 chạy được.
- [ ] **Implement panel:** hai tabs private/shared, search/list/detail/revision/provenance/edit/inactive; canEdit từserver, backend vẫnauthorize. onMemoryChanged invalidate context/list scope đúng, không lưu nội dung source denied trongcache. Conversation memory summary hiển thị riêng đúng conversation; thiếubudget/source chỉ báo khi ảnh hưởng trả lời, không đưa diagnosticimplementation vào flow thường.
- [ ] **GREEN race/browser:** exact build fixture API33001/Web33002; `playwright test --config=playwright.m2.config.ts p1-project-memory.spec.ts`; switch liên tục, reload, hai tabsA/B, late stream/update, same-version conflict, revoke/inactive và0POST trùng. Desktop/mobile375 và keyboard focus/labels, no overflow. Missing browser evidence ghiBLOCKED, không sửa network/OAuth.
- [ ] **Review UX/ACL:** người có quyền đọc nguồn xem citation revision thật; actor khác không nhìn private notes hoặc private origin audit. Không hiện reconnect khi đổi Project, không room bắt buộc, no capability claim chưa có evidence.

### Task 9: Security regression, migration main và release P1-B

**Files:** final integration/browser acceptance sections, current release manifest/evidence tại `/home/galaxy_os/.runtime/p1-b-20261009/`, STATUS/handoff. Không commit/push hoặc chuyển sang P2/P3 implementation chưa đủ gates của chúng.

**Interfaces:** Task4–8 source đã test; rollback về artifact P1-A đã nghiệm thu. Produces private/shared/history/tools/isolation PASS chỉ trên đúng artifact/main evidence tương ứng, còn model/profile/session unavailable ghi riêng.

- [ ] **Backend acceptance:** fixtureT1/T2, X@A/Y@B qua conversation mới, hỏiX@B không lộ; private actor2 denied; shared publication có PUBLISH và dependencyintersection; source/version/session/IAM revoke sau cache/read/job và trước output; crossscope cursor/locator/cycle, Decimal/unit chính xác. Recheck không business canonical mutation. Không chỉ kiểm UI hoặc mock.
- [ ] **Fresh full gates/review:** `pnpm lint/typecheck/test/build/format:check` là năm lệnh riêng trong fixture env đúng; `prisma:validate/generate/status`, diff--check và targetedbrowser đạt. Request fresh code review + Ponytail correctness/security/auth/UX; verify whole P1 diff kể cả dependency/callers/audit, không chỉ files mới. Profile/model nào chưa chứng minh live thì không claim advanced history của model đó.
- [ ] **Prepare/backup/apply safe:** freeze/hash verified P1-B source và chuẩn bị đúng một candidate trước main mutation; fresh DB backup/schema/manifest/units/hash, restore rehearsal cô lập và review migrationSQL/lock impact. Chuẩn bị compatibility manifests đã review cho cả candidate P1-B và fallback P1-A với expectedSchema additive mới. Main `prisma:deploy` với envguard/backup đãverified, không migrate dev/db push; kích hoạt compatibility manifest tương ứng trong cùng release window và kiểm API/control plane P1-A vẫn READY với schema mới. Không dùng manifest86 làm rollback sau khi migration đã applied, không nới runtimevalidator hoặc sửa bundle P1-A.
- [ ] **Candidate live:** owner privateX/Y trong hai Project thật qua conversation mới, history/summary >8turn và memory tool actual execution/completed/citation. Shared read/manage main qua actor có quyền và phiên thật, không mở plan staff; thiếu phiên thì ghi main acceptance BLOCKED/NOT_RUN riêng. Test sentinels private không nhạy cảm; inactive sau acceptance bằngAPI, audit/history giữ. Browser missing không biến fixture thànhmainPASS. Nếu live gate chưa đạt sau safe additive migration, main tiếp tục P1-A với compatibility manifest mới, memory data và candidate được giữ, không restore/drop để về schema86.
- [ ] **Cutover/main/rollback/report:** tất cả gate bắt buộc đủ mới phục vụ P1-B, main smoke rechecksProjectscope/model/consumed sources/memorymanager/history; runtime/artifact/schema hashes khớp, `prod:verify-artifacts`/`local:status` đạt. Rollback chỉ app về P1-A, giữ additive schema/revisions/notes và source dữ liệu. Ghi đủ16states, CODE_SHA/TESTED_TREE/worktree/artifact/sourcechanges/tests/live trace redacted/limitation. Sau P1 tiếp tục spec/planapproval P2 và P3, không mở lại conceptual brainstorming đã duyệt.

## Self-review và acceptance ledger

| Spec sections                          | Tasks cover               |
| -------------------------------------- | ------------------------- |
| 1–3: scope/pilot/context/model/live    | 1–3                       |
| 4: data/revisions/provenance           | 4–5                       |
| 5–6: ACL/API/private/shared/tools      | 5/7/8                     |
| 7: stream/cache/worker/isolation       | 2/5–8/9                   |
| 8: history/token/summary/retrieval     | 6–7                       |
| 9: UI/draft/mobile/switch              | 2/8                       |
| 10–11: migration/test/release/rollback | 3/4/9                     |
| 12: review/gates/unknown capabilities  | header/Review Focus/3/6/9 |

Self-review revision1: interfaces/producer-consumer names thống nhất; đủ scope/ACL/legacy/worker/audit/cursor/wire cases, checkbox steps có RED/GREEN commands và evidence. Không placeholder chức năng hoặc code body viết thay implementation. Resource/profile/Chrome/session chưa có evidence là gate thực thi có trạng thái rõ, không spec approval mới và không chặn releaseA vì phầnB. Spec hash giữ nguyên, method CodexCLI đã chọn. Không thêm commit steps do owner/AGENTS chưa cấp quyền commit.

Gate còn lại trước Task1: owner review đúng written plan revision1 này. Theo [writing-plans SKILL.md](/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/writing-plans/SKILL.md): “wait for that review before implementation, then use the preserved method.” Khi plan được duyệt, invoke executing-plans và TDD Task1 ngay; không hỏi lại thiết kế/spec/method hoặc tách approval cùng plan thành nhiều câu hỏi. Runtime hiện vẫn READY `local-bf73047fa0ee`; plan không là bằng chứng AI đa Project/memory đã được viết hoặc phát hành.
