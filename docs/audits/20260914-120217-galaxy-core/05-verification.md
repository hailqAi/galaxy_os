# Bằng chứng kiểm thử và giới hạn

## Môi trường

- SHA: `e42390ce2e10ff310708a2be5e1e321854aaff3b`.
- Worktree kiểm thử detached: `/tmp/galaxy-core-audit-20260914-120217`.
- Node `v20.20.2`; pnpm `10.33.4`; Git `2.34.1`; Python `3.10.12`; pytest `8.4.1`; Prisma CLI/client `6.19.0`; Next `16.2.10`; Vitest `3.2.6`.
- Dependency: `pnpm install --offline --frozen-lockfile`, 801 packages reused, không download; sau đó `pnpm db:generate`. Không nâng package, không đổi lockfile.
- Prisma validate dùng URL loopback giả đã che: `postgresql://audit:***@127.0.0.1:65432/galaxy_audit`; không có server ở đích và validate không kết nối DB.
- API unit dùng cùng dummy `DATABASE_URL` chỉ để thỏa environment parser. Bộ `src` dùng mocks, không chạy `apps/api/test/*.integration.test.ts`.
- Web production build dùng giá trị giả an toàn: `TRUST_PROXY=true`, `APP_PUBLIC_ORIGIN=https://audit.invalid`, `NEXT_PUBLIC_API_URL=/api/v1`, `INTERNAL_API_URL=http://127.0.0.1:3001/api/v1`.
- Các test cần bind loopback được chạy ngoài network sandbox sau khi lần sandbox đầu báo `EPERM`; không có kết nối external.

## Kết quả cuối theo clean install

| Thời gian +07     | Thư mục       | Lệnh                                                                                                                               | Exit | Kết quả                                                                                        |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---: | ---------------------------------------------------------------------------------------------- |
| 12:18:04–12:18:10 | worktree root | `pnpm db:generate`                                                                                                                 |    0 | Prisma Client 6.19.0 generated; không kết nối DB                                               |
| 12:19:40–12:19:42 | worktree root | `DATABASE_URL=<dummy-loopback> pnpm --filter @galaxy/api exec prisma validate --schema prisma/schema.prisma`                       |    0 | Schema valid                                                                                   |
| 12:21:47–12:22:01 | worktree root | `pnpm lint`                                                                                                                        |    0 | ESLint API/Edge/Web và Ruff pass                                                               |
| 12:12:41–12:12:53 | worktree root | `pnpm format:check`                                                                                                                |    1 | FAIL: 6 file có trước audit không đúng Prettier; không chạy write; danh sách ngay dưới bảng    |
| 12:19:18–12:19:33 | worktree root | `pnpm typecheck`                                                                                                                   |    2 | FAIL sau clean install: API thiếu namespace `Express.Multer`; Web/Edge pass                    |
| 12:21:18–12:21:25 | worktree root | `DATABASE_URL=<dummy-loopback> pnpm --filter @galaxy/api exec vitest run src --no-file-parallelism --poolOptions.forks.singleFork` |    0 | 48 files, **991 tests pass**                                                                   |
| 12:21:38–12:21:41 | worktree root | `pnpm --filter @galaxy/web test`                                                                                                   |    0 | 29 files, **503 tests pass**, browser excluded theo script                                     |
| 12:21:38–12:21:39 | worktree root | `pnpm --filter @galaxy/edge test`                                                                                                  |    0 | 1 file, **4 tests pass**                                                                       |
| 12:15:03–12:15:04 | worktree root | `services/document-ai/.venv/bin/pytest services/document-ai`                                                                       |    0 | **1 health test pass**; không chứng minh AI integration                                        |
| 12:18:20–12:18:43 | worktree root | production env giả + `pnpm build`                                                                                                  |    1 | Web build pass 78 routes; Edge build pass; API build FAIL 7 source references `Express.Multer` |

Tổng unit/health pass mới: **1.499 tests** (991 API + 503 Web + 4 Edge + 1 Python). Đây là tổng case runner báo pass, không phải tỷ lệ hoàn thành nghiệp vụ và không bao gồm integration/browser.

Sáu path format fail chính xác:

- `apps/api/src/me.service.test.ts`
- `apps/api/src/me.service.ts`
- `apps/web/app/settings/users/[userId]/user-detail.tsx`
- `docs/superpowers/plans/2026-08-11-stage-one-governance-required-documents-rebuild.md`
- `docs/superpowers/plans/2026-08-12-simplified-stage-one-multifile.md`
- `docs/superpowers/plans/2026-08-14-optional-documents-stage2-plan.md`

## Các lần chạy chẩn đoán không dùng làm kết quả cuối xanh

1. Lint/typecheck ban đầu dùng node_modules cũ của cây chính và pass. Sau clean frozen install, typecheck fail; kết quả sạch mới là authority. Cây cũ có `apps/api/node_modules/@types/multer` nhưng dependency không nằm trong importer package/lockfile.
2. API unit lần đầu trong sandbox: 988 pass/3 fail vì Supertest bị cấm `listen 0.0.0.0`; chạy lại ngoài sandbox pass 991/991.
3. Edge unit trong sandbox fail `EPERM`/timeout; chạy lại ngoài sandbox pass 4/4.
4. Python health trong sandbox treo và bị interrupt exit 130; chạy lại ngoài sandbox pass.
5. Web build lần đầu thiếu production env và fail đúng guard `TRUST_PROXY must be true`; lần hai dùng symlink dependency ra ngoài worktree và Turbopack chặn; sau offline clean install, build Web pass. Hai lỗi đầu là môi trường audit, không phải finding ứng dụng.
6. API unit sau clean install nhưng chưa đặt dummy DATABASE_URL: 816 pass/175 fail vì environment parser; chạy lại với dummy loopback pass 991/991. Không có DB call trong phạm vi `src` đã chọn.

## Quan sát bổ sung về authorization

Ngoài test repository, kiểm toán chạy năm reproduction memory-only bằng code TypeScript thật và mocked persistence, không tạo file regression:

- Search Project mất actor predicate: `RUNTIME_VERIFIED`.
- Actor tier 80 sửa metadata role protected tier 100: `RUNTIME_VERIFIED`.
- Sửa marketing variant khi content `SCHEDULED`: `RUNTIME_VERIFIED`.
- Notification mutation trả raw body khi target authorization từ chối: `RUNTIME_VERIFIED`.
- Customer payment nhận amount/rate âm và trừ nominal USD khỏi schedule VND: `RUNTIME_VERIFIED`.

Các reproduction này chứng minh branch/service behavior, không chứng minh HTTP/DB/production exploit. Finding audit-log finance, cross-tenant campaign, idempotency và concurrency còn `STATIC_ONLY`.

### Lệnh tái chạy bốn reproduction authorization

Chạy tại `/home/galaxy_os/apps/api`, exit `0`; script transpile TypeScript trong RAM, không tạo `PrismaClient`, file hay kết nối DB:

```bash
node <<'NODE'
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }).outputText, filename);
const { BusinessEntityPolicy } = require('./src/access-control/business-entity.policy.ts');
const { UserManagementPolicy } = require('./src/access-control/user-management.policy.ts');
const { SearchController } = require('./src/search/search.controller.ts');
const { RolesService } = require('./src/roles/roles.service.ts');
const { MarketingService } = require('./src/marketing/marketing.service.ts');
const { NotificationsService } = require('./src/notifications/notifications.service.ts');
(async () => {
  const actor = { userId: 'actor-A', organizationId: 'org-A', permissions: ['search.read', 'project.read', 'role.update', 'marketing.content.update', 'notification.read'], permissionSources: [{ permission: 'project.read', scopeType: 'SELF' }], roles: [], departmentIds: [], managedDepartmentIds: [], administrationScope: 'ORGANIZATION', administrationTier: 80 };
  const empty = { findMany: async () => [], count: async () => 0 };
  let searchWhere;
  const searchDb = { lead: empty, opportunity: empty, task: empty, project: { findMany: async ({ where }) => { searchWhere = where; return []; }, count: async () => 0 } };
  const entities = new BusinessEntityPolicy(searchDb);
  const beforeWhere = entities.projectWhere(actor);
  await new SearchController(searchDb, entities).search(actor, { q: 'secret', entityTypes: ['Project'], page: 1, pageSize: 10 });
  console.log('SEARCH', JSON.stringify({ beforeWhere, actualWhere: searchWhere }));
  const protectedRole = { id: 'system-role', organizationId: 'org-A', code: 'system_admin', isProtected: true, isSystem: true, administrationTier: 100, maximumScope: 'SYSTEM' };
  const roleDb = { role: { findFirst: async () => protectedRole, update: async ({ data }) => ({ ...protectedRole, ...data }) } };
  roleDb.$transaction = async (work) => work(roleDb);
  const roleResult = await new RolesService(roleDb, { write: async () => {} }, new UserManagementPolicy(roleDb)).update(actor, 'system-role', { administrationTier: 1, maximumScope: 'SELF' });
  console.log('ROLE', JSON.stringify(roleResult));
  let variantWrite;
  const marketingDb = { contentItem: { findFirst: async () => ({ id: 'content-A', organizationId: 'org-A', status: 'SCHEDULED' }) }, contentVariant: { upsert: async (input) => { variantWrite = input; return input.update; } } };
  const marketing = new MarketingService(marketingDb);
  let contentException;
  try { await marketing.updateContent(actor, 'content-A', { title: 'changed' }); } catch (error) { contentException = error.message; }
  const variantResult = await marketing.variant(actor, 'content-A', { channel: 'FACEBOOK', body: 'changed-after-approval' });
  console.log('MARKETING', JSON.stringify({ contentException, variantResult, variantWrite }));
  const raw = { id: 'notification-A', organizationId: 'org-A', recipientId: 'actor-A', title: 'restricted title', body: 'restricted body', entityType: 'Project', entityId: 'restricted-project', href: '/projects/restricted-project', projectId: 'restricted-project' };
  let authorizationCalls = 0;
  const notificationDb = { notification: { findMany: async () => [raw], count: async () => 1, findFirst: async () => ({ id: raw.id }), update: async ({ data }) => ({ ...raw, ...data }) }, $transaction: async (work) => Promise.all(work) };
  const notifications = new NotificationsService(notificationDb, { assertView: async () => { authorizationCalls++; throw new Error('Forbidden'); } });
  const list = await notifications.list(actor, { page: 1, pageSize: 10 });
  const afterList = authorizationCalls;
  const mutation = await notifications.markRead(actor, raw.id, false);
  console.log('NOTIFICATION', JSON.stringify({ listBody: list.items[0].body, mutationBody: mutation.body, mutationEntityId: mutation.entityId, listAuthorizationCalls: afterList, mutationAuthorizationCalls: authorizationCalls - afterList }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
NODE
```

Output:

```text
SEARCH {"beforeWhere":{"organizationId":"org-A","deletedAt":null,"OR":[{"projectOwnerId":"actor-A"},{"projectManagerId":"actor-A"},{"members":{"some":{"userId":"actor-A"}}}]},"actualWhere":{"organizationId":"org-A","deletedAt":null,"OR":[{"name":{"contains":"secret","mode":"insensitive"}},{"code":{"contains":"secret","mode":"insensitive"}}]}}
ROLE {"id":"system-role","organizationId":"org-A","code":"system_admin","isProtected":true,"isSystem":true,"administrationTier":1,"maximumScope":"SELF"}
MARKETING {"contentException":"Only draft or rejected content can be edited","variantResult":{"channel":"FACEBOOK","body":"changed-after-approval"},"variantWrite":{"where":{"contentItemId_channel":{"contentItemId":"content-A","channel":"FACEBOOK"}},"create":{"contentItemId":"content-A","channel":"FACEBOOK","body":"changed-after-approval"},"update":{"channel":"FACEBOOK","body":"changed-after-approval"}}}
NOTIFICATION {"listBody":null,"mutationBody":"restricted body","mutationEntityId":"restricted-project","listAuthorizationCalls":1,"mutationAuthorizationCalls":0}
```

### Lệnh tái chạy FIN-02

Chạy tại `/home/galaxy_os/apps/api`, exit `0`, khoảng `0,875` giây; DTO/service và `Prisma.Decimal` là code thật, persistence và policy được mock trong RAM:

```bash
node <<'NODE'
require('reflect-metadata');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true } }).outputText, filename);
const {ContractsService} = require('./src/contracts/contracts.service.ts');
const {RecordPaymentDto} = require('./src/contracts/contracts.dto.ts');
const {plainToInstance} = require('class-transformer');
const {validate} = require('class-validator');
const {Prisma} = require('@prisma/client');
const assert = require('node:assert/strict');
(async () => {
const input = {paymentDate: new Date(), amount:'-10', currency:'USD', exchangeRate:'-1', paymentMethod:'CASH',idempotencyKey:'audit-memory-only',allocations:[{scheduleId:'00000000-0000-4000-8000-000000000001',amount:'-10'}]};
const errors = await validate(plainToInstance(RecordPaymentDto,input));
assert.equal(errors.length,0);
let updated;
const tx = { customerPaymentSchedule:{findMany:async()=>[{id:input.allocations[0].scheduleId,currency:'VND', outstandingAmount:new Prisma.Decimal(100),paidAmount:new Prisma.Decimal(0)}],update:async(args)=>{updated=args.data;return args.data;}}, customerPayment:{create:async(args)=>({id:'memory-payment',...args.data})},paymentAllocation:{create:async(args)=>args.data},activity:{create:async()=>({})}};
const prisma={customerPayment:{findUnique:async()=>null},$transaction:async(fn)=>fn(tx)};
const service=new ContractsService(prisma,{assertView:async()=>({})});
const result=await service.payment({userId:'memory-user',organizationId:'memory-org'},'memory-project',input);
assert.equal(updated.paidAmount.toString(),'-10');assert.equal(updated.outstandingAmount.toString(),'110');
console.log(JSON.stringify({dtoErrors:errors.length,recordedAmount:result.amount.toString(),currency:result.currency,exchangeRate:result.exchangeRate,scheduleCurrency:'VND',paidAmount:updated.paidAmount.toString(),outstandingAmount:updated.outstandingAmount.toString(),persistence:'mock only; no database client constructed'}));
})().catch(error=>{console.error(error);process.exitCode=1});
NODE
```

Output:

```json
{
  "dtoErrors": 0,
  "recordedAmount": "-10",
  "currency": "USD",
  "exchangeRate": "-1",
  "scheduleCurrency": "VND",
  "paidAmount": "-10",
  "outstandingAmount": "110",
  "persistence": "mock only; no database client constructed"
}
```

Giới hạn chung: các script trên bỏ qua HTTP guard; script authorization còn bỏ qua DTO/DB constraints. Chúng chứng minh controller/service branch và write arguments với mock, không chứng minh dữ liệu tenant thật đã lộ, DB đã commit hay race thực tế.

## Phần không chạy

| Phạm vi                                 | Trạng thái                      | Lý do cụ thể                                                                                                                |
| --------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Root `pnpm test` / API full tests       | `BLOCKED`                       | Script API không exclude 8 integration files; chúng mặc định `DATABASE_URL` về DB local `galaxy_os` và có create/deleteMany |
| API integration                         | `BLOCKED`                       | Không có PostgreSQL/Redis/storage test riêng đã xác minh; không được migrate/seed/reset DB đang dùng                        |
| Browser E2E/acceptance                  | `BLOCKED`                       | Global setup gọi fixture DB và cleanup; chưa có base URL/account/DB test cô lập                                             |
| 12 tình huống business/auth xuyên chuỗi | `NOT_RUN` end-to-end            | Có unit evidence rời rạc, không có fixture chung giữ cùng item/version/persona qua toàn chuỗi                               |
| Export PDF/XLSX end-to-end              | `NOT_RUN`                       | Có code generator/unit coverage cục bộ; không chạy browser/API download với data fixture                                    |
| Concurrency DB thật                     | `NOT_RUN`                       | Không có disposable DB; static review phát hiện các path thiếu lock                                                         |
| Redis/queue/background worker           | `NOT_RUN`                       | Redis có trong compose nhưng không có môi trường cô lập; publishing hiện explicit process endpoint + fake provider          |
| AI authorization/data retrieval         | `NOT_APPLICABLE` cho hiện trạng | Document AI chỉ là health/readiness placeholder; không có AI data pipeline để test                                          |

## Đối chiếu 12 tình huống bắt buộc

|   # | Bằng chứng hiện có                                                                          | Kết luận audit                                                                    |
| --: | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
|   1 | Unit riêng cho product revision, contract source, procurement, receiving, warranty          | `PARTIAL/STATIC_ONLY`; chưa có cùng line/version xuyên end-to-end; CORE-01        |
|   2 | ProjectProduct approved immutable; quotation/PI snapshot tests                              | `PARTIAL`; Survey và marketing variant có bypass; CORE-03/MKT-02                  |
|   3 | Unit partial receiving, transfer remaining, payment allocation equality                     | `PARTIAL`; schedule append/currency/concurrency gaps; FIN-02/03/04, OPS-01        |
|   4 | Installation readiness và independent stage browser test có trong repo nhưng E2E không chạy | `NEEDS_OWNER_DECISION/NOT_RUN` cho item A/B parallel policy                       |
|   5 | Access-control unit và nhiều project scope unit pass                                        | `PARTIAL`; search/binding/department gaps SEC-01/AUTH-01/03                       |
|   6 | Unit cost redaction ở estimate/file/search/dashboard                                        | `FAIL` do audit/task side channels SEC-02/AUTH-05; chưa persona E2E               |
|   7 | Nhiều self-approval unit cho product/commercial/procurement/marketing                       | `PARTIAL`; role/delegation loop chưa có policy/test đầy đủ                        |
|   8 | Assignment expiry và last-admin disable unit                                                | `PARTIAL`; delegation chain/redelegation/global-vs-org final admin chưa chốt      |
|   9 | Seed tách role warehouse/installer/finance và generic permission tests                      | `NOT_RUN` cho ba persona cụ thể; không suy pass từ menu/seed                      |
|  10 | Inventory idempotency unit; một số retry unit                                               | `FAIL/STATIC_ONLY` ở appendix và shipment add-item; chưa DB race                  |
|  11 | Existing Sprint1 integration source có manager allow; Project browser source có PM allow    | `EXISTS_NOT_RUN`; phản chứng rõ rằng hệ thống không chỉ dành cho admin            |
|  12 | Project dashboard calculation/scope unit pass                                               | `PARTIAL`; dashboard global trộn currency và chưa source reconciliation/drilldown |

## Kiểm soát thay đổi

- Cây chính `/home/galaxy_os` vẫn sạch sau mọi kiểm thử, trước khi thêm tài liệu audit.
- Mọi generated output nằm trong worktree tạm: `apps/api/dist`, `apps/edge/dist`, `apps/web/.next`, `tsconfig.tsbuildinfo`, `.pytest_cache`; Next còn chỉnh generated `apps/web/next-env.d.ts` trong worktree tạm. Không file nào được stage/commit từ worktree đó.
- Không chạy migrate, seed, reset, format write, lint fix, server production, email, publish, payment, inventory posting hoặc external provider.
- Không đọc/in nội dung `.env` thật; các giá trị báo cáo đã che.
