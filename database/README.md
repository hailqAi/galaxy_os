# Database operations

PostgreSQL is the system of record. Sprint 1 identity and access tables are owned by the API Prisma schema.

From the repository root, copy `.env.example` to `.env`, start PostgreSQL, then run:

```bash
pnpm --filter @galaxy/api prisma:generate
pnpm --filter @galaxy/api prisma:migrate -- --name <short_description>
pnpm --filter @galaxy/api prisma:seed
```

Use `prisma:migrate` only for local development. Review generated SQL before applying it. CI and deployments use `pnpm --filter @galaxy/api prisma:deploy`; never edit an already-applied migration. The seed is idempotent and normalizes `DEV_AUTH_USER_EMAIL` before its unique lookup.
