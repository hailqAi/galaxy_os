import { expect, it } from 'vitest';
import { AiError } from '../project-chat/ai-registry';
import { McpRemoteResponseError } from './mcp.network';
import { artifactFailure } from './mcp.artifact-errors';
import { PayloadTooLargeException } from '@nestjs/common';

it('keeps safe disk and quota causes without exposing filesystem paths', () => {
  expect(
    artifactFailure(
      Object.assign(new Error('/private/file'), { code: 'ENOSPC' }),
      'STORE',
    ).code,
  ).toBe('MCP_ARTIFACT_STORAGE_SPACE_EXHAUSTED');
  expect(
    artifactFailure(
      new PayloadTooLargeException({
        category: 'UPLOAD_ORGANIZATION_QUOTA_EXCEEDED',
        message: 'private',
      }),
      'DOWNLOAD',
    ).code,
  ).toBe('MCP_ARTIFACT_STORAGE_QUOTA_EXCEEDED');
  expect(
    artifactFailure(
      new PayloadTooLargeException('private path'),
      'PREPARE_STORAGE',
    ).code,
  ).toBe('MCP_ARTIFACT_STORAGE_SPACE_EXHAUSTED');
});

it('records the actual HTTP and decoder failure without remote credentials', () => {
  expect(artifactFailure(new McpRemoteResponseError(403), 'DOWNLOAD')).toEqual({
    stage: 'DOWNLOAD',
    code: 'MCP_ARTIFACT_HTTP_403',
    httpStatus: 403,
  });
  expect(
    artifactFailure(new AiError('WORKBOOK_READ_UNAVAILABLE'), 'VALIDATE'),
  ).toEqual({
    stage: 'VALIDATE',
    code: 'MCP_ARTIFACT_WORKBOOK_READ_FAILED',
    httpStatus: null,
  });
});

it('never copies arbitrary error messages, URLs or secret fields into diagnostics', () => {
  const error = Object.assign(
    new Error('https://example.test/file?sig=SECRET'),
    {
      token: 'SECRET',
      code: 'ENOTFOUND',
    },
  );
  const failure = artifactFailure(error, 'DOWNLOAD');
  expect(failure.code).toBe('MCP_ARTIFACT_DNS_FAILED');
  expect(JSON.stringify(failure)).not.toContain('SECRET');
  expect(
    artifactFailure(
      Object.assign(new Error('SECRET'), { code: 'constructor' }),
      'DOWNLOAD',
    ).code,
  ).toBe('MCP_ARTIFACT_DOWNLOAD_FAILED');
  expect(
    artifactFailure(new Error('storage path /private'), 'STORE').code,
  ).toBe('MCP_ARTIFACT_STORE_FAILED');
});

it.each([
  ['CERT_HAS_EXPIRED', 'MCP_ARTIFACT_TLS_FAILED'],
  ['ECONNREFUSED', 'MCP_ARTIFACT_CONNECTION_FAILED'],
  ['ECONNRESET', 'MCP_ARTIFACT_STREAM_INTERRUPTED'],
])('preserves the safe network cause %s', (code, expected) => {
  expect(
    artifactFailure(
      Object.assign(new Error('MCP_REMOTE_UNAVAILABLE'), { code }),
      'DOWNLOAD',
    ).code,
  ).toBe(expected);
});
