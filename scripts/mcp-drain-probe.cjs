// Read-only counts, using the currently active API's Prisma client and environment.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const requireApi = createRequire(resolve(process.cwd(), 'package.json'));
const { PrismaClient } = requireApi('@prisma/client');
const db = new PrismaClient({ log: [] });
(async () => {
  try {
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRawUnsafe(`
        WITH waiting AS (
          SELECT q.id FROM "ChatAiAnswer" q
          WHERE q.status = 'QUEUED' AND q."leaseUntil" IS NULL
            AND q."providerStartedAt" IS NULL
            AND coalesce(q.usage->'mcp'->>'version','') <> '1'
            AND q.usage->'workflow'->>'version' = '1'
            AND q.usage->'workflow'->>'phase' = 'QUEUED'
            AND q.usage->'workflow'->>'attempts' = '0'
            AND q.usage->'workflow'->>'providerRounds' = '0'
            AND q.usage->'workflow'->>'dispatchState' = 'SAFE'
            AND (${process.argv.includes('--native-observed') ? 'true' : 'false'} OR EXISTS (
              SELECT 1 FROM "ChatAiAnswer" b
              WHERE b."organizationId" = q."organizationId"
                AND b."ownerId" = q."ownerId" AND b."conversationId" = q."conversationId"
                AND (b."createdAt" < q."createdAt" OR (b."createdAt" = q."createdAt" AND b.id < q.id))
                AND b.status = 'RUNNING' AND b."leaseUntil" IS NULL
                AND b.usage->'mcp'->>'version' = '1'
                AND b.usage->'mcp'->>'state' = 'NOTIFIED'
                AND b.usage->'mcp'->>'originalMessageId' = b.id::text
                AND b.usage->'mcp'->'actor'->>'userId' = b."ownerId"::text
                AND b.usage->'mcp'->'actor'->>'organizationId' = b."organizationId"::text
            ))
        )
        SELECT 'ai' AS component, count(*)::int AS active FROM "ChatAiAnswer"
          WHERE status IN ('RUNNING','QUEUED','INDEXING') AND coalesce(usage->'mcp'->>'version','') <> '1'
            AND id NOT IN (SELECT id FROM waiting)
        UNION ALL SELECT 'waiting_ai', count(*)::int FROM waiting
        UNION ALL SELECT 'source', count(*)::int FROM "ChatAiSourceIndex" WHERE status = 'PROCESSING'
        UNION ALL SELECT 'upload', count(*)::int FROM "UploadSession" WHERE status = 'VERIFYING'
        UNION ALL SELECT 'workspace', count(*)::int FROM "ChatAiWorkspaceJob"
          WHERE state IN ('QUEUED','DISPATCHING','DELIVERY_UNCERTAIN','WAITING_RESULT')
        UNION ALL SELECT 'delivery', count(*)::int FROM "McpDelivery"
          WHERE state = 'DELIVERING' AND "leaseUntil" > now()
        UNION ALL SELECT 'artifact', count(*)::int FROM "McpArtifact"
          WHERE state = 'RECEIVING' AND "leaseUntil" > now()
        UNION ALL SELECT 'open_mcp', count(*)::int FROM "ChatAiAnswer"
          WHERE usage->'mcp'->>'version' = '1'
            AND coalesce(usage->'mcp'->>'state','') NOT IN ('COMPLETED','CANCELLED')
        ${
          process.argv.includes('--foundation-compatibility')
            ? `        UNION ALL SELECT 'foundation_answer', count(*)::int FROM "ChatAiAnswer"
          WHERE usage->'dataReceipt' IS NOT NULL
            OR usage::text LIKE '%"count_projects"%'
            OR usage::text LIKE '%"DOMAIN_RECORD"%'
            OR usage->'mcp'->'context' ? 'clarifications'
        UNION ALL SELECT 'foundation_grant', count(*)::int FROM "McpGrant"
          WHERE "revokedAt" IS NULL AND "usedAt" IS NULL
            AND ("expiresAt" IS NULL OR "expiresAt" > now())
            AND scopes && ARRAY['galaxy.data.read','galaxy.data.write']::text[]
`
            : ''
        }
      `);
    });
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        active: rows
          .filter(
            (row) =>
              row.component !== 'open_mcp' &&
              row.component !== 'waiting_ai' &&
              !row.component.startsWith('foundation_'),
          )
          .reduce((n, row) => n + row.active, 0),
        openMcpJobs: rows.find((row) => row.component === 'open_mcp').active,
        nativeObserved: process.argv.includes('--native-observed'),
        foundationStateCount: rows
          .filter((row) => row.component.startsWith('foundation_'))
          .reduce((n, row) => n + row.active, 0),
        components: rows,
      }),
    );
  } finally {
    await db.$disconnect();
  }
})().catch(() => {
  console.error('MCP_DRAIN_PROBE_FAILED');
  process.exitCode = 1;
});
