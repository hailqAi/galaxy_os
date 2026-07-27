import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { WarehouseService } from './warehouse.service';

const actor = {
  organizationId: 'org',
  userId: 'user',
  organizationMembershipId: 'member',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('Warehouse master', () => {
  it('scopes detail reads to the current organization', async () => {
    const service = new WarehouseService(
      {
        warehouse: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await expect(service.get(actor, 'warehouse')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a location whose zone belongs to another warehouse', async () => {
    const service = new WarehouseService(
      {
        warehouseZone: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({ id: 'warehouse' } as never);
    await expect(
      service.addLocation(actor, 'warehouse', {
        zoneId: '00000000-0000-4000-8000-000000000001',
        code: 'A-01',
        name: 'A-01',
        locationType: 'BIN',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
