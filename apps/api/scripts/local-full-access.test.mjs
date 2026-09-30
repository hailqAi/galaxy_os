import { test } from 'vitest';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { assertG00Isolation } from './g00-isolated-environment.mjs';
import { provisionLocalAccess } from './local-full-access.mjs';

test('operator provisioning is isolated, atomic, scoped and idempotent', async () => {
  const target = assertG00Isolation();
  const db = new PrismaClient();
  try {
    const org = await db.organization.create({
      data: {
        slug: `access-${randomUUID()}`,
        name: 'Quyền giả lập',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    });
    const ownerEmail = `${randomUUID()}@example.test`,
      peerEmail = `${randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        email: ownerEmail,
        normalizedEmail: ownerEmail,
        status: 'active',
        displayName: 'Chủ giả lập',
        organizationMembers: {
          create: { organizationId: org.id, administrationScope: 'SYSTEM' },
        },
      },
    });
    const peer = await db.user.create({
      data: {
        email: peerEmail,
        normalizedEmail: peerEmail,
        status: 'active',
        displayName: 'Người khác',
        organizationMembers: { create: { organizationId: org.id } },
      },
    });
    const permission = await db.permission.findFirstOrThrow({
      where: { code: 'project.read' },
    });
    const shared = await db.role.create({
      data: {
        organizationId: org.id,
        code: 'system_admin',
        name: 'Quản trị',
        maximumScope: 'SYSTEM',
        administrationTier: 100,
        isProtected: true,
        permissions: { create: { permissionId: permission.id } },
      },
    });
    for (const u of [user, peer])
      await db.userRole.create({
        data: {
          organizationId: org.id,
          userId: u.id,
          roleId: shared.id,
          scopeType: 'SYSTEM',
        },
      });
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        type: 'INDIVIDUAL',
        displayName: 'Khách giả',
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const project = await db.project.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        code: randomUUID(),
        name: 'Project giả',
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const input = {
      database: target.databaseName,
      organizationId: org.id,
      userId: user.id,
      projectIds: [project.id],
      requestId: randomUUID(),
      provenance: 'Yêu cầu chủ hệ thống giả lập: full quyền.',
    };
    const plan = await provisionLocalAccess(db, input);
    assert.equal(plan.state, 'DRY_RUN');
    assert.equal(await db.role.count({ where: { organizationId: org.id } }), 1);
    await assert.rejects(
      provisionLocalAccess(db, { ...input, organizationId: randomUUID() }),
      /MEMBER/,
    );
    await assert.rejects(
      provisionLocalAccess(db, { ...input, projectIds: [randomUUID()] }),
      /PROJECT/,
    );
    await assert.rejects(
      provisionLocalAccess(db, input, 'wrong-digest'),
      /DRIFT/,
    );
    assert.equal(
      await db.chatProjectGrant.count({ where: { organizationId: org.id } }),
      0,
    );
    const grant = await db.chatProjectGrant.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        userId: user.id,
        grantedBy: user.id,
        actions: ['CREATE'],
        roomCeiling: [],
      },
    });
    await assert.rejects(provisionLocalAccess(db, input), /EXISTING_GRANT/);
    await db.chatProjectGrant.delete({ where: { id: grant.id } });
    const interrupted = db.$extends({
      query: {
        auditLog: {
          create() {
            throw new Error('SYNTHETIC_AUDIT_FAILURE');
          },
        },
      },
    });
    await assert.rejects(
      provisionLocalAccess(interrupted, input, plan.digest),
      /SYNTHETIC_AUDIT_FAILURE/,
    );
    assert.equal(await db.role.count({ where: { organizationId: org.id } }), 1);
    assert.equal(
      await db.chatProjectGrant.count({ where: { organizationId: org.id } }),
      0,
    );
    const first = await provisionLocalAccess(db, input, plan.digest);
    assert.equal(first.state, 'APPLIED');
    assert.equal(
      (await provisionLocalAccess(db, input, plan.digest)).state,
      'ALREADY_APPLIED',
    );
    assert.equal(
      await db.chatProjectGrant.count({
        where: { organizationId: org.id, userId: user.id },
      }),
      1,
    );
    assert.equal(
      await db.rolePermission.count({ where: { roleId: shared.id } }),
      1,
    );
    assert.equal(await db.userRole.count({ where: { userId: peer.id } }), 1);
    const audit = await db.auditLog.findUniqueOrThrow({
      where: { id: first.auditId },
    });
    assert.equal(audit.actorUserId, null);
    assert.equal(audit.metadata.provenance, input.provenance);
    await db.userRole.create({
      data: {
        organizationId: org.id,
        userId: peer.id,
        roleId: first.roleId,
        scopeType: 'SYSTEM',
        status: 'archived',
      },
    });
    await assert.rejects(
      provisionLocalAccess(db, input, plan.digest),
      /ROLE_OWNERSHIP/,
    );
  } finally {
    await db.$disconnect();
  }
});
