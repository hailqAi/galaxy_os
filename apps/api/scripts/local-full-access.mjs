import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const requestSchema = z
  .object({
    database: z.string().regex(/^(galaxy_os|galaxy_os_g00_[a-z0-9_]+)$/),
    organizationId: z.uuid(),
    userId: z.uuid(),
    requestId: z.uuid(),
    projectIds: z.array(z.uuid()).min(1).max(100),
    provenance: z.string().min(10).max(1000),
  })
  .strict();
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireTrue = (value, reason) => {
  if (!value) throw new Error(reason);
};
const actions = ['CREATE', 'ACCESS_ADMIN', 'LOCK', 'HISTORY', 'PUBLISH'];
const roomCeiling = ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'LOCK', 'HISTORY'];

// Operator-only, explicit manifest and reviewed digest; never imported by HTTP handlers.
export async function provisionLocalAccess(db, raw, approvedDigest) {
  const input = requestSchema.parse(raw);
  input.projectIds.sort();
  requireTrue(
    new Set(input.projectIds).size === input.projectIds.length,
    'DUPLICATE_PROJECT',
  );
  return db.$transaction(
    async (tx) => {
      const [identity] =
        await tx.$queryRaw`SELECT current_database() AS name,current_schema() AS schema,NOW() AS now`;
      requireTrue(
        identity.name === input.database && identity.schema === 'public',
        'DATABASE_IDENTITY',
      );
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Project" WHERE id IN (${Prisma.join(input.projectIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
      );
      // Short local maintenance: also blocks uncoordinated IAM/room grant writers during revalidation.
      await tx.$executeRaw`LOCK TABLE "Organization", "User", "OrganizationMembership", "Role", "Permission", "RolePermission", "UserRole", "ChatRoom", "ChatProjectGrant", "ChatRoomGrant" IN SHARE ROW EXCLUSIVE MODE`;
      const { organizationId, userId } = input;
      const code = `local_full_${userId}`;
      const read = async () => {
        const member = await tx.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId, userId } },
          select: {
            id: true,
            status: true,
            kind: true,
            administrationScope: true,
            user: { select: { status: true } },
            organization: { select: { status: true } },
          },
        });
        requireTrue(
          member?.status === 'active' &&
            member.kind === 'INTERNAL' &&
            member.user.status === 'active' &&
            member.organization.status === 'active' &&
            member.administrationScope === 'SYSTEM',
          'MEMBER_IDENTITY',
        );
        const assignments = await tx.userRole.findMany({
          where: { organizationId, userId },
          orderBy: { id: 'asc' },
          include: {
            role: {
              include: {
                permissions: {
                  orderBy: { permissionId: 'asc' },
                  include: { permission: { select: { code: true } } },
                },
              },
            },
          },
        });
        requireTrue(
          assignments.some(
            (a) =>
              a.scopeType === 'SYSTEM' &&
              a.status === 'active' &&
              (!a.expiresAt || a.expiresAt > identity.now) &&
              a.role.code === 'system_admin' &&
              a.role.status === 'active' &&
              a.role.administrationTier === 100 &&
              a.role.isProtected,
          ),
          'SYSTEM_AUTHORITY',
        );
        const catalog = await tx.permission.findMany({
          select: { id: true, code: true },
          orderBy: { code: 'asc' },
        });
        const projects = await tx.project.findMany({
          where: {
            id: { in: input.projectIds },
            organizationId,
            deletedAt: null,
          },
          select: {
            id: true,
            chatRooms: { select: { id: true }, orderBy: { id: 'asc' } },
          },
          orderBy: { id: 'asc' },
        });
        requireTrue(
          projects.length === input.projectIds.length,
          'PROJECT_SCOPE',
        );
        const owned = await tx.role.findUnique({
          where: { organizationId_code: { organizationId, code } },
          include: {
            users: { orderBy: { id: 'asc' } },
            permissions: { orderBy: { permissionId: 'asc' } },
          },
        });
        if (owned)
          requireTrue(
            owned.customData?.ownerUserId === userId &&
              owned.users.every(
                (a) =>
                  a.userId === userId && a.organizationId === organizationId,
              ),
            'ROLE_OWNERSHIP',
          );
        const grants = await tx.chatProjectGrant.findMany({
          where: {
            organizationId,
            userId,
            projectId: { in: input.projectIds },
          },
          orderBy: { id: 'asc' },
        });
        const roomGrants = await tx.chatRoomGrant.findMany({
          where: {
            organizationId,
            userId,
            projectId: { in: input.projectIds },
          },
          orderBy: { id: 'asc' },
        });
        return {
          member,
          assignments,
          catalog,
          projects,
          owned,
          grants,
          roomGrants,
        };
      };
      const before = await read();
      const receipt = await tx.auditLog.findFirst({
        where: {
          organizationId,
          action: 'operator.local.full-access',
          entityId: userId,
          metadata: { path: ['requestId'], equals: input.requestId },
        },
      });
      if (receipt) {
        requireTrue(
          receipt.metadata.requestDigest === digest(input) &&
            receipt.afterData.digest === digest(before),
          'APPLIED_STATE_DRIFT',
        );
        return {
          state: 'ALREADY_APPLIED',
          auditId: receipt.id,
          roleId: before.owned.id,
        };
      }
      requireTrue(!before.owned, 'EXISTING_ROLE_WITHOUT_RECEIPT');
      requireTrue(
        !before.grants.length &&
          !before.roomGrants.length &&
          before.projects.every((p) => !p.chatRooms.length),
        'EXISTING_GRANT_OR_ROOM',
      );
      const existing = new Set(
        before.assignments
          .filter(
            (a) =>
              a.status === 'active' &&
              a.role.status === 'active' &&
              (!a.expiresAt || a.expiresAt > identity.now),
          )
          .flatMap((a) => a.role.permissions.map((p) => p.permission.code)),
      );
      const missing = before.catalog.filter((p) => !existing.has(p.code));
      // Delegation checks role.assign and chat capabilities within the same assignment.
      const bindings = before.catalog.filter(
        (p) => missing.some((m) => m.id === p.id) || p.code === 'role.assign',
      );
      const plan = {
        state: 'DRY_RUN',
        digest: digest({ input, before }),
        organizationId,
        userId,
        projectIds: input.projectIds,
        missing: missing.map((p) => p.code),
        bindings: bindings.map((p) => p.code),
      };
      if (!approvedDigest) return plan;
      requireTrue(approvedDigest === plan.digest, 'PLAN_DRIFT');
      const role = await tx.role.create({
        data: {
          organizationId,
          code,
          name: 'Toàn quyền riêng theo yêu cầu chủ hệ thống',
          description: input.provenance,
          maximumScope: 'SYSTEM',
          administrationTier: 100,
          isProtected: true,
          isDelegable: false,
          customData: { ownerUserId: userId },
          permissions: {
            create: bindings.map((p) => ({ permissionId: p.id })),
          },
        },
      });
      await tx.userRole.create({
        data: { organizationId, userId, roleId: role.id, scopeType: 'SYSTEM' },
      });
      for (const projectId of input.projectIds)
        await tx.chatProjectGrant.create({
          data: {
            organizationId,
            projectId,
            userId,
            grantedBy: userId,
            actions,
            roomCeiling,
            effectiveAt: identity.now,
          },
        });
      const audit = await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: null,
          action: 'operator.local.full-access',
          entityType: 'User',
          entityId: userId,
          beforeData: {
            digest: digest(before),
            permissions: [...existing].sort(),
          },
          afterData: {
            digest: digest(await read()),
            roleId: role.id,
            addedPermissions: plan.missing,
            projectIds: input.projectIds,
          },
          metadata: {
            requestId: input.requestId,
            requestDigest: digest(input),
            requesterUserId: userId,
            targetUserId: userId,
            provenance: input.provenance,
            execution: 'LOCAL_OPERATOR',
            approvedPlanDigest: approvedDigest,
          },
        },
      });
      return {
        state: 'APPLIED',
        roleId: role.id,
        auditId: audit.id,
        addedPermissions: plan.missing,
        projectCount: input.projectIds.length,
      };
    },
    { timeout: 15000 },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [manifest, approvedDigest] = process.argv.slice(2);
  requireTrue(
    manifest && process.argv.length <= 4,
    'Dùng manifest.json [digest-đã-review]',
  );
  const url = new URL(process.env.DATABASE_URL);
  requireTrue(
    ['localhost', '127.0.0.1'].includes(url.hostname),
    'LOCAL_DATABASE_ONLY',
  );
  requireTrue(
    url.pathname !== '/galaxy_os' || (url.port || '5432') === '5432',
    'MAIN_DATABASE_PORT',
  );
  const db = new PrismaClient();
  try {
    console.log(
      JSON.stringify(
        await provisionLocalAccess(
          db,
          JSON.parse(readFileSync(manifest, 'utf8')),
          approvedDigest,
        ),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      error instanceof z.ZodError ? 'INVALID_MANIFEST' : error.message,
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
