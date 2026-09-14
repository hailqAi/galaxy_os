# Galaxy OS — G00: sửa build/typecheck và dựng môi trường kiểm thử cô lập

Thời điểm chốt báo cáo: 2026-09-14 15:18 +07:00.

## Báo cáo cho chủ dự án

**Giai đoạn đang làm: G00.**

**Đã làm được:** lỗi clean typecheck/build do thiếu khai báo trực tiếp
`@types/multer` đã được tái hiện trên cài đặt offline/frozen và sửa bằng đúng
phiên bản `2.2.0`. Clean typecheck, root build, lint, format và Prisma validate
đã có bằng chứng mới. Sáu file format nêu trong audit đã được sửa đúng phạm vi.
Một harness PostgreSQL/Redis/API test riêng, fail-closed, dùng dữ liệu tổng hợp đã
chạy thành công qua Nest auth/guard thật và Prisma/PostgreSQL thật; có ca được
phép, bị từ chối cùng tenant, bị từ chối khác tenant và che/hiện trường tài chính
theo binding hiện hữu. Code G00 đã được commit local tại
`a20332227da47f162ab65684ead973460f9fc647`; không push.

**Chưa xong:** một lần chạy toàn bộ API còn 1 timeout không ổn định trong
`sprint1.integration` dù chạy riêng cùng file PASS 18/18. Browser E2E, Redis/job
runtime và ba P0 của G01 chưa được kiểm thử hoặc sửa trong G00. Vì full regression
chưa xanh tuyệt đối, trạng thái kiểm chứng G00 giữ `PARTIAL`. Lỗi runtime riêng ở
API danh sách Project cũng được ghi nhận ngoài phạm vi, không tiện thể sửa.

**Đề nghị tiếp theo:** tiếp tục G00 để xử lý hoặc chấp nhận có căn cứ timeout của
full API regression. Nền tối thiểu để bắt đầu kiểm tra ba P0 G01 đã `READY`, nhưng
không tự chuyển sang G01 trong báo cáo này.

## Bảng trạng thái

| Chỉ tiêu                     | Trạng thái / bằng chứng                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `G00_IMPLEMENTATION`         | `IMPLEMENTED`                                                           |
| `G00_VERIFICATION`           | `PARTIAL` — full API 58/59 file; suite lỗi chạy riêng PASS              |
| `CLEAN_TYPECHECK`            | `PASS` — clean worktree sau frozen install + Prisma generate            |
| `ROOT_BUILD`                 | `PASS` — clean worktree, API/Edge/Web; Web sinh 78/78 trang             |
| `ISOLATED_API_DB`            | `VERIFIED`                                                              |
| `G01_MINIMUM_ENV`            | `READY`                                                                 |
| `CODE_SHA`                   | `a20332227da47f162ab65684ead973460f9fc647`                              |
| `TEST_SHA`                   | `a20332227da47f162ab65684ead973460f9fc647`                              |
| `TESTED_CODE_SHA_OR_TREE`    | SHA trên; tree `d771e6814e8a5c2a941367ecfca024de6b7ed51a`               |
| `COMMIT_STATUS`              | `COMMITTED`                                                             |
| `PUSH_STATUS`                | `PUSH_BLOCKED`                                                          |
| `REPORT_PATH`                | `docs/project-system/G00_BUILD_AND_ISOLATED_TEST_HANDOFF_2026-09-14.md` |
| `NEXT_ACTION_RECOMMENDATION` | `CONTINUE_G00`                                                          |
| `AUTO_CONTINUE`              | `NO`                                                                    |

## Mốc 1 — Tiếp quản hiện trạng

### Git và workspace

- Git root đã xác minh: `/home/galaxy_os`.
- Trước G00: branch `audit/galaxy-core-20260914-120217`, HEAD
  `6a8d45c2de5a34912e00c36f46bab51b6e2daf86`, tree
  `ecbf92e56ae97ef5975db1f2917c593af71e1fe4`.
- Staged/unstaged/untracked trước G00: sạch. Không có merge, rebase hoặc
  cherry-pick dở.
- Đã tạo branch `g00/build-test-isolation-20260914`; không sửa trên main/master.
- Worktree audit có trước tại `/tmp/galaxy-core-audit-20260914-120217` được giữ
  nguyên. Không reset, clean, stash, rebase hoặc ghi đè báo cáo audit.

### Nguồn đã đọc

Đã đọc đủ chín file trong
`docs/audits/20260914-120217-galaxy-core/`, từ `00-checkpoint.md` đến
`08-coverage.md`, cùng `AGENTS.md`, manifests, lockfile, scripts, hooks/guard,
CI/test config và source/caller liên quan. Không tìm thấy trong repo bản bàn giao
ngày 14/09/2026, file nguyên văn v0.2 hoặc prompt G00 gốc của
`GALAXY_OS_10_GOI_CODE`; ghi `SOURCE_NOT_IN_REPO`. Nội dung người dùng cấp trong
phiên này và audit hiện hữu là nguồn điều khiển G00. Không có triển khai mới hơn
audit cần giữ thay cho công việc này.

### Công cụ thực tế

- Node.js `20.20.2`; pnpm `10.33.4`; TypeScript `5.9.3`.
- Prisma và `@prisma/client` `6.19.0`; NestJS `11.1.28`; Next.js `16.2.10`.
- Docker Compose `5.1.3`.

### Lỗi được tái hiện trước sửa

Sau `pnpm install --offline --frozen-lockfile --force` trong worktree riêng và
`pnpm db:generate`:

- API typecheck exit `2`: 16 vị trí `Cannot find namespace 'Express'`.
- API build exit `1`: 7 vị trí cùng nguyên nhân.
- Root build exit `1` do API build.
- `apps/api/package.json` và importer trong lockfile không khai báo
  `@types/multer`; cây cũ chỉ có symlink orphan nên kết quả không-clean trước đó
  không đủ bằng chứng.
- Scoped Prettier xác nhận cả sáu path audit nêu vẫn lỗi trước sửa.

## Mốc 2 — Sửa build/typecheck và format

### Nguyên nhân và thay đổi tối thiểu

- Thêm dev dependency chính xác `@types/multer: 2.2.0` tại workspace API và cập
  nhật lockfile. Không cài `latest`, không thay dependency runtime, không nâng
  major và không đổi stack.
- Chạy Prettier chỉ trên sáu file audit nêu:
  `apps/api/src/me.service.test.ts`, `apps/api/src/me.service.ts`,
  `apps/web/app/settings/users/[userId]/user-detail.tsx` và ba plan ngày
  2026-08-11, 2026-08-12, 2026-08-14. Diff chỉ là format.
- Không dùng `any`, `@ts-ignore`, loại file khỏi typecheck, tắt test hay hạ chuẩn
  kiểm tra.

### Kết quả sau sửa

Trên clean detached worktree của chính `CODE_SHA`, theo đúng thứ tự setup
frozen install → isolation check → Prisma generate:

- `pnpm typecheck`: exit `0` cho API, Web và Edge.
- `pnpm build`: exit `0` cho API, Edge và Web; Web compile/typecheck và sinh
  78/78 trang.
- `pnpm format:check`: exit `0` trên toàn tree sạch.
- Package lint API/Web/Edge, Ruff và Prisma validate: exit `0`; Web còn một
  warning `<img>` có trước, không có lint error.

Một probe cố ý chạy typecheck trước `prisma generate` đã fail vì clean worktree
chưa có generated Prisma Client. Đây là kiểm chứng thứ tự setup của repo, không
được dùng làm kết quả clean typecheck cuối.

## Mốc 3 — Môi trường G00 cô lập

### Tài nguyên và rào an toàn

- Compose project: `galaxy_os_g00_20260914g00`.
- PostgreSQL 17: `127.0.0.1:55432`, database
  `galaxy_os_g00_20260914g00`, user `galaxy_g00_test`; mật khẩu test đã che.
- Redis 7: `127.0.0.1:56379`, DB `0`; `PING=PONG`.
- API test port dự kiến: `127.0.0.1:33001`.
- File roots: `/tmp/galaxy-os-g00-20260914g00/{files,uploads,avatars}`.
- PostgreSQL và Redis dùng `tmpfs`, không bind/named volume; chỉ bind port vào
  loopback. Docker context phải là `default` và endpoint phải đúng
  `unix:///var/run/docker.sock`.
- Runner kiểm project/service labels, published ports, DB identity trong
  container và identity qua chính Prisma TCP endpoint trước migrate/seed.
- Guard từ chối khi thiếu marker, dùng port/DB shared, Docker host/context
  override, path lệch/whitespace/symlink/sai owner, dev auth, Marketing hoặc SMTP
  credential. Guard được gọi trước mọi PrismaClient trực tiếp trong tám suite
  integration và ba fixture browser có ghi dữ liệu.
- Package scripts chỉ nạp file test tường minh
  `scripts/g00-isolated.env.example`; không fallback `.env` vận hành. Dòng Prisma
  datasource trong lần chạy chứng minh đích là DB G00 trên port 55432.
- Email ở `NODE_ENV=test` dùng capture trong bộ nhớ; Marketing/publishing tắt;
  SMTP chỉ loopback và không credential. Không tìm thấy adapter thanh toán/đặt
  hàng thật được gọi trong smoke. API hiện không có Redis queue client chạy;
  Redis riêng được chuẩn bị nhưng không bị gọi là runtime-verified.

### Migration, seed và cleanup

- Áp dụng nguyên trạng 69 migration hiện hữu lên DB test mới; không tạo/sửa
  migration và không reset DB dùng chung.
- Chạy seed hiện hữu chỉ trên DB test; smoke tạo dữ liệu tổng hợp với hai tenant,
  hai Project cùng tenant A và một Project tenant B.
- `pnpm test:g00` chạy thành công lặp lại: up → xác minh → generate → deploy →
  seed → smoke → down.
- Sau chạy không còn container/network G00 và test root đã bị xóa. Ba container
  có trước của Compose project `galaxy_os` (PostgreSQL, Redis, Mailpit) vẫn healthy
  và không bị chạm.

### Smoke auth/permission qua server thật

Smoke dùng `AppModule`, login/password thật, session cookie, global Nest guards,
binding hiện hữu và Prisma/PostgreSQL thật:

1. Actor `SELF` có `project.read` và Project membership đọc được Project A1
   (`200`), không nhận `estimatedValue`/`contractedValue`, và bị chặn Project A2
   cùng tenant (`404`).
2. Actor scope `ORGANIZATION` có thêm `estimate.read` và `contract.read` đọc được
   A1/A2, đồng thời nhận các trường tài chính.
3. Actor tenant A không thấy Project tenant B (`404`).

Smoke PASS 3/3. Unit guard PASS 14/14, gồm các nhánh từ chối cấu hình giả và
symlink root/child. Fixture cleanup chỉ chạy sau khi DB identity được xác nhận;
nếu identity sai thì chỉ disconnect, không `deleteMany`.

### Ý nghĩa đối với G01

`G01_MINIMUM_ENV=READY` vì đã có API/auth/guard thật, PostgreSQL thật, nhiều
tenant/nhiều Project và actor có/không có quyền tài chính. READY chỉ nói về nền
kỹ thuật. Các finding `SEC-01`, `SEC-02`, `FIN-01` trong audit vẫn là phạm vi
G01, chưa được sửa và chưa được đổi expected trong G00.

## Mốc 4 — Bằng chứng kiểm chứng

Các lệnh chạy ngày 14/09/2026, working directory `/home/galaxy_os` trừ khi ghi
khác. Bí mật thật không được nạp hoặc ghi log.

| Lệnh / phạm vi                                                                       | Kết quả                                                                    |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm test:g00:check`                                                                | PASS; in định danh không nhạy cảm                                          |
| `pnpm --filter @galaxy/api exec vitest run src/g00-isolated-environment.test.ts ...` | PASS 14/14                                                                 |
| `pnpm test:g00`                                                                      | PASS; 69 migration, seed, smoke 3/3, cleanup                               |
| `pnpm typecheck`                                                                     | PASS ở tree chính và clean worktree sau generate                           |
| `pnpm lint`                                                                          | PASS ở tree chính; API/Web/Edge + Ruff cũng PASS trên source của clean SHA |
| `pnpm format:check`                                                                  | PASS trên clean worktree                                                   |
| Prisma `validate`                                                                    | PASS                                                                       |
| `pnpm build`                                                                         | PASS trên clean worktree; API/Edge/Web, 78/78 trang                        |
| `pnpm --filter @galaxy/web test`                                                     | PASS 29 file, 503/503 test                                                 |
| `pnpm --filter @galaxy/edge test`                                                    | PASS 1 file, 4/4 test                                                      |
| document-ai `pytest`                                                                 | PASS 1/1                                                                   |
| full API `vitest run --no-file-parallelism ...`                                      | PARTIAL: 58/59 file; 1.085/1.086 test PASS; một timeout `/me`              |
| chạy riêng `test/sprint1.integration.test.ts`                                        | PASS 18/18 trên cùng G00 DB                                                |
| `git diff --check` và review độc lập                                                 | PASS; re-review không còn Critical/Important                               |

Root `pnpm test` không được ép dùng một profile chung: cấu hình G00 API cố ý làm
thay đổi các expected host của Web unit. Thay vào đó API, Web, Edge và Python đã
được chạy bằng profile phù hợp. Không sửa expected hay nới timeout để làm xanh.

## Quan sát còn mở và giới hạn

- Full API regression có timeout không ổn định ở
  `test/sprint1.integration.test.ts:162`; chạy riêng PASS. G00 không sửa timeout
  hoặc logic ngoài phạm vi.
- Khi thử dùng endpoint list cho smoke, `GET /api/v1/projects` trả `500` do
  pagination truyền giá trị không hợp lệ tới `skip/take` tại
  `apps/api/src/projects/projects.service.ts:264-265`; smoke G00 chuyển sang detail
  endpoint để kiểm đúng mục tiêu auth/scope. Lỗi này chưa được sửa.
- Browser E2E/export E2E/background worker không chạy. Consumer workbook Stage 2
  đã được buộc dùng cùng `G00_TEST_ROOT`, không fallback fixture shared.
- `SEC-01` search scope, `SEC-02` audit cost/margin và `FIN-01` payment/appendix
  idempotency vẫn là finding G01 theo audit; G00 không sửa nghiệp vụ/schema/IAM.
- Build tạo thay đổi tạm ở `apps/web/next-env.d.ts` trong worktree test riêng;
  file được hoàn nguyên trước khi gỡ worktree. Tree chính không bị artifact test
  làm bẩn.

## Cách tái lập

Yêu cầu Docker local context `default`, socket
`unix:///var/run/docker.sock`, các image cached và các port 55432/56379/33001 còn
trống.

```bash
pnpm install --offline --frozen-lockfile
pnpm test:g00:check
pnpm test:g00
```

Để kiểm riêng full API, chạy `up`, `prepare`, test API với toàn bộ biến trong
`scripts/g00-isolated.env.example`, rồi luôn chạy `down`. Không dùng `.env` vận
hành, không đổi Compose project và không dọn ngoài test root tường minh.

## Git và phạm vi kết thúc

- Code commit local: `a20332227da47f162ab65684ead973460f9fc647`.
- Code tree đã test: `d771e6814e8a5c2a941367ecfca024de6b7ed51a`.
- Không sửa migration/schema/IAM/UI ứng dụng hoặc ba P0 G01.
- Không push, tag, PR, deploy hoặc tác động production.
- Báo cáo này và cập nhật `PROJECT_STATUS.md` được commit riêng; SHA báo cáo được
  ghi ở phản hồi cuối vì commit không thể chứa hash của chính nó.
