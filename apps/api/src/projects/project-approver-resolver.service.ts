import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ProjectApproverResolver {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  resolve(
    organizationId: string,
    projectId: string,
    permission: string,
    excludeUserId?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const now = new Date();
    return tx.user.findMany({
      where: {
        id: excludeUserId ? { not: excludeUserId } : undefined,
        status: 'active',
        organizationMembers: {
          some: { organizationId, status: 'active' },
        },
        roles: {
          some: {
            organizationId,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              status: 'active',
              permissions: { some: { permission: { code: permission } } },
            },
            AND: {
              OR: [
                { scopeType: { in: ['SYSTEM', 'ORGANIZATION'] } },
                { user: { projectMemberships: { some: { projectId } } } },
              ],
            },
          },
        },
      },
      select: { id: true, displayName: true, email: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
  }
}
