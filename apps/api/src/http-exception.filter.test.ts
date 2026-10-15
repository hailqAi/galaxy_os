import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter denial metadata', () => {
  it.each([
    [new UnauthorizedException('Authentication required'), 401],
    [new ForbiddenException('Required permission is missing'), 403],
    [new NotFoundException('File not found'), 404],
  ])(
    'redacts identifier-bearing request paths for denial %s',
    (error, status) => {
      const json = vi.fn();
      const response = { status: vi.fn().mockReturnThis(), json };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({
            url: '/api/v1/files/f1f23469-11a0-4616-96be-5c92b40ba2c5',
          }),
        }),
      } as unknown as ArgumentsHost;

      new HttpExceptionFilter().catch(error, host);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: status,
          message: error.message,
          path: '/api/v1/files/[REDACTED]',
        }),
      );
    },
  );
});

it('preserves safe error categories without returning request paths', () => {
  const json = vi.fn();
  const response = { status: vi.fn().mockReturnThis(), json };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/v1/uploads/private-id/complete' }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(
    new UnprocessableEntityException({
      category: 'INVALID_DOCUMENT',
      message: 'Loại hồ sơ không hợp lệ.',
    }),
    host,
  );

  expect(json).toHaveBeenCalledWith({
    statusCode: 422,
    error: 'UNPROCESSABLE_ENTITY',
    category: 'INVALID_DOCUMENT',
    message: 'Loại hồ sơ không hợp lệ.',
    timestamp: expect.any(String),
  });
});

it.each(['P2028', 'PRIVATE_TOKEN'])(
  'logs only a bounded database diagnostic for internal errors (%s)',
  (code) => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'PRIVATE_CUSTOMER PRIVATE_TOKEN PRIVATE_URL',
      { code, clientVersion: 'test' },
    );
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const json = vi.fn();
      const response = { status: vi.fn().mockReturnThis(), json };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({
            url: '/private-path',
            runtimeIdentity: {
              requestId: 'c5eb946b-c491-4c08-a96b-b0f239aed0bb',
            },
          }),
        }),
      } as unknown as ArgumentsHost;
      new HttpExceptionFilter().catch(error, host);
      expect(logged).toHaveBeenCalledWith({
        event: 'HTTP_INTERNAL_ERROR',
        requestId: 'c5eb946b-c491-4c08-a96b-b0f239aed0bb',
        databaseError: /^P\d{4}$/.test(code) ? code : 'UNKNOWN',
      });
      expect(JSON.stringify(logged.mock.calls)).not.toMatch(
        /PRIVATE_|private-path/,
      );
      expect(json.mock.calls[0]?.[0].message).toBe('Internal server error');
    } finally {
      logged.mockRestore();
    }
  },
);
