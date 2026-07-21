import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CurrentActor } from './access-control/current-actor';
import { AuditService } from './audit/audit.service';
import { readEnvironment } from './config/env';
import { PrismaService } from './prisma.service';

const typeOf = (buffer: Buffer) =>
  buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    ? ['jpg', 'image/jpeg']
    : buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? ['png', 'image/png']
      : buffer.subarray(0, 4).toString() === 'RIFF' &&
          buffer.subarray(8, 12).toString() === 'WEBP'
        ? ['webp', 'image/webp']
        : null;

@Injectable()
export class MeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(actor: CurrentActor) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarKey: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        credential: { select: { mustChangePassword: true } },
        organizationMembers: {
          where: { id: actor.organizationMembershipId },
          include: { organization: true },
        },
        departmentMembers: {
          where: { organizationId: actor.organizationId },
          include: { department: true },
        },
        roles: {
          where: {
            organizationId: actor.organizationId,
            role: { status: 'active' },
          },
          include: { role: true },
        },
      },
    });
    const membership = user.organizationMembers[0]!;
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      organizationId: actor.organizationId,
      avatarUrl: user.avatarKey ? `/me/avatar/${user.avatarKey}` : null,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      mustChangePassword: user.credential?.mustChangePassword ?? false,
      organization: membership.organization,
      membership: {
        id: membership.id,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
      departments: user.departmentMembers.map(({ department, isPrimary }) => ({
        ...department,
        isPrimary,
      })),
      roles: user.roles.map(({ role }) => role),
      permissions: actor.permissions,
      permissionSources: actor.permissionSources,
      administrationScope: actor.administrationScope,
      managedDepartmentIds: actor.managedDepartmentIds,
      administrationTier: actor.administrationTier,
    };
  }

  async updateProfile(actor: CurrentActor, displayNameInput: string) {
    const displayName = displayNameInput.trim().replace(/\s+/g, ' ');
    if (displayName.length < 2 || displayName.length > 120)
      throw new BadRequestException('Display name must be 2 to 120 characters');
    if (/\p{Cc}/u.test(displayName))
      throw new BadRequestException(
        'Display name contains unsupported characters',
      );
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { displayName: true },
      });
      const after = await tx.user.update({
        where: { id: actor.userId },
        data: { displayName },
        select: { id: true, email: true, displayName: true, avatarKey: true },
      });
      await this.audit.write(tx, actor, {
        action: 'user.profile.update',
        entityType: 'User',
        entityId: actor.userId,
        beforeData: before,
        afterData: { displayName: after.displayName },
      });
      return after;
    });
  }

  async uploadAvatar(actor: CurrentActor, file?: Express.Multer.File) {
    const env = readEnvironment();
    if (!file || file.size > env.AVATAR_MAX_BYTES)
      throw new BadRequestException('Avatar must be 2 MB or smaller');
    const detected = typeOf(file.buffer);
    if (!detected)
      throw new BadRequestException('Avatar must be JPEG, PNG, or WebP');
    const key = `${randomUUID()}.${detected[0]}`;
    await mkdir(env.AVATAR_STORAGE_PATH, { recursive: true });
    await writeFile(join(env.AVATAR_STORAGE_PATH, key), file.buffer, {
      flag: 'wx',
    });
    const previous = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { avatarKey: true },
      });
      await tx.user.update({
        where: { id: actor.userId },
        data: { avatarKey: key },
      });
      await this.audit.write(tx, actor, {
        action: 'user.avatar.update',
        entityType: 'User',
        entityId: actor.userId,
        metadata: { avatarKey: key },
      });
      return before.avatarKey;
    });
    if (previous && previous !== key)
      await unlink(join(env.AVATAR_STORAGE_PATH, previous)).catch(
        () => undefined,
      );
    return { avatarUrl: `/me/avatar/${key}` };
  }

  async removeAvatar(actor: CurrentActor) {
    const user = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { avatarKey: true },
      });
      await tx.user.update({
        where: { id: actor.userId },
        data: { avatarKey: null },
      });
      await this.audit.write(tx, actor, {
        action: 'user.avatar.remove',
        entityType: 'User',
        entityId: actor.userId,
      });
      return before;
    });
    if (user.avatarKey)
      await unlink(
        join(readEnvironment().AVATAR_STORAGE_PATH, user.avatarKey),
      ).catch(() => undefined);
    return { avatarUrl: null };
  }

  async avatar(actor: CurrentActor, key: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, avatarKey: key },
    });
    if (!user || !/^[0-9a-f-]+\.(jpg|png|webp)$/.test(key))
      throw new NotFoundException();
    const data = await readFile(
      join(readEnvironment().AVATAR_STORAGE_PATH, key),
    ).catch(() => null);
    if (!data) throw new NotFoundException();
    return {
      data,
      contentType: typeOf(data)?.[1] ?? 'application/octet-stream',
    };
  }

  sessions(actor: CurrentActor) {
    return this.prisma.session.findMany({
      where: {
        userId: actor.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  revokeSession(actor: CurrentActor, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId: actor.userId, revokedAt: null },
      });
      if (!session) throw new NotFoundException('Session not found');
      await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(tx, actor, {
        action: 'session.self.revoke',
        entityType: 'Session',
        entityId: sessionId,
      });
      return { revoked: true };
    });
  }
}
