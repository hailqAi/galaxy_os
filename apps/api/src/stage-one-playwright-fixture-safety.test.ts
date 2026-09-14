import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deleteFixtureFileAssets,
  removeFixtureStorageObjects,
} from '../scripts/stage-one-playwright-fixture-storage.mjs';

const fixture = readFileSync(
  resolve(__dirname, '../scripts/stage-one-playwright-fixture.mjs'),
  'utf8',
);
const cleanup = fixture.slice(
  fixture.indexOf('async function cleanup'),
  fixture.indexOf('async function setup'),
);

describe('Stage 1 Playwright fixture cleanup safety', () => {
  it('owns deterministic Customer, Department, and manager Role rows', () => {
    expect(fixture).toMatch(/customer: '20000000-0000-4000-8000-000000000295'/);
    expect(fixture).toMatch(
      /department: '20000000-0000-4000-8000-000000000294'/,
    );
    expect(fixture).toMatch(
      /managerRole: '20000000-0000-4000-8000-000000000296'/,
    );
    expect(fixture).toMatch(
      /prisma\.customer\.create\(\{[\s\S]*?id: ids\.customer,[\s\S]*?displayName: 'Khách hàng Playwright'/,
    );
    expect(fixture).toMatch(
      /prisma\.department\.create\(\{[\s\S]*?id: ids\.department,[\s\S]*?code: 'PW-STAGE-TWO-PLAN',[\s\S]*?name: 'Ban Kế hoạch Playwright'/,
    );
    expect(fixture).toMatch(
      /prisma\.role\.create\(\{[\s\S]*?id: ids\.managerRole,[\s\S]*?code: roleCodes\[0\],[\s\S]*?name: 'Playwright Stage manager'/,
    );
    expect(cleanup).toMatch(
      /prisma\.customer\.deleteMany\(\{\s*where: \{\s*id: ids\.customer,\s*organizationId: organization\.id/,
    );
    expect(cleanup).toMatch(
      /prisma\.department\.deleteMany\(\{\s*where: \{\s*id: ids\.department,\s*organizationId: organization\.id/,
    );
    expect(fixture).not.toMatch(
      /prisma\.customer\.findFirstOrThrow\(\{ where: \{ deletedAt: null \} \}\)/,
    );
    expect(fixture).not.toMatch(
      /prisma\.department\.findFirstOrThrow\(\{ where: \{ status: 'active' \} \}\)/,
    );
    expect(fixture).not.toMatch(
      /prisma\.role\.findFirstOrThrow\([\s\S]*?category: 'SYSTEM'/,
    );
    expect(cleanup).not.toMatch(/prisma\.user\.deleteMany/);
    expect(fixture).toMatch(/prisma\.user\.upsert\(\{/);
  });

  it('requires organization and exact entity type/id scopes for polymorphic rows', () => {
    expect(cleanup).toMatch(
      /const fixtureEntityScopes = \[[\s\S]*?entityType: 'Project', entityId: ids\.project[\s\S]*?entityType: 'ProjectRequiredDocument'[\s\S]*?entityType: 'Survey'[\s\S]*?entityType: 'ProjectStageApproval'/,
    );
    for (const model of ['comment', 'activity', 'auditLog'])
      expect(cleanup).toMatch(
        new RegExp(
          `prisma\\.${model}\\.deleteMany\\(\\{\\s*where: \\{\\s*organizationId: organization\\.id,\\s*OR: fixtureEntityScopes`,
        ),
      );
    expect(cleanup).toMatch(
      /prisma\.notification\.deleteMany\(\{\s*where: \{\s*organizationId: organization\.id,\s*OR: \[\{ projectId: ids\.project \}, \.\.\.fixtureEntityScopes\]/,
    );
    expect(cleanup).toMatch(
      /prisma\.auditLog\.count\(\{\s*where: \{\s*organizationId: organization\.id,\s*OR: fixtureEntityScopes/,
    );

    expect(cleanup).not.toMatch(
      /prisma\.activity\.deleteMany\([\s\S]*?actorId: \{ in: users \}/,
    );
    expect(cleanup).not.toMatch(
      /prisma\.notification\.deleteMany\([\s\S]*?(?:recipientId|actorId): \{ in: users \}/,
    );
  });

  it('removes only logical Stage 1 documents owned by the fixture Project', () => {
    expect(cleanup).toMatch(
      /prisma\.projectStageOneDocument\.findMany\(\{\s*where: \{ projectId: ids\.project \}/,
    );
    expect(cleanup).toMatch(
      /entityType: 'ProjectStageOneDocument',\s*entityId: \{ in: stageOneDocumentIds \}/,
    );
    expect(cleanup).toMatch(
      /prisma\.projectStageOneDocumentVersion\.deleteMany\(\{\s*where: \{ documentId: \{ in: stageOneDocumentIds \} \}/,
    );
    expect(cleanup).toMatch(
      /prisma\.projectStageOneDocument\.deleteMany\(\{\s*where: \{\s*id: \{ in: stageOneDocumentIds \},\s*projectId: ids\.project/,
    );
    expect(cleanup).not.toMatch(
      /prisma\.projectStageOneDocument\.deleteMany\(\{\s*where: \{\s*projectId: \{\s*not:/,
    );
  });

  it('removes exact owned storage objects and preserves a non-fixture sentinel', async () => {
    expect(cleanup).toMatch(
      /const ownedFiles = await prisma\.fileAsset\.findMany\([\s\S]*?select: \{ id: true, storageKey: true \}/,
    );
    expect(cleanup).toMatch(
      /deleteFixtureFileAssets\([\s\S]*?prisma\.fileAsset\.deleteMany[\s\S]*?ownedFiles\.map\(\(\{ storageKey \}\) => storageKey\)/,
    );
    expect(cleanup).not.toMatch(/fixtureFiles|uploadedById: \{ in: users \}/);
    const root = await mkdtemp(join(tmpdir(), 'stage-one-fixture-storage-'));
    const ownedKey =
      '00000000-0000-4000-8000-000000000001/2026/08/00000000-0000-4000-8000-000000000002';
    const sentinelKey =
      '00000000-0000-4000-8000-000000000001/2026/08/00000000-0000-4000-8000-000000000003';
    const ownedPath = join(root, ...ownedKey.split('/'));
    const sentinelPath = join(root, ...sentinelKey.split('/'));
    await mkdir(resolve(ownedPath, '..'), { recursive: true });
    await writeFile(ownedPath, 'fixture');
    await writeFile(sentinelPath, 'preserve');

    try {
      await removeFixtureStorageObjects(root, [ownedKey]);
      await expect(readFile(ownedPath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readFile(sentinelPath, 'utf8')).resolves.toBe('preserve');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps fixture blobs when deleting their FileAsset rows fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stage-one-fixture-storage-'));
    const ownedKey =
      '00000000-0000-4000-8000-000000000001/2026/08/00000000-0000-4000-8000-000000000002';
    const ownedPath = join(root, ...ownedKey.split('/'));
    await mkdir(resolve(ownedPath, '..'), { recursive: true });
    await writeFile(ownedPath, 'fixture');

    try {
      await expect(
        deleteFixtureFileAssets(
          async () => {
            throw new Error('referenced');
          },
          root,
          [ownedKey],
        ),
      ).rejects.toThrow('referenced');
      await expect(readFile(ownedPath, 'utf8')).resolves.toBe('fixture');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('Stage 2 Playwright fixture cleanup safety', () => {
  it('limits cleanup to the deterministic Project and Stage 2-owned rows', () => {
    const stageTwoFixture = resolve(
      __dirname,
      '../scripts/stage-two-playwright-fixture.mjs',
    );
    expect(() => readFileSync(stageTwoFixture, 'utf8')).not.toThrow();
    const source = readFileSync(stageTwoFixture, 'utf8');
    const stageTwoCleanup = source.slice(
      source.indexOf('async function cleanup'),
      source.indexOf('async function setup'),
    );

    expect(stageTwoCleanup).toMatch(
      /projectId: ids\.project[\s\S]*stageKey: 'STAGE_2'/,
    );
    expect(stageTwoCleanup).toMatch(
      /projectId: ids\.project[\s\S]*relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE'/,
    );
    expect(stageTwoCleanup).toMatch(
      /prisma\.importJob\.deleteMany\([\s\S]*projectId: ids\.project[\s\S]*entityType: 'PROJECT_STAGE_TWO_BASELINE'/,
    );
    expect(stageTwoCleanup).toMatch(
      /deleteFixtureFileAssets\([\s\S]*ownedFiles\.map\(\(\{ storageKey \}\) => storageKey\)/,
    );
    expect(stageTwoCleanup).not.toMatch(
      /prisma\.(?:project|fileAsset|task|importJob)\.deleteMany\(\{\s*\}/,
    );
    expect(source).toMatch(
      /department: '20000000-0000-4000-8000-000000000294'/,
    );
    expect(source).toMatch(
      /prisma\.department\.findUniqueOrThrow\(\{ where: \{ id: ids\.department \} \}\)/,
    );
    expect(source).not.toMatch(/prisma\.department\.findFirstOrThrow/);
  });
});
