import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import { PermissionGuard } from './permission.guard';

const context = (actor?: object) =>
  ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  }) as unknown as ExecutionContext;

describe('access control', () => {
  it('denies a missing permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['organization.update']),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    expect(() =>
      guard.canActivate(context({ permissions: ['organization.read'] })),
    ).toThrow(ForbiddenException);
  });

  it('allows a resolved permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['organization.read']),
    } as unknown as Reflector;
    expect(
      new PermissionGuard(reflector).canActivate(
        context({ permissions: ['organization.read'] }),
      ),
    ).toBe(true);
  });

  it('denies a disabled user or membership', async () => {
    process.env.ALLOW_DEV_AUTH = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(null) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'disabled',
          organizationMembers: [],
          roles: [],
        }),
      },
    } as unknown as PrismaService;
    await expect(
      new DevelopmentAuthGuard(reflector, prisma).canActivate(context()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects ambiguous development organization membership', async () => {
    process.env.ALLOW_DEV_AUTH = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(null) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'active',
          organizationMembers: [
            { organizationId: 'a' },
            { organizationId: 'b' },
          ],
          roles: [],
        }),
      },
    } as unknown as PrismaService;
    await expect(
      new DevelopmentAuthGuard(reflector, prisma).canActivate(context()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
