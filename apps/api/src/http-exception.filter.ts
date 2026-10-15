import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { redact } from './security-redaction';

type HttpRequest = { url: string; runtimeIdentity?: { requestId: string } };
type HttpResponse = {
  status(code: number): HttpResponse;
  json(body: unknown): void;
};
const resourceIdentifier =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const request = host.switchToHttp().getRequest<HttpRequest>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof Prisma.PrismaClientKnownRequestError &&
            exception.code === 'P2002'
          ? HttpStatus.CONFLICT
          : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status === HttpStatus.INTERNAL_SERVER_ERROR)
      this.logger.error({
        event: 'HTTP_INTERNAL_ERROR',
        ...(request.runtimeIdentity &&
          /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
            request.runtimeIdentity.requestId,
          ) && { requestId: request.runtimeIdentity.requestId }),
        databaseError:
          exception instanceof Prisma.PrismaClientKnownRequestError &&
          /^P\d{4}$/.test(exception.code)
            ? exception.code
            : 'UNKNOWN',
      });
    const detail =
      exception instanceof HttpException
        ? exception.getResponse()
        : status === HttpStatus.CONFLICT
          ? 'A record with this unique value already exists'
          : 'Internal server error';
    const message =
      typeof detail === 'string'
        ? detail
        : (detail as { message?: unknown }).message;
    const category =
      typeof detail === 'object' && detail
        ? (detail as { category?: unknown }).category
        : undefined;
    const denial = [
      HttpStatus.UNAUTHORIZED,
      HttpStatus.FORBIDDEN,
      HttpStatus.NOT_FOUND,
    ].includes(status);
    const path = String(redact(request.url));

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      ...(typeof category === 'string' ? { category } : {}),
      message,
      ...(typeof category === 'string'
        ? {}
        : {
            path: denial
              ? path.replace(resourceIdentifier, '[REDACTED]')
              : path,
          }),
      timestamp: new Date().toISOString(),
    });
  }
}
