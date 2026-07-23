import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../access-control/current-actor';

const actor = {
  organizationId: 'organization',
  userId: 'user',
} as CurrentActor;

describe('CustomersService', () => {
  it('always scopes customer lists to the current organization', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = {
      customer: { findMany, count },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    const result = await new CustomersService(prisma, {} as AuditService).list(
      actor,
      { page: 1, pageSize: 20 },
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization',
          deletedAt: null,
        }),
      }),
    );
    expect(result).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('clears the previous primary contact in the same transaction', async () => {
    const tx = {
      contact: {
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'contact' }),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      customer: {
        findFirst: vi.fn().mockResolvedValue({ id: 'customer', contacts: [] }),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() } as unknown as AuditService;
    await new CustomersService(prisma, audit).createContact(actor, 'customer', {
      firstName: 'An',
      isPrimary: true,
    });
    expect(tx.contact.updateMany).toHaveBeenCalledOnce();
    expect(tx.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          displayName: 'An',
          organizationId: 'organization',
        }),
      }),
    );
  });
});
