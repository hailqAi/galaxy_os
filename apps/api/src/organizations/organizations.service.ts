import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { UpdateOrganizationDto } from './organizations.dto';
import { CreateOrganizationDto } from './organizations.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(actor: CurrentActor) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  update(actor: CurrentActor, data: UpdateOrganizationDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({
        where: { id: actor.organizationId },
      });
      if (!before) throw new NotFoundException('Organization not found');
      const after = await tx.organization.update({
        where: { id: actor.organizationId },
        data,
      });
      await this.audit.write(tx, actor, {
        action: 'organization.update',
        entityType: 'Organization',
        entityId: after.id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  listSystem(actor: CurrentActor) {
    this.systemOnly(actor);
    return this.prisma.organization.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { memberships: true, departments: true } } },
    });
  }

  createSystem(actor: CurrentActor, data: CreateOrganizationDto) {
    this.systemOnly(actor);
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data });
      await this.audit.write(tx, actor, {
        action: 'system.organization.create',
        entityType: 'Organization',
        entityId: organization.id,
        afterData: organization,
      });
      return organization;
    });
  }

  private systemOnly(actor: CurrentActor) {
    if (actor.administrationScope !== 'SYSTEM')
      throw new ForbiddenException('System Administrator required');
  }
}
