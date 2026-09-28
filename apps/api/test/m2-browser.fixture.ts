import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export async function createM2BrowserFixture() {
  const target = JSON.parse(
    execFileSync(
      process.execPath,
      [resolve(__dirname, '../scripts/g00-isolated-environment.mjs')],
      { encoding: 'utf8' },
    ),
  ) as { databaseName: string; databaseUser: string };
  const db = new PrismaClient();
  const run = randomUUID();
  const password = 'm2a-browser-fixture-only';
  const users: Record<string, { id: string; email: string; cookie: string }> =
    {};
  try {
    const identity = await db.$queryRaw<
      { database: string; username: string }[]
    >`SELECT current_database() AS database,current_user AS username`;
    if (
      identity[0]?.database !== target.databaseName ||
      identity[0]?.username !== target.databaseUser
    )
      throw new Error('Fixture database identity mismatch');
    const org = await db.organization.create({
      data: {
        slug: `browser-${run}`,
        name: 'M2 trình duyệt giả lập',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    });
    const digest = await hash(password, 4);
    for (const name of [
      'authority',
      'manager',
      'sender',
      'viewer',
      'guest',
      'publisher',
    ]) {
      const email = `${name}-${run}@example.test`;
      const user = await db.user.create({
        data: {
          email,
          normalizedEmail: email,
          displayName: `M2 ${name}`,
          status: 'active',
          credential: {
            create: { passwordHash: digest, mustChangePassword: false },
          },
          organizationMembers: {
            create: {
              organizationId: org.id,
              kind: name === 'guest' ? 'EXTERNAL' : 'INTERNAL',
            },
          },
        },
      });
      users[name] = { id: user.id, email, cookie: '' };
    }
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: `browser-${run}`,
        name: 'Fixture IAM authority',
        administrationTier: 10,
        permissions: {
          create: [
            'role.assign',
            'chat.create',
            'chat.access.manage',
            'chat.lock',
            'chat.history',
            'chat.publish',
            'chat.read',
            'chat.send',
            'chat.upload',
            'chat.download',
          ].map((code) => ({ permission: { connect: { code } } })),
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: org.id,
        userId: users.authority!.id,
        roleId: role.id,
        scopeType: 'ORGANIZATION',
      },
    });
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        displayName: 'Khách fixture',
        type: 'INDIVIDUAL',
        createdBy: users.authority!.id,
        updatedBy: users.authority!.id,
      },
    });
    const project = await db.project.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        code: `browser-${run}`,
        name: 'Project browser M2-A',
        createdBy: users.authority!.id,
        updatedBy: users.authority!.id,
      },
    });
    const api = process.env.INTERNAL_API_URL!;
    for (const user of Object.values(users)) {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      if (!res.ok) throw new Error(`Fixture login ${res.status}`);
      user.cookie = res.headers.getSetCookie()[0]!.split(';')[0]!;
    }
    async function post(
      actor: string,
      path: string,
      body: unknown,
    ): Promise<Record<string, string>> {
      const response = await fetch(`${api}/project-chat${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: users[actor]!.cookie,
          'X-Chat-Actor': users[actor]!.id,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Fixture ${path}: ${response.status}`);
      return response.json();
    }
    const managerAuthority = await post(
      'authority',
      `/projects/${project.id}/authorities`,
      {
        userId: users.manager!.id,
        actions: ['CREATE', 'ACCESS_ADMIN', 'LOCK', 'HISTORY'],
        roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'LOCK', 'HISTORY'],
      },
    );
    const internal = await post('manager', `/projects/${project.id}/rooms`, {
      title: 'Nội bộ thử nghiệm',
      group: 'CONSULTING',
      audience: 'INTERNAL',
    });
    const external = await post('manager', `/projects/${project.id}/rooms`, {
      title: 'Khách thử nghiệm',
      group: 'CONSULTING',
      audience: 'CUSTOMER',
    });
    const sender = await post('manager', `/rooms/${internal.id}/grants`, {
      userId: users.sender!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    });
    await post('manager', `/rooms/${internal.id}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ'],
    });
    await post('authority', `/projects/${project.id}/participants`, {
      userId: users.guest!.id,
    });
    await post('manager', `/rooms/${external.id}/grants`, {
      userId: users.guest!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const sourcePermissions = [
      'file.read',
      'file.download',
      'file.upload',
      'project.document.manage',
      'project.document.review',
    ];
    const sourceRole = await db.role.create({
      data: {
        organizationId: org.id,
        code: `source-${run}`,
        name: 'Nguồn fixture',
        administrationTier: 0,
        permissions: {
          create: sourcePermissions.map((code) => ({
            permission: { connect: { code } },
          })),
        },
      },
    });
    for (const actor of ['sender', 'publisher']) {
      await db.userRole.create({
        data: {
          organizationId: org.id,
          userId: users[actor]!.id,
          roleId: sourceRole.id,
          scopeType: 'ORGANIZATION',
        },
      });
      await post('manager', `/rooms/${external.id}/grants`, {
        userId: users[actor]!.id,
        actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
      });
    }
    await post('authority', `/projects/${project.id}/authorities`, {
      userId: users.publisher!.id,
      actions: ['PUBLISH'],
      roomCeiling: [],
    });
    async function domain(actor: string, path: string, body: unknown) {
      const response = await fetch(`${api}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: users[actor]!.cookie,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(`Fixture source ${path}: ${response.status}`);
      return response.json() as Promise<{ id: string }>;
    }
    const form = new FormData();
    form.append('entityType', 'Project');
    form.append('entityId', project.id);
    form.append('category', 'PROJECT_DOCUMENT');
    form.append(
      'file',
      new Blob(['Phương án browser đã duyệt cho khách'], {
        type: 'text/plain',
      }),
      'phuong-an-browser.txt',
    );
    const uploaded = await fetch(`${api}/files`, {
      method: 'POST',
      headers: { Cookie: users.sender!.cookie },
      body: form,
    });
    if (!uploaded.ok)
      throw new Error(`Fixture source upload ${uploaded.status}`);
    const file = (await uploaded.json()) as { id: string };
    const document = await domain(
      'sender',
      `/projects/${project.id}/required-documents`,
      {
        stageKey: 'STAGE_1',
        workstreamKey: 'PROPOSAL',
        documentType: 'PROPOSAL',
        documentName: 'Phương án browser',
      },
    );
    await domain(
      'sender',
      `/projects/${project.id}/required-documents/${document.id}/file`,
      { fileAssetId: file.id },
    );
    await domain(
      'sender',
      `/projects/${project.id}/required-documents/${document.id}/submit`,
      {},
    );
    await domain(
      'publisher',
      `/projects/${project.id}/required-documents/${document.id}/decision`,
      { decision: 'APPROVED' },
    );
    const taskRole = await db.role.create({
      data: {
        organizationId: org.id,
        code: `task-${run}`,
        name: 'Task fixture reader',
        permissions: {
          create: { permission: { connect: { code: 'task.read' } } },
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: org.id,
        userId: users.manager!.id,
        roleId: taskRole.id,
        scopeType: 'SELF',
      },
    });
    await db.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: 'Task fixture nguồn chung',
        createdBy: users.manager!.id,
        updatedBy: users.manager!.id,
      },
    });
    return {
      revokeManagerTask: async () => {
        try {
          const [identity] = await db.$queryRaw<
            { database: string }[]
          >`SELECT current_database() AS database`;
          if (identity?.database !== target.databaseName)
            throw new Error('Fixture target mismatch');
          await db.userRole.updateMany({
            where: { userId: users.manager!.id, roleId: taskRole.id },
            data: { status: 'archived' },
          });
        } finally {
          await db.$disconnect();
        }
      },
      managerAuthorityId: managerAuthority.id!,
      revokePublisherSource: async () => {
        try {
          const [identity] = await db.$queryRaw<
            { database: string }[]
          >`SELECT current_database() AS database`;
          if (
            identity?.database !==
            `galaxy_os_g00_${process.env.G00_TEST_RUN_ID}`
          )
            throw new Error('Fixture target mismatch');
          await db.userRole.updateMany({
            where: { userId: users.publisher!.id, roleId: sourceRole.id },
            data: { status: 'archived' },
          });
        } finally {
          await db.$disconnect();
        }
      },
      sourceId: document.id,
      projectId: project.id,
      roomId: internal.id!,
      guestRoomId: external.id!,
      senderGrantId: sender.id!,
      users,
      password,
    };
  } finally {
    await db.$disconnect();
  }
}
