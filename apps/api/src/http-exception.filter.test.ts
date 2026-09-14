import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
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
