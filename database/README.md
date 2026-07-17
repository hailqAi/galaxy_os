# Database foundation

PostgreSQL is the system of record. Sprint 0 has no business tables.

From the repository root, copy `.env.example` to `.env`, start PostgreSQL, then run:

```bash
pnpm --filter @galaxy/api prisma:generate
pnpm --filter @galaxy/api prisma:migrate -- --name <short_description>
```

Use `prisma:migrate` only for local development. Review generated SQL before applying it. CI and deployments use `pnpm --filter @galaxy/api prisma:deploy`; never edit an already-applied migration.
