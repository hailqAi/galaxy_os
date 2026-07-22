import { ConsoleLogger, LogLevel } from '@nestjs/common';

const secret =
  /^(?:password|currentPassword|newPassword|confirm(?:New)?Password|temporaryPassword|passwordHash|token|rawToken|sessionToken|resetToken|cookie|set-cookie|authorization|ADMIN_TEMP_PASSWORD)$/i;

export function redact(value: unknown): unknown {
  if (typeof value === 'string')
    return value
      .replace(
        /([?&](?:password|currentPassword|newPassword|confirm(?:New)?Password|temporaryPassword|passwordHash|token|rawToken|sessionToken|resetToken)=)[^&#]*/gi,
        '$1[REDACTED]',
      )
      .replace(
        /(?<![?&])((?:password|currentPassword|newPassword|confirm(?:New)?Password|temporaryPassword|passwordHash|token|rawToken|sessionToken|resetToken|cookie|set-cookie|authorization)\s*[:=]\s*)(?:"[^"]*"|[^,\r\n}]+)/gi,
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
