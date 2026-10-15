import { ConsoleLogger, LogLevel } from '@nestjs/common';

const secret =
  /^(?:access_?token|refresh_?token|id_token|id_token_hint|code_?verifier|client_?secret|clientState|state|nonce|code|password|currentPassword|newPassword|confirm(?:New)?Password|temporaryPassword|passwordHash|token|rawToken|sessionToken|resetToken|cookie|set-cookie|authorization|ADMIN_TEMP_PASSWORD|secret|signing_?secret|webhook-signature|GALAXY_MCP_ENCRYPTION_KEY|download_?url|ticket)$/i;

export function redact(value: unknown): unknown {
  if (typeof value === 'string')
    return value
      .replace(
        /https?:\/\/[^\s"<>]+[?&](?:sig(?:nature)?|X-Amz-Signature|X-Goog-Signature)=[^\s"<>]*/gi,
        '[SIGNED_URL_REDACTED]',
      )
      .replace(
        /([?&](?:access_?token|refresh_?token|id_token|id_token_hint|code_?verifier|client_?secret|clientState|state|nonce|code|password|currentPassword|newPassword|confirm(?:New)?Password|temporaryPassword|passwordHash|token|rawToken|sessionToken|resetToken|secret|signing_?secret|ticket)=)[^&#]*/gi,
        '$1[REDACTED]',
      )
      .replace(
        /(?<![?&])((?:access_?token|refresh_?token|id_token|id_token_hint|code_?verifier|client_?secret|clientState|state|nonce|code|password|currentPassword|newPassword|confirm(?:New)?Password|temporaryPassword|passwordHash|token|rawToken|sessionToken|resetToken|cookie|set-cookie|authorization|secret|signing_?secret|webhook-signature|GALAXY_MCP_ENCRYPTION_KEY|download_?url|ticket)\s*[:=]\s*)(?:"[^"]*"|[^,\r\n}]+)/gi,
        '$1[REDACTED]',
      );
  if (value instanceof Error)
    return {
      name: value.name,
      message: redact(value.message),
      stack: redact(value.stack),
    };
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secret.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  return value;
}

export class SecurityLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    level?: LogLevel,
    stream?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ) {
    super.printMessages(
      messages.map(redact),
      context,
      level,
      stream,
      redact(errorStack),
    );
  }
}
