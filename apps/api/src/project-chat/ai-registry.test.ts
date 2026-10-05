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
it('resolves only the explicit private env source, preserving literal keys and evidence', () => {
  const envPath = join(directory, 'ai-providers.env');
  const key = 'fake-$#\'"\\-key';
  const document = {
    providers: fixture(),
    credentialSource: { mode: 'env', path: envPath },
  };
  writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
  writeFileSync(envPath, `GEMINI_API_KEY=${JSON.stringify(key)}\n`, {
    mode: 0o600,
  });
  const env = { GALAXY_AI_CONFIG_FILE: path, GOOGLE_API_KEY: 'wrong-old-key' };
  const resolved = configuredModel(readAiConfig(env), 'gemini-3.8-flash');
  expect(resolved.key).toBe(key);
  expect(resolved.revision).toBe(provider.revision);
  expect(modelChoices(readAiConfig(env), 'org', 'project')[0]).toMatchObject({
    credentialState: 'LOADED',
    credentialSource: 'env',
  });
  expect(
    JSON.stringify(modelChoices(readAiConfig(env), 'org', 'project')),
  ).not.toContain(key);
  for (const invalid of [
    '',
    'GEMINI_API_KEY=""\n',
    'GEMINI_API_KEY="bad\\nkey"\n',
    'GEMINI_API_KEY=unquoted\n',
  ]) {
    writeFileSync(envPath, invalid);
    expect(() =>
      configuredModel(readAiConfig(env), 'gemini-3.8-flash'),
    ).toThrow();
    expect(
      modelChoices(readAiConfig(env), 'org', 'project')[0]
        ?.credentialConfigured,
    ).toBe(false);
  }
  rmSync(envPath);
  expect(() =>
    configuredModel(readAiConfig(env), 'gemini-3.8-flash'),
  ).toThrow();
});
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
    models.every((m) => !m.available && m.reason === 'MISSING_CREDENTIAL'),
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
    'EGRESS_POLICY_DENIED',
  );
});
it('reports safe store diagnostics and rejects unknown aliases without hiding valid providers', () => {
  const env = { GALAXY_AI_CONFIG_FILE: path };
  const read = () => modelChoices(readAiConfig(env), 'org', 'project');
  expect(read()[0]).toMatchObject({ credentialState: 'CREDENTIAL_NOT_LOADED' });
  for (const [document, expected] of [
    [{ providers: {} }, 'EMPTY_STORE'],
    [{ providers: { mistral: {} } }, 'PROVIDER_ENTRY_MISSING'],
    [
      { providers: { google_gemini: { ...provider, GEMINI_API_KEY: '' } } },
      'CREDENTIAL_EMPTY',
    ],
    [{ providers: { gemini: provider } }, 'STORE_INVALID_FORMAT'],
    [[], 'STORE_INVALID_FORMAT'],
  ] as const) {
    writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
    expect(read()[0]).toMatchObject({ credentialState: expected });
  }
  writeFileSync(
    path,
    JSON.stringify({ providers: { ...fixture(), gemini: provider } }),
  );
  expect(read()[0]).toMatchObject({
    credentialConfigured: true,
    credentialState: 'LOADED',
  });
  expect(read()[1]).toMatchObject({ credentialState: 'STORE_INVALID_FORMAT' });
  writeFileSync(
    path,
    JSON.stringify({
      providers: {
        google_gemini: { ...provider, replacementConfirmed: false },
      },
    }),
  );
  expect(read()[0]).toMatchObject({
    credentialPresent: true,
    credentialConfigured: false,
    credentialState: 'CREDENTIAL_NOT_CONFIRMED',
  });
  expect(JSON.stringify(read())).not.toContain('synthetic-replacement');
  writeFileSync(path, '{');
  expect(read()[0]).toMatchObject({ credentialState: 'STORE_INVALID_FORMAT' });
  chmodSync(path, 0o644);
  expect(read()[0]).toMatchObject({ credentialState: 'STORE_UNREADABLE' });
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
  ).toThrow('EGRESS_POLICY_DENIED');
  expect(() =>
    assertEgress(c, 'org', 'other', 'SYNTHETIC_PUBLIC_APPROVED', []),
  ).toThrow();
  expect(() => assertEgress(c, 'org', 'project', undefined, [])).toThrow();
});
it('never authorizes a whitespace-only credential', () => {
  const config = { google_gemini: { ...provider, GEMINI_API_KEY: '   ' } };
  expect(() => configuredModel(config, 'gemini-3.8-flash')).toThrow(
    'MISSING_CREDENTIAL',
  );
  expect(modelChoices(config, 'org', 'project')[0]).toMatchObject({
    credentialPresent: false,
    credentialConfigured: false,
    providerReady: false,
  });
});
it('does not return credentials copied into provider metadata', () => {
  const privateValue = 'SYNTHETIC_SECRET_DO_NOT_USE';
  const config = {
    google_gemini: {
      ...provider,
      GEMINI_API_KEY: privateValue,
      revision: privateValue,
    },
  };
  const choices = modelChoices(config, 'org', 'project');
  expect(JSON.stringify(choices)).not.toContain(privateValue);
  expect(choices[0]).toMatchObject({
    credentialConfigured: false,
    providerReady: false,
  });
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

it('phân biệt service chưa nạp cấu hình, thiếu khóa và chặn nguồn dù provider sẵn sàng', () => {
  expect(modelChoices(readAiConfig({}), 'org', 'project')[0]?.reason).toBe(
    'CREDENTIAL_NOT_LOADED',
  );
  expect(modelChoices({}, 'org', 'project')[0]?.reason).toBe(
    'MISSING_CREDENTIAL',
  );
  expect(modelChoices(fixture(), 'org', 'other')[0]).toMatchObject({
    providerReady: true,
    sourcePolicy: 'DENIED',
    reason: 'EGRESS_POLICY_DENIED',
  });
});
it('chỉ bật capability từ evidence đúng revision/model, không tự làm đổi config digest', () => {
  const raw = fixture();
  const base = configuredModel(raw, 'gemini-3.8-flash');
  const evidence = {
    revision: provider.revision,
    provider: 'google_gemini',
    requestedModel: 'gemini-3.8-flash',
    returnedModel: 'gemini-3.8-flash',
    capability: 'text',
    fixtureVersion: 'galaxy-ai-activation-v1',
    testedAt: '2026-10-04T00:00:00.000Z',
    requestId: '00000000-0000-4000-8000-000000000001',
    result: 'PASS',
    httpStatus: 200,
    usage: null,
  };
  const verified = { google_gemini: { ...provider, tests: [evidence] } };
  expect(modelChoices(verified, 'org', 'project')[0]).toMatchObject({
    textLiveVerified: true,
    capabilities: { imageInput: false, pdfInput: false },
  });
  expect(configuredModel(verified, 'gemini-3.8-flash').configDigest).toBe(
    base.configDigest,
  );
  expect(
    modelChoices(
      { google_gemini: { ...verified.google_gemini, revision: 'r2' } },
      'org',
      'project',
    )[0]?.textLiveVerified,
  ).toBe(false);
  expect(
    modelChoices(
      { google_gemini: { ...provider, textLiveVerified: true } },
      'org',
      'project',
    )[0]?.textLiveVerified,
  ).toBe(false);
});
