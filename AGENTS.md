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
