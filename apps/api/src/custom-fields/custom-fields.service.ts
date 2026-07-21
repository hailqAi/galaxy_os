import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomFieldDefinition, Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateCustomFieldDto } from './custom-fields.dto';
import { UserManagementPolicy } from '../access-control/user-management.policy';

@Injectable()
export class CustomFieldsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UserManagementPolicy) private readonly policy: UserManagementPolicy,
  ) {}

  list(actor: CurrentActor, entityType?: CustomFieldDefinition['entityType']) {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        entityType,
        status: 'active',
        OR: [
          { scope: 'SYSTEM' },
          { scope: 'ORGANIZATION', organizationId: actor.organizationId },
        ],
        AND: [
          {
            OR: [
              { visibilityPermission: null },
              { visibilityPermission: { in: actor.permissions } },
            ],
          },
        ],
      },
      orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }, { key: 'asc' }],
    });
  }

  create(actor: CurrentActor, input: CreateCustomFieldDto) {
    this.assertScope(actor, input.scope);
    this.validateDefinition(input);
    return this.prisma.$transaction(async (tx) => {
      const field = await tx.customFieldDefinition.create({
        data: {
          ...input,
          defaultValue: input.defaultValue as never,
          options: input.options as never,
          validation: input.validation as never,
          organizationId:
            input.scope === 'ORGANIZATION' ? actor.organizationId : null,
          createdByUserId: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'custom-field.create',
        entityType: 'CustomFieldDefinition',
        entityId: field.id,
        afterData: field,
      });
      return field;
    });
  }

  archive(actor: CurrentActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const field = await tx.customFieldDefinition.findFirst({
        where: {
          id,
          OR: [
            { organizationId: actor.organizationId },
            { organizationId: null },
          ],
        },
      });
      if (!field) throw new NotFoundException('Custom field not found');
      this.assertScope(actor, field.scope);
      const after = await tx.customFieldDefinition.update({
        where: { id },
        data: { status: 'archived' },
      });
      await this.audit.write(tx, actor, {
        action: 'custom-field.archive',
        entityType: 'CustomFieldDefinition',
        entityId: id,
        beforeData: field,
        afterData: after,
      });
      return after;
    });
  }

  async setValues(
    actor: CurrentActor,
    entityType: CustomFieldDefinition['entityType'],
    entityId: string,
    values: Record<string, unknown>,
  ) {
    if (entityType === 'USER')
      await this.policy.assert(actor, entityId, 'update');
    if (
      entityType === 'DEPARTMENT' &&
      actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
      !actor.managedDepartmentIds.includes(entityId)
    )
      throw new NotFoundException('Custom field target not found');
    if (
      entityType === 'ROLE' &&
      !['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope)
    )
      throw new ForbiddenException(
        'Organization administration scope required',
      );
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: {
        entityType,
        status: 'active',
        OR: [{ scope: 'SYSTEM' }, { organizationId: actor.organizationId }],
      },
    });
    const byKey = new Map(definitions.map((field) => [field.key, field]));
    for (const [key, value] of Object.entries(values)) {
      const field = byKey.get(key);
      if (!field) throw new BadRequestException(`Unknown custom field: ${key}`);
      if (
        field.editPermission &&
        !actor.permissions.includes(field.editPermission)
      )
        throw new ForbiddenException(`Custom field is not editable: ${key}`);
      this.validateValue(field, value);
    }
    return this.prisma.$transaction(async (tx) => {
      const target = await this.target(tx, actor, entityType, entityId);
      const customData = {
        ...((target.customData as Record<string, unknown>) ?? {}),
        ...values,
      };
      for (const field of definitions)
        if (
          field.required &&
          customData[field.key] == null &&
          field.defaultValue == null
        )
          throw new BadRequestException(
            `Required custom field is missing: ${field.key}`,
          );
      const after = await this.updateTarget(
        tx,
        entityType,
        entityId,
        customData,
      );
      await this.audit.write(tx, actor, {
        action: 'custom-field.values.update',
        entityType,
        entityId,
        beforeData: target.customData,
        afterData: customData,
      });
      return after;
    });
  }

  private assertScope(actor: CurrentActor, scope: 'SYSTEM' | 'ORGANIZATION') {
    if (scope === 'SYSTEM' && actor.administrationScope !== 'SYSTEM')
      throw new ForbiddenException('System Administrator required');
  }

  private validateDefinition(input: CreateCustomFieldDto) {
    if (
      ['SINGLE_SELECT', 'MULTI_SELECT'].includes(input.dataType) &&
      (!input.options?.length ||
        input.options.some(
          (value) => typeof value !== 'string' || !value.trim(),
        ))
    )
      throw new BadRequestException(
        'Select fields require unique non-empty string options',
      );
    if (
      input.options &&
      new Set(input.options.map(String)).size !== input.options.length
    )
      throw new BadRequestException('Custom field options must be unique');
    if (input.defaultValue !== undefined)
      this.validateValue(input as CustomFieldDefinition, input.defaultValue);
  }

  private validateValue(
    field: Pick<CustomFieldDefinition, 'key' | 'dataType' | 'options'>,
    value: unknown,
  ) {
    if (value == null) return;
    const options = Array.isArray(field.options) ? field.options : [];
    const valid =
      field.dataType === 'BOOLEAN'
        ? typeof value === 'boolean'
        : field.dataType === 'NUMBER'
          ? typeof value === 'number' && Number.isFinite(value)
          : field.dataType === 'MULTI_SELECT'
            ? Array.isArray(value) &&
              value.every(
                (item) => typeof item === 'string' && options.includes(item),
              )
            : field.dataType === 'SINGLE_SELECT'
              ? typeof value === 'string' && options.includes(value)
              : typeof value === 'string' &&
                (field.dataType !== 'EMAIL' ||
                  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) &&
                (!['DATE', 'DATETIME'].includes(field.dataType) ||
                  !Number.isNaN(Date.parse(value)));
    if (!valid)
      throw new BadRequestException(`Invalid custom field value: ${field.key}`);
  }

  private async target(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    type: CustomFieldDefinition['entityType'],
    id: string,
  ) {
    const where = {
      id,
      ...(type !== 'USER' && { organizationId: actor.organizationId }),
    };
    const result =
      type === 'USER'
        ? await tx.user.findFirst({
            where: {
              id,
              organizationMembers: {
                some: { organizationId: actor.organizationId },
              },
            },
            select: { customData: true },
          })
        : type === 'ORGANIZATION_MEMBER'
          ? await tx.organizationMembership.findFirst({
              where,
              select: { customData: true },
            })
          : type === 'DEPARTMENT'
            ? await tx.department.findFirst({
                where,
                select: { customData: true },
              })
            : await tx.role.findFirst({ where, select: { customData: true } });
    if (!result) throw new NotFoundException('Custom field target not found');
    return result;
  }

  private updateTarget(
    tx: Prisma.TransactionClient,
    type: CustomFieldDefinition['entityType'],
    id: string,
    customData: Record<string, unknown>,
  ) {
    const data = { customData: customData as Prisma.InputJsonValue };
    return type === 'USER'
      ? tx.user.update({
          where: { id },
          data,
          select: { id: true, customData: true },
        })
      : type === 'ORGANIZATION_MEMBER'
        ? tx.organizationMembership.update({
            where: { id },
            data,
            select: { id: true, customData: true },
          })
        : type === 'DEPARTMENT'
          ? tx.department.update({
              where: { id },
              data,
              select: { id: true, customData: true },
            })
          : tx.role.update({
              where: { id },
              data,
              select: { id: true, customData: true },
            });
  }
}
