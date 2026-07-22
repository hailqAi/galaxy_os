import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { readEnvironment } from '../config/env';
import { PrismaService } from '../prisma.service';
import { UserManagementPolicy } from '../access-control/user-management.policy';
import { EmailService } from './email.service';

const invalid = () =>
  new UnauthorizedException('Email hoặc mật khẩu không đúng.');
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const forgotAttempts = new Map<string, number[]>();
const loginAttempts = new Map<string, number[]>();

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(UserManagementPolicy) private readonly policy: UserManagementPolicy,
  ) {}

  async login(emailInput: string, password: string, requestIp = 'unknown') {
    try {
      this.checkRate(loginAttempts, `ip:${requestIp}`, 30, 'rate limited');
    } catch {
      throw invalid();
    }
    const normalizedEmail = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: {
        credential: true,
        organizationMembers: {
          where: { status: 'active', organization: { status: 'active' } },
          take: 2,
        },
      },
    });
    const credential = user?.credential;
    if (
      !user ||
      user.status !== 'active' ||
      !credential ||
      Buffer.byteLength(password) > 72 ||
      !(await compare(password, credential.passwordHash).catch(() => false))
    ) {
      if (user && credential) {
        const membership = user.organizationMembers[0];
        await this.failedLogin(
          user.id,
          credential.failedLoginCount,
          membership?.id,
          membership?.organizationId,
          user.email,
          user.displayName,
        );
      }
      throw invalid();
    }
    if (user.organizationMembers.length !== 1) throw invalid();
    const membership = user.organizationMembers[0]!;
    const token = randomBytes(32).toString('base64url');
    const environment = readEnvironment();
    const expiresAt = new Date(
      Date.now() + environment.SESSION_TTL_HOURS * 3_600_000,
    );
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId: user.id,
          organizationMembershipId: membership.id,
          tokenHash: tokenHash(token),
          expiresAt,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await tx.passwordCredential.update({
        where: { userId: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      await this.audit.write(
        tx,
        {
          userId: user.id,
          organizationId: membership.organizationId,
          organizationMembershipId: membership.id,
          email: user.email,
          displayName: user.displayName,
          mustChangePassword: credential.mustChangePassword,
          permissions: [],
          permissionSources: [],
          administrationScope: 'SELF',
          managedDepartmentIds: [],
          administrationTier: 0,
        },
        { action: 'auth.login', entityType: 'Session', entityId: created.id },
      );
    });
    return { token, expiresAt };
  }

  async logout(actor: CurrentActor) {
    if (!actor.sessionId) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: actor.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(tx, actor, {
        action: 'auth.logout',
        entityType: 'Session',
        entityId: actor.sessionId!,
      });
    });
  }

  async changePassword(
    actor: CurrentActor,
    currentPassword: string,
    newPassword: string,
    confirmation: string,
  ) {
    if (newPassword !== confirmation)
      throw new BadRequestException('New passwords do not match');
    if (Buffer.byteLength(newPassword) > 72)
      throw new BadRequestException(
        'New password must be at most 72 UTF-8 bytes',
      );
    const credential = await this.prisma.passwordCredential.findUniqueOrThrow({
      where: { userId: actor.userId },
    });
    if (!(await compare(currentPassword, credential.passwordHash)))
      throw new BadRequestException('Current password is incorrect');
    if (await compare(newPassword, credential.passwordHash))
      throw new ConflictException(
        'New password must differ from current password',
      );
    const passwordHash = await hash(
      newPassword,
      readEnvironment().PASSWORD_BCRYPT_ROUNDS,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.update({
        where: { userId: actor.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: actor.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(tx, actor, {
        action: 'auth.password.change',
        entityType: 'User',
        entityId: actor.userId,
      });
    });
  }

  async issueTemporaryPassword(actor: CurrentActor, userId: string) {
    await this.policy.assert(actor, userId, 'resetPassword');
    const temporaryPassword = randomBytes(18).toString('base64url');
    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationMembers: { some: { organizationId: actor.organizationId } },
      },
    });
    if (!target) throw new NotFoundException('User not found');
    const passwordHash = await hash(
      temporaryPassword,
      readEnvironment().PASSWORD_BCRYPT_ROUNDS,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.upsert({
        where: { userId },
        create: { userId, passwordHash },
        update: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(tx, actor, {
        action: 'user.password.reset',
        entityType: 'User',
        entityId: userId,
      });
    });
    return { temporaryPassword };
  }

  async revokeSessions(actor: CurrentActor, userId: string) {
    await this.policy.assert(actor, userId, 'revokeSessions');
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: actor.organizationId,
            userId,
          },
        },
      });
      if (!target) throw new NotFoundException('User not found');
      const result = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.write(tx, actor, {
        action: 'user.session.revoke',
        entityType: 'User',
        entityId: userId,
        metadata: { count: result.count },
      });
      return { revoked: result.count };
    });
  }

  async forgotPassword(emailInput: string, requestIp = 'unknown') {
    const normalizedEmail = emailInput.trim().toLowerCase();
    this.checkForgotRate(`ip:${requestIp}`, 20);
    this.checkForgotRate(
      `account:${createHash('sha256').update(normalizedEmail).digest('hex')}`,
      5,
    );
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: {
        organizationMembers: {
          where: { status: 'active', organization: { status: 'active' } },
          take: 1,
        },
      },
    });
    if (user?.status === 'active' && user.organizationMembers[0])
      void this.createReset(user.id, user.email, requestIp, {
        userId: user.id,
        organizationId: user.organizationMembers[0].organizationId,
        organizationMembershipId: user.organizationMembers[0].id,
        email: user.email,
        displayName: user.displayName,
        mustChangePassword: false,
        permissions: [],
        permissionSources: [],
        administrationScope: 'SELF',
        managedDepartmentIds: [],
        administrationTier: 0,
      }).catch(() => undefined);
    return { accepted: true };
  }

  async sendResetForUser(actor: CurrentActor, userId: string) {
    await this.policy.assert(actor, userId, 'resetPassword');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await this.createReset(user.id, user.email, 'administrator', actor);
    return { accepted: true };
  }

  async completePasswordReset(
    rawToken: string,
    newPassword: string,
    confirmation: string,
  ) {
    if (newPassword !== confirmation)
      throw new BadRequestException('New passwords do not match');
    if (Buffer.byteLength(newPassword) > 72)
      throw new BadRequestException(
        'New password must be at most 72 UTF-8 bytes',
      );
    const hashValue = tokenHash(rawToken);
    const passwordHash = await hash(
      newPassword,
      readEnvironment().PASSWORD_BCRYPT_ROUNDS,
    );
    const result = await this.prisma.$transaction(
      async (tx) => {
        const reset = await tx.passwordResetToken.findUnique({
          where: { tokenHash: hashValue },
          include: {
            user: {
              include: {
                organizationMembers: { where: { status: 'active' }, take: 1 },
              },
            },
          },
        });
        if (
          !reset ||
          reset.usedAt ||
          reset.revokedAt ||
          reset.expiresAt <= new Date()
        )
          throw new BadRequestException(
            'Password reset link is invalid or expired',
          );
        const claimed = await tx.passwordResetToken.updateMany({
          where: {
            id: reset.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new BadRequestException(
            'Password reset link is invalid or expired',
          );
        await tx.passwordCredential.upsert({
          where: { userId: reset.userId },
          create: {
            userId: reset.userId,
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          },
          update: {
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
        await tx.session.updateMany({
          where: { userId: reset.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.passwordResetToken.updateMany({
          where: {
            userId: reset.userId,
            id: { not: reset.id },
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        const membership = reset.user.organizationMembers[0];
        if (membership)
          await this.audit.write(
            tx,
            {
              userId: reset.user.id,
              organizationId: membership.organizationId,
              organizationMembershipId: membership.id,
              email: reset.user.email,
              displayName: reset.user.displayName,
              mustChangePassword: false,
              permissions: [],
              permissionSources: [],
              administrationScope: 'SELF',
              managedDepartmentIds: [],
              administrationTier: 0,
            },
            {
              action: 'auth.password.reset.complete',
              entityType: 'User',
              entityId: reset.user.id,
            },
          );
        return reset.user.email;
      },
      { isolationLevel: 'Serializable' },
    );
    await this.email.passwordChanged(result);
    return { reset: true };
  }

  private async createReset(
    userId: string,
    email: string,
    requestIp: string,
    actor: CurrentActor,
  ) {
    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const reset = await tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash: tokenHash(rawToken),
          requestIp,
          expiresAt: new Date(
            Date.now() + readEnvironment().PASSWORD_RESET_TTL_MINUTES * 60_000,
          ),
        },
      });
      await this.audit.write(tx, actor, {
        action: 'auth.password.reset.request',
        entityType: 'PasswordResetToken',
        entityId: reset.id,
      });
    });
    void this.email.passwordReset(email, rawToken).catch(() => undefined);
  }

  private checkForgotRate(key: string, limit: number) {
    this.checkRate(
      forgotAttempts,
      key,
      limit,
      'Too many password reset requests',
    );
  }

  private checkRate(
    attempts: Map<string, number[]>,
    key: string,
    limit: number,
    message: string,
  ) {
    const now = Date.now();
    // ponytail: process-local limiter; move to Redis when the API runs on multiple instances.
    const recent = (attempts.get(key) ?? []).filter(
      (time) => time > now - 15 * 60_000,
    );
    if (recent.length >= limit) throw new ConflictException(message);
    attempts.set(key, [...recent, now]);
    if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value!);
  }

  private async failedLogin(
    userId: string,
    count: number,
    membershipId?: string,
    organizationId?: string,
    email?: string,
    displayName?: string,
  ) {
    const failedLoginCount = count + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.update({
        where: { userId },
        data: {
          failedLoginCount,
          lockedUntil: null,
        },
      });
      if (membershipId && organizationId && email && displayName)
        await this.audit.write(
          tx,
          {
            userId,
            organizationId,
            organizationMembershipId: membershipId,
            email,
            displayName,
            mustChangePassword: false,
            permissions: [],
            permissionSources: [],
            administrationScope: 'SELF',
            managedDepartmentIds: [],
            administrationTier: 0,
          },
          {
            action: 'auth.login.failure',
            entityType: 'User',
            entityId: userId,
            metadata: { failedLoginCount },
          },
        );
    });
  }
}
