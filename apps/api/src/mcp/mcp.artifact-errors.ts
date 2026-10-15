import { AiError } from '../project-chat/ai-registry';
import { McpRemoteResponseError } from './mcp.network';
import { HttpException } from '@nestjs/common';

export type ArtifactStage =
  | 'PREPARE_STORAGE'
  | 'CONNECT'
  | 'DOWNLOAD'
  | 'VALIDATE'
  | 'STORE'
  | 'LINK';

export function artifactFailure(error: unknown, stage: ArtifactStage) {
  const response = error instanceof HttpException ? error.getResponse() : null;
  const category =
    response && typeof response === 'object' && 'category' in response
      ? response.category
      : null;
  const storageCode =
    error instanceof Error &&
    'code' in error &&
    ['ENOSPC', 'EDQUOT'].includes(String(error.code))
      ? 'MCP_ARTIFACT_STORAGE_SPACE_EXHAUSTED'
      : [
            'UPLOAD_GLOBAL_QUOTA_EXCEEDED',
            'UPLOAD_ORGANIZATION_QUOTA_EXCEEDED',
          ].includes(String(category))
        ? 'MCP_ARTIFACT_STORAGE_QUOTA_EXCEEDED'
        : error instanceof HttpException && error.getStatus() === 413
          ? 'MCP_ARTIFACT_STORAGE_SPACE_EXHAUSTED'
          : undefined;
  const httpStatus =
    error instanceof McpRemoteResponseError ? error.status : null;
  const networkCode =
    ['CONNECT', 'DOWNLOAD'].includes(stage) &&
    error instanceof Error &&
    'code' in error
      ? new Map<string, string>(
          Object.entries({
            ENOTFOUND: 'DNS_FAILED',
            EAI_AGAIN: 'DNS_FAILED',
            CERT_HAS_EXPIRED: 'TLS_FAILED',
            UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS_FAILED',
            DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS_FAILED',
            ERR_TLS_CERT_ALTNAME_INVALID: 'TLS_FAILED',
            ECONNREFUSED: 'CONNECTION_FAILED',
            ECONNRESET:
              stage === 'CONNECT' ? 'CONNECTION_FAILED' : 'STREAM_INTERRUPTED',
            EPIPE: 'STREAM_INTERRUPTED',
          }),
        ).get(String(error.code))
      : undefined;
  const code =
    storageCode ??
    (httpStatus !== null
      ? `MCP_ARTIFACT_HTTP_${httpStatus}`
      : error instanceof AiError && error.code === 'WORKBOOK_READ_UNAVAILABLE'
        ? 'MCP_ARTIFACT_WORKBOOK_READ_FAILED'
        : networkCode
          ? 'MCP_ARTIFACT_' + networkCode
          : error instanceof Error &&
              /^MCP_[A-Z0-9_]{1,80}$/.test(error.message)
            ? error.message
            : `MCP_ARTIFACT_${stage}_FAILED`);
  return { stage, code, httpStatus };
}
