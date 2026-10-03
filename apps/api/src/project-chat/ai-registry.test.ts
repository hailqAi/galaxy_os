import { afterEach, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readAiConfig,
  modelChoices,
  configuredModel,
  assertEgress,
} from './ai-registry';

const directory = mkdtempSync(join(tmpdir(), 'galaxy-ai-config-'));
const path = join(directory, 'providers.json');
const provider = {
  revision: 'revision-1',
  GEMINI_API_KEY: 'synthetic-replacement-only',
  replacementConfirmed: true,
  enabled: true,
  modelAccessVerified: false,
  dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
  maxRequestsPerDay: null,
  maxConcurrent: 1,
  maxOutputTokens: 8192,
  approvedProjects: [{ organizationId: 'org', projectId: 'project' }],
  approvedSources: [{ id: 'source', version: 'v1' }],
};
const fixture = () => ({ google_gemini: { ...provider } });
afterEach(() => {
  try {
    rmSync(path);
  } catch {
    /* Error code checked below. */
  }
});
it('keeps three disabled choices without credentials and never exposes keys', () => {
  const models = modelChoices({}, 'org', 'project');
  expect(models).toHaveLength(3);
  expect(
    models.every((m) => !m.available && m.reason === 'NOT_CONFIGURED'),
  ).toBe(true);
  const choices = modelChoices(fixture(), 'org', 'project');
  expect(choices[0]).toMatchObject({
    id: 'gemini-3.8-flash',
    provider: 'google_gemini',
    available: true,
    accountVisible: false,
  });
  expect(JSON.stringify(choices)).not.toContain('synthetic-replacement');
  expect(modelChoices(fixture(), 'org', 'other')[0]?.reason).toBe(
    'DATA_POLICY_BLOCKED',
  );
});
it('requires replacement credentials, exact registry model and source egress independent of READ', () => {
  expect(() => configuredModel(fixture(), 'unknown')).toThrow();
  expect(() =>
    configuredModel(
      { google_gemini: { ...provider, replacementConfirmed: false } },
      'gemini-3.8-flash',
    ),
  ).toThrow();
  const c = configuredModel(fixture(), 'gemini-3.8-flash');
  expect(() =>
    assertEgress(c, 'org', 'project', 'SYNTHETIC_PUBLIC_APPROVED', [
      { id: 'source', version: 'v1' },
    ]),
  ).not.toThrow();
  expect(() =>
    assertEgress(c, 'org', 'project', 'SYNTHETIC_PUBLIC_APPROVED', [
      { id: 'source', version: 'v2' },
    ]),
  ).toThrow('DATA_POLICY_BLOCKED');
  expect(() =>
    assertEgress(c, 'org', 'other', 'SYNTHETIC_PUBLIC_APPROVED', []),
  ).toThrow();
  expect(() => assertEgress(c, 'org', 'project', undefined, [])).toThrow();
});
it('loads private config freshly, rejects unsafe file permissions and isolates a broken provider', () => {
  writeFileSync(
    path,
    JSON.stringify({ providers: { ...fixture(), kira: { key: 'bad' } } }),
    { mode: 0o600 },
  );
  const env = { GALAXY_AI_CONFIG_FILE: path };
  expect(configuredModel(readAiConfig(env), 'gemini-3.8-flash').revision).toBe(
    'revision-1',
  );
  writeFileSync(
    path,
    JSON.stringify({
      providers: { google_gemini: { ...provider, revision: 'revision-2' } },
    }),
  );
  expect(configuredModel(readAiConfig(env), 'gemini-3.8-flash').revision).toBe(
    'revision-2',
  );
  chmodSync(path, 0o644);
  expect(readAiConfig(env)).toEqual({});
});
