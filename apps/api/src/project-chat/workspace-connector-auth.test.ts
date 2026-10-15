import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  oauthRequest,
  pkceMatches,
  WorkspaceConnectorAuth,
} from './workspace-connector-auth';
it('requires S256 and validates the exact verifier, client, scope and resource', () => {
  const verifier = 'v'.repeat(43),
    challenge = createHash('sha256').update(verifier).digest('base64url');
  expect(pkceMatches(verifier, challenge)).toBe(true);
  expect(pkceMatches('x'.repeat(43), challenge)).toBe(false);
  const value = {
    client_id: 'synthetic',
    redirect_uri: 'https://chatgpt.com/connector/oauth/synthetic',
    resource: 'https://example.test/api/v1/workspace-agent-mcp/x/y',
    response_type: 'code',
    scope: 'galaxy.workspace.job',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'client-state',
  };
  expect(oauthRequest.safeParse(value).success).toBe(true);
  expect(
    oauthRequest.safeParse({ ...value, code_challenge_method: 'plain' })
      .success,
  ).toBe(false);
  expect(
    oauthRequest.safeParse({ ...value, scope: 'all-projects' }).success,
  ).toBe(false);
});

it('does not allocate Workspace consent requests when deferred, even with the old flag enabled', async () => {
  const old = {
    feature: process.env.FEATURE_WORKSPACE_AGENTS,
    origin: process.env.APP_PUBLIC_ORIGIN,
    client: process.env.GALAXY_WORKSPACE_OAUTH_CLIENT_ID,
    redirect: process.env.GALAXY_WORKSPACE_OAUTH_REDIRECT_URI,
  };
  Object.assign(process.env, {
    FEATURE_WORKSPACE_AGENTS: 'true',
    APP_PUBLIC_ORIGIN: 'https://example.test',
    GALAXY_WORKSPACE_OAUTH_CLIENT_ID: 'synthetic',
    GALAXY_WORKSPACE_OAUTH_REDIRECT_URI:
      'https://chatgpt.com/connector/oauth/synthetic',
  });
  let allocated = 0;
  const tx = {
    workspaceConnectorGrant: {
      count: async () => 0,
      create: async () => {
        allocated++;
      },
    },
  };
  const service = new WorkspaceConnectorAuth(
    {
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    } as never,
    { configuredPrincipal: async () => false } as never,
  );
  try {
    await expect(
      service.authorize({
        client_id: 'synthetic',
        redirect_uri: process.env.GALAXY_WORKSPACE_OAUTH_REDIRECT_URI,
        resource:
          'https://example.test/api/v1/workspace-agent-mcp/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222',
        response_type: 'code',
        scope: 'galaxy.workspace.job',
        code_challenge: 'v'.repeat(43),
        code_challenge_method: 'S256',
        state: 'synthetic',
      }),
    ).rejects.toThrow('WORKSPACE_DEFERRED_BY_USER');
    expect(allocated).toBe(0);
  } finally {
    for (const [key, value] of Object.entries({
      FEATURE_WORKSPACE_AGENTS: old.feature,
      APP_PUBLIC_ORIGIN: old.origin,
      GALAXY_WORKSPACE_OAUTH_CLIENT_ID: old.client,
      GALAXY_WORKSPACE_OAUTH_REDIRECT_URI: old.redirect,
    }))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
