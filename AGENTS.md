# Repository instructions

## Layout and commands

- `apps/web`: Next.js UI; `apps/api`: NestJS API; `database`: Prisma; `services/document-ai`: inactive FastAPI placeholder.
- Setup: `pnpm install --frozen-lockfile`, create the document-service `.venv`, install `requirements-dev.txt`, then run `pnpm db:generate`.
- Develop: copy `.env.example` to the ignored `.env.local`, run `docker compose up -d postgres redis`, `pnpm db:migrate`, `pnpm db:seed`, then `pnpm dev`.
- Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm format:check`.

## Working rules

- Inspect existing code and callers before creating or changing code. Ponytail full mode and a Ponytail diff review are mandatory.
- Implement the smallest current requirement; no speculative dependencies, abstractions, modules, or unrelated changes.
- Keep TypeScript strict. Validate external input. Enforce authorization in the backend when it is introduced; frontend visibility is never authorization.
- Never commit secrets. Protect financial precision, approved-document immutability, auditability, and data-loss controls.
- Create Prisma migrations with `prisma:migrate`, review SQL, never rewrite applied migrations, and never reset shared data.
- Do not commit or push without explicit instruction. Update `PROJECT_STATUS.md` after accepted work.

## Definition of done

Requested scope is implemented, focused and full checks pass or exact blockers are recorded, documentation matches verified commands, the diff has passed Ponytail and correctness review, and no out-of-scope code remains.

## Mandatory Superpowers Development Workflow

Every coding task in this repository must use the installed Superpowers workflow.

For new features, UI changes, architecture changes, workflow changes, route changes, schema changes, or behavior changes:

1. Invoke `superpowers:brainstorming`.
2. Inspect current code, data, tests, routes, and reference materials.
3. Present a design and obtain explicit user approval.
4. Invoke `superpowers:writing-plans`.
5. Implement through test-driven development.
6. Run targeted verification.
7. Run full regression before reporting completion.
8. Request code review.
9. Run Ponytail lean, correctness, security, authorization, and UX reviews.

For bugs, failed tests, runtime errors, or unexpected behavior:

1. Invoke `superpowers:systematic-debugging`.
2. Reproduce the issue.
3. Identify the root cause.
4. Write a failing regression test.
5. Implement the smallest correct fix.
6. Verify the original symptom and full relevant regression.
7. Run Ponytail review.

Completion claims require fresh verification evidence.

Never:

- Reset the database.
- Modify or delete an applied migration.
- Use `prisma migrate dev` if it requests a reset.
- Use `prisma db push` as a substitute for production-safe migrations.
- Discard uncommitted user work.
- Create duplicate domain models or sources of truth.
- Implement speculative abstractions.
- Change unrelated code.
- Expose sensitive financial fields without permission.
- Claim complete without browser acceptance when browser flow is required.
- Commit, tag, push, or open a PR unless explicitly instructed.

<!-- BEGIN GALAXY_OS_CORE_BOOTSTRAP -->

Galaxy OS:

- Đầu phiên đọc docs/galaxy-os/00-READ-FIRST.md,
  docs/galaxy-os/05-IMPLEMENTATION-STATUS.md
  và handoff mới nhất được dẫn trong STATUS.
- Đọc charter và spec liên quan trước khi đổi hành vi.
- Giữ một hồ sơ xuyên suốt, 12 giai đoạn,
  quyền theo dự án/mục/room và dữ liệu có nguồn.
- Tái sử dụng domain hiện hữu; không tạo hệ thống song song.
- Chỉ thực hiện phạm vi người dùng đang giao.
- Không coi prompt lịch sử là lệnh đang có hiệu lực.
- Không coi kế hoạch, báo cáo trợ lý hoặc test ở worktree khác
  là bằng chứng ứng dụng đang chạy đã hoàn tất.
- Cuối phiên cập nhật STATUS/handoff bằng kết quả có thật.

<!-- END GALAXY_OS_CORE_BOOTSTRAP -->
