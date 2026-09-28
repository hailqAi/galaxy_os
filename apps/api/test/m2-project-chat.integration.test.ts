import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';
import { AppModule } from '../src/app.module';
import { SearchController } from '../src/search/search.controller';
import { findProjectFile } from '../src/files/project-file';
import { CurrentActor } from '../src/access-control/current-actor';
import { FilesService } from '../src/files/files.service';
import { FileStorage } from '../src/files/file-storage';
import { ProjectProductsService } from '../src/projects/project-products.service';

const isolated = assertG00Isolation();

describe.sequential('M2-A project chat with real sessions and database', () => {
  const db = new PrismaClient();
  const run = randomUUID();
  const password = 'm2a-fixture-not-production';
  const capabilities = [
    'chat.create',
    'chat.access.manage',
    'chat.lock',
    'chat.history',
    'chat.publish',
    'chat.read',
    'chat.send',
    'chat.upload',
    'chat.download',
  ];
  let app: INestApplication;
  const users: Record<string, { id: string; cookie: string }> = {};
  let orgId = '';
  let projectId = '';
  let otherProjectId = '';
  let roomId = '';
  let viewerGrantId = '';
  const call = () => request(app.getHttpServer());
  const post = (actor: string, path: string, body: object) =>
    call()
      .post(`/api/v1/project-chat${path}`)
      .set('Cookie', users[actor]!.cookie)
      .set('X-Chat-Actor', users[actor]!.id)
      .send(body);
  const get = (actor: string, path: string) =>
    call()
      .get(`/api/v1/project-chat${path}`)
      .set('Cookie', users[actor]!.cookie);

  beforeAll(async () => {
    const identity = await db.$queryRaw<
      Array<{ database: string; username: string }>
    >`SELECT current_database() AS database, current_user AS username`;
    expect(identity).toEqual([
      { database: isolated.databaseName, username: isolated.databaseUser },
    ]);
    const org = await db.organization.create({
      data: {
        slug: `m2a-${run}`,
        name: 'M2 giả lập',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    });
    orgId = org.id;
    const orgB = await db.organization.create({
      data: {
        slug: `m2b-${run}`,
        name: 'M2 tổ chức B giả lập',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    });
    const passwordHash = await hash(password, 4);
    for (const code of capabilities)
      await db.permission.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: code,
          description: 'M2-A explicit delegation capability',
          module: 'project-chat',
        },
      });
    for (const name of [
      'authority',
      'manager',
      'sender',
      'viewer',
      'outsider',
      'guest',
      'publisher',
      'tenantB',
    ]) {
      const user = await db.user.create({
        data: {
          email: `${name}-${run}@example.test`,
          normalizedEmail: `${name}-${run}@example.test`.toLowerCase(),
          displayName: name,
          status: 'active',
          credential: { create: { passwordHash, mustChangePassword: false } },
          organizationMembers: {
            create: { organizationId: name === 'tenantB' ? orgB.id : org.id },
          },
        },
      });
      users[name] = { id: user.id, cookie: '' };
    }
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: `m2a-${run}`,
        name: 'M2 fixture authority',
        administrationTier: 10,
        maximumScope: 'ORGANIZATION',
        permissions: {
          create: [
            'role.assign',
            'project.read',
            'file.read',
            'file.download',
            'audit.read',
            ...capabilities,
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
        type: 'INDIVIDUAL',
        displayName: 'Khách giả lập',
        createdBy: users.authority!.id,
        updatedBy: users.authority!.id,
      },
    });
    const p = await db.project.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        code: `m2a-${run}`,
        name: 'Công trình giả lập 1',
        createdBy: users.authority!.id,
        updatedBy: users.authority!.id,
      },
    });
    projectId = p.id;
    otherProjectId = (
      await db.project.create({
        data: {
          organizationId: org.id,
          customerId: customer.id,
          code: `m2a2-${run}`,
          name: 'Công trình giả lập 2',
          createdBy: users.authority!.id,
          updatedBy: users.authority!.id,
        },
      })
    ).id;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    for (const name of Object.keys(users)) {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `${name}-${run}@example.test`, password })
        .expect(201);
      users[name]!.cookie = (
        login.headers['set-cookie'] as unknown as string[]
      )[0]!.split(';')[0]!;
    }
  });
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it('rejects mutations when another account replaces the tab session', async () => {
    await call()
      .post(`/api/v1/project-chat/rooms/${randomUUID()}/messages`)
      .set('Cookie', users.sender!.cookie)
      .set('X-Chat-Actor', users.viewer!.id)
      .send({ clientKey: randomUUID(), body: 'Nháp tài khoản cũ' })
      .expect(412);
  });
  it('does not infer chat content access from a broad IAM role', async () => {
    const response = await get('authority', '/projects').expect(200);
    expect(response.body).toEqual([]);
  });
  it('grants explicit Project authority then creates a room without creator read bypass', async () => {
    await post('authority', `/projects/${projectId}/authorities`, {
      userId: users.manager!.id,
      actions: ['CREATE', 'ACCESS_ADMIN', 'LOCK', 'HISTORY'],
      roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'LOCK', 'HISTORY'],
    }).expect(201);
    const created = await post('manager', `/projects/${projectId}/rooms`, {
      title: 'Trao đổi giả lập',
      group: 'CONSULTING',
      audience: 'INTERNAL',
    }).expect(201);
    roomId = created.body.id;
    expect(
      (await get('manager', '/projects').expect(200)).body.map(
        (p: { id: string }) => p.id,
      ),
    ).toContain(projectId);
    await get('manager', `/rooms/${roomId}/messages`).expect(404);
    await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.sender!.id,
      actions: ['READ', 'SEND'],
    }).expect(201);
    const viewer = await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ'],
    }).expect(201);
    viewerGrantId = viewer.body.id;
  });
  it('persists a message, replays once and rejects changed payload and read-only writes', async () => {
    const management = (
      await get('manager', `/projects/${projectId}/management`).expect(200)
    ).body;
    expect(management.rooms[0].id).toBe(roomId);
    expect(management.rooms[0].title).toBeUndefined();
    expect(management.candidates.map((u: { id: string }) => u.id)).toContain(
      users.sender!.id,
    );
    expect(
      management.candidates.map((u: { id: string }) => u.id),
    ).not.toContain(users.tenantB!.id);
    await get('sender', `/projects/${projectId}/management`).expect(404);
    const clientKey = randomUUID();
    const sent = await post('sender', `/rooms/${roomId}/messages`, {
      clientKey,
      body: 'Xin chào dự án',
    }).expect(201);
    const again = await post('sender', `/rooms/${roomId}/messages`, {
      clientKey,
      body: 'Xin chào dự án',
    }).expect(201);
    expect(again.body.id).toBe(sent.body.id);
    await post('sender', `/rooms/${roomId}/messages`, {
      clientKey,
      body: 'Đổi nội dung',
    }).expect(409);
    await post('viewer', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Không được gửi',
    }).expect(403);
    const history = await get('viewer', `/rooms/${roomId}/messages`).expect(
      200,
    );
    expect(history.body.items.map((m: { body: string }) => m.body)).toEqual([
      'Xin chào dự án',
    ]);
    await get('tenantB', `/rooms/${roomId}/messages`).expect(404);
    await get('outsider', `/rooms/${roomId}/messages`).expect(404);
    await post('sender', `/projects/${otherProjectId}/rooms`, {
      title: 'Vượt quyền',
      group: 'CONSULTING',
      audience: 'INTERNAL',
    }).expect(404);
  });
  it('revokes read access and re-add does not reopen previously visible messages', async () => {
    await post(
      'manager',
      `/rooms/${roomId}/grants/${viewerGrantId}/revoke`,
      {},
    ).expect(201);
    await get('viewer', `/rooms/${roomId}/messages`).expect(404);
    await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ'],
    }).expect(201);
    const history = await get('viewer', `/rooms/${roomId}/messages`).expect(
      200,
    );
    expect(history.body.items).toEqual([]);
    const visible = await get('viewer', '/projects').expect(200);
    expect(visible.body.map((p: { id: string }) => p.id)).toEqual([projectId]);
  });
  it('rejects forged actor fields and malformed paging at the API boundary', async () => {
    await post('sender', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Forgery',
      authorId: users.authority!.id,
    }).expect(400);
    await get('sender', `/rooms/${roomId}/messages?limit=-1`).expect(400);
  });
  it('does not delegate chat authority from role.assign alone or borrow another binding', async () => {
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `limited-${run}`,
        name: 'Limited',
        administrationTier: 10,
        permissions: {
          create: [{ permission: { connect: { code: 'role.assign' } } }],
        },
      },
    });
    const other = await db.role.create({
      data: {
        organizationId: orgId,
        code: `other-${run}`,
        name: 'Unrelated capabilities',
        permissions: {
          create: capabilities.map((code) => ({
            permission: { connect: { code } },
          })),
        },
      },
    });
    await db.userRole.createMany({
      data: [
        {
          organizationId: orgId,
          userId: users.outsider!.id,
          roleId: role.id,
          scopeType: 'ORGANIZATION',
        },
        {
          organizationId: orgId,
          userId: users.outsider!.id,
          roleId: other.id,
          scopeType: 'SELF',
        },
      ],
    });
    await post('outsider', `/projects/${projectId}/authorities`, {
      userId: users.viewer!.id,
      actions: ['ACCESS_ADMIN'],
      roomCeiling: ['READ'],
    }).expect(403);
  });
  it('serializes concurrent send and stable paging with new messages interleaved', async () => {
    const clientKey = randomUUID();
    const responses = await Promise.all([
      post('sender', `/rooms/${roomId}/messages`, {
        clientKey,
        body: 'Đồng thời',
      }),
      post('sender', `/rooms/${roomId}/messages`, {
        clientKey,
        body: 'Đồng thời',
      }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    const first = await get(
      'sender',
      `/rooms/${roomId}/messages?after=0&limit=1`,
    ).expect(200);
    await post('sender', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Tin mới',
    }).expect(201);
    const next = await get(
      'sender',
      `/rooms/${roomId}/messages?after=${first.body.nextAfter}&limit=1`,
    ).expect(200);
    expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
    expect(next.body.hasMore).toBe(true);
  });
  it('locks sends on the server without removing readable history', async () => {
    await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ', 'LOCK'],
    }).expect(201);
    await post('viewer', `/rooms/${roomId}/lock`, { locked: true }).expect(201);
    await post('viewer', `/rooms/${roomId}/lock`, { locked: false }).expect(
      201,
    );
    await post('manager', `/rooms/${roomId}/lock`, { locked: true }).expect(
      201,
    );
    await post('sender', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Bị khóa',
    }).expect(409);
    expect(
      (await get('sender', `/rooms/${roomId}/messages`).expect(200)).body.items
        .length,
    ).toBeGreaterThan(0);
    await post('manager', `/rooms/${roomId}/lock`, { locked: false }).expect(
      201,
    );
  });
  it('opens only an explicit history interval to the current membership epoch', async () => {
    await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.manager!.id,
      actions: ['READ', 'DOWNLOAD', 'HISTORY'],
    }).expect(201);
    const sent = await post('sender', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Nguồn được chia sẻ lịch sử',
    }).expect(201);
    const current = await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ'],
    }).expect(201);
    expect(
      (await get('viewer', `/rooms/${roomId}/messages`).expect(200)).body.items,
    ).toEqual([]);
    await post(
      'manager',
      `/rooms/${roomId}/grants/${current.body.id}/history`,
      {
        from: sent.body.createdAt,
        to: new Date(Date.parse(sent.body.createdAt) + 1).toISOString(),
        actions: ['READ'],
      },
    ).expect(201);
    expect(
      (
        await get('viewer', `/rooms/${roomId}/messages`).expect(200)
      ).body.items.map((m: { body: string }) => m.body),
    ).toEqual(['Nguồn được chia sẻ lịch sử']);
  });
  it('supports a separately scoped customer identity, expiry and re-add without internal access', async () => {
    const room = await post('manager', `/projects/${projectId}/rooms`, {
      title: 'Phòng khách giả lập',
      group: 'CONSULTING',
      audience: 'CUSTOMER',
    }).expect(201);
    await db.$executeRaw`UPDATE "OrganizationMembership" SET "kind"='EXTERNAL' WHERE "organizationId"=${orgId}::uuid AND "userId"=${users.guest!.id}::uuid`;
    await post('authority', `/projects/${projectId}/participants`, {
      userId: users.guest!.id,
    }).expect(201);
    const base = {
      userId: users.guest!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    };
    await post('manager', `/rooms/${room.body.id}/grants`, base).expect(400);
    await post('manager', `/rooms/${room.body.id}/grants`, {
      ...base,
      expiresAt: new Date(Date.now() + 31 * 86400000).toISOString(),
    }).expect(400);
    const grant = await post('manager', `/rooms/${room.body.id}/grants`, {
      ...base,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }).expect(201);
    const uploadKey = randomUUID();
    const uploadGuest = () =>
      call()
        .post(`/api/v1/project-chat/rooms/${room.body.id}/files`)
        .set('Cookie', users.guest!.cookie)
        .set('X-Chat-Actor', users.guest!.id)
        .field('clientKey', uploadKey)
        .attach('file', Buffer.from('Guest own file'), {
          filename: 'guest.txt',
          contentType: 'text/plain',
        });
    const guestFile = (await uploadGuest().expect(201)).body;
    await post('guest', `/rooms/${room.body.id}/messages`, {
      clientKey: randomUUID(),
      body: 'Khách gửi tin',
      attachmentIds: [guestFile.id],
    }).expect(201);
    await get('guest', `/rooms/${roomId}/messages`).expect(404);
    await call()
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', users.guest!.cookie)
      .expect(403);
    const me = await call()
      .get('/api/v1/me')
      .set('Cookie', users.guest!.cookie)
      .expect(200);
    expect(me.body.membershipKind).toBe('EXTERNAL');
    expect(me.body.permissions).toEqual([]);
    expect(me.body.organization).toEqual({ id: orgId, name: 'M2 giả lập' });
    await db.chatRoomGrant.update({
      where: { id: grant.body.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await get('guest', `/rooms/${room.body.id}/messages`).expect(404);
    await uploadGuest().expect(404);
    await get(
      'guest',
      `/rooms/${room.body.id}/files/${guestFile.id}/download`,
    ).expect(404);
    await post('guest', `/rooms/${room.body.id}/messages`, {
      clientKey: randomUUID(),
      body: 'Hết hạn',
    }).expect(404);
    const renewed = await post(
      'manager',
      `/rooms/${room.body.id}/grants/${grant.body.id}/renew`,
      { expiresAt: new Date(Date.now() + 86400000).toISOString() },
    ).expect(201);
    expect(renewed.body.id).not.toBe(grant.body.id);
    await get(
      'guest',
      `/rooms/${room.body.id}/files/${guestFile.id}/download`,
    ).expect(404);
    expect(
      (await get('guest', `/rooms/${room.body.id}/messages`).expect(200)).body
        .items,
    ).toEqual([]);
    await post('manager', `/rooms/${roomId}/grants`, {
      ...base,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }).expect(403);
  });
  it('lists only readable rooms and separately identifies granted management actions', async () => {
    const rooms = await get('sender', `/projects/${projectId}/rooms`).expect(
      200,
    );
    expect(rooms.body.rooms.map((r: { id: string }) => r.id)).toEqual([roomId]);
    expect(rooms.body.rooms[0].actions).toContain('SEND');
    await get('outsider', `/projects/${projectId}/rooms`).expect(404);
  });
  it('uploads once to the existing file store and checks attachment history and download rights', async () => {
    const managerSource = await db.chatRoomGrant.findFirstOrThrow({
      where: { roomId, userId: users.manager!.id, revokedAt: null },
    });
    await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.sender!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    }).expect(201);
    const key = randomUUID();
    const upload = () =>
      call()
        .post(`/api/v1/project-chat/rooms/${roomId}/files`)
        .set('Cookie', users.sender!.cookie)
        .set('X-Chat-Actor', users.sender!.id)
        .field('clientKey', key)
        .attach('file', Buffer.from('Tệp giả lập M2-A'), {
          filename: 'ghi-chu.txt',
          contentType: 'text/plain',
        });
    const first = await upload().expect(201);
    const replay = await upload().expect(201);
    expect(replay.body.id).toBe(first.body.id);
    await post('sender', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Có đính kèm',
      attachmentIds: [first.body.id],
    }).expect(201);
    const response = await call()
      .get(
        `/api/v1/project-chat/rooms/${roomId}/files/${first.body.id}/download`,
      )
      .set('Cookie', users.sender!.cookie)
      .expect(200);
    expect(response.text).toBe('Tệp giả lập M2-A');
    await call()
      .get(
        `/api/v1/project-chat/rooms/${roomId}/files/${first.body.id}/download`,
      )
      .set('Cookie', users.viewer!.cookie)
      .expect(403);
    await call()
      .get(`/api/v1/files/${first.body.fileAssetId}/download`)
      .set('Cookie', users.outsider!.cookie)
      .expect(403);
    await post('authority', `/projects/${projectId}/authorities`, {
      userId: users.publisher!.id,
      actions: ['ACCESS_ADMIN'],
      roomCeiling: ['READ', 'DOWNLOAD'],
    }).expect(201);
    const fileViewer = await post('publisher', `/rooms/${roomId}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ', 'DOWNLOAD'],
    }).expect(201);
    await post(
      'manager',
      `/rooms/${roomId}/grants/${fileViewer.body.id}/history`,
      {
        from: managerSource.effectiveAt.toISOString(),
        to: new Date().toISOString(),
        actions: ['DOWNLOAD'],
      },
    ).expect(201);
    await call()
      .get(
        `/api/v1/project-chat/rooms/${roomId}/files/${first.body.id}/download`,
      )
      .set('Cookie', users.viewer!.cookie)
      .expect(404);
    await post('sender', `/rooms/${roomId}/messages`, {
      clientKey: randomUUID(),
      body: 'Không mở lại lịch sử file bằng tin mới',
      attachmentIds: [first.body.id],
    }).expect(404);
    await post(
      'manager',
      `/rooms/${roomId}/grants/${fileViewer.body.id}/history`,
      {
        from: managerSource.effectiveAt.toISOString(),
        to: new Date().toISOString(),
        actions: ['READ'],
      },
    ).expect(201);
    const path = `/rooms/${roomId}/files/${first.body.id}/download`;
    await get('viewer', path).expect(200);
    const storage = app.get(FileStorage),
      stream = storage.stream.bind(storage);
    let entered!: () => void, resume!: () => void;
    const reached = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        resume = r;
      });
    const barrier = vi
      .spyOn(storage, 'stream')
      .mockImplementationOnce(async (key) => {
        entered();
        await gate;
        return stream(key);
      });
    const pending = get('viewer', path).then((r) => r);
    try {
      await reached;
      await db.organizationMembership.updateMany({
        where: { organizationId: orgId, userId: users.manager!.id },
        data: { status: 'disabled' },
      });
      resume();
      expect((await pending).status).toBe(404);
    } finally {
      resume();
      await pending.catch(() => undefined);
      barrier.mockRestore();
      await db.organizationMembership.updateMany({
        where: { organizationId: orgId, userId: users.manager!.id },
        data: { status: 'active' },
      });
    }
  });
  it('keeps restricted chat files out of generic search and domain file lookup', async () => {
    const actor = {
      organizationId: orgId,
      userId: users.authority!.id,
      permissions: [
        'file.read',
        'file.download',
        'project.read',
        'search.read',
      ],
      administrationScope: 'ORGANIZATION',
      managedDepartmentIds: [],
    } as unknown as CurrentActor;
    const file = await db.chatFile.findFirstOrThrow({ where: { roomId } });
    const result = await app.get(SearchController).search(actor, {
      q: 'ghi-chu',
      entityTypes: ['File'],
      page: 1,
      pageSize: 20,
    });
    expect(result.groups.find((g) => g.entityType === 'File')?.items).toEqual(
      [],
    );
    expect(
      await findProjectFile(db, actor, projectId, file.fileAssetId),
    ).toBeNull();
  });
  it('cannot replace a stronger existing grant using a lower delegation ceiling', async () => {
    await post('authority', `/projects/${projectId}/authorities`, {
      userId: users.publisher!.id,
      actions: ['ACCESS_ADMIN'],
      roomCeiling: ['READ'],
    }).expect(201);
    const before = await db.chatRoomGrant.findFirstOrThrow({
      where: { roomId, userId: users.sender!.id, revokedAt: null },
    });
    await post('publisher', `/rooms/${roomId}/grants`, {
      userId: users.sender!.id,
      actions: ['READ'],
    }).expect(403);
    expect(
      (await db.chatRoomGrant.findUniqueOrThrow({ where: { id: before.id } }))
        .revokedAt,
    ).toBeNull();
  });
  it('does not launder an inherited history interval through a self grant', async () => {
    const current = await db.chatRoomGrant.findFirstOrThrow({
      where: { roomId, userId: users.manager!.id, revokedAt: null },
    });
    const message = await db.chatMessage.findFirstOrThrow({
      where: { roomId, body: 'Nguồn được chia sẻ lịch sử' },
    });
    await post('manager', `/rooms/${roomId}/grants/${current.id}/history`, {
      from: message.createdAt.toISOString(),
      to: new Date(message.createdAt.getTime() + 1).toISOString(),
      actions: ['READ'],
    }).expect(403);
  });
  it('hides chat audit records and counts from the legacy audit feed', async () => {
    const result = await call()
      .get('/api/v1/audit-logs?page=1&pageSize=100&entityType=ChatRoom')
      .set('Cookie', users.authority!.cookie)
      .expect(200);
    expect(result.body.items).toEqual([]);
    expect(result.body.total).toBe(0);
  });
  it('discovery stops exposing Project identity after an external participant is revoked', async () => {
    await db.chatProjectParticipant.updateMany({
      where: { organizationId: orgId, projectId, userId: users.guest!.id },
      data: { revokedAt: new Date() },
    });
    expect((await get('guest', '/projects').expect(200)).body).toEqual([]);
  });
  it('timestamps a waiting send after its newly effective membership and remains replayable', async () => {
    const key = randomUUID();
    let pending:
      | Promise<{ status: number; body: { id: string; createdAt: string } }>
      | undefined;
    let effectiveAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId}::uuid FOR UPDATE`;
      pending = post('sender', `/rooms/${roomId}/messages`, {
        clientKey: key,
        body: 'Sau mốc cấp trong lúc chờ khóa',
      }).then((response) => response);
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        const rows = await db.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Project%'`;
        waiting = rows[0]!.count > 0n;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      effectiveAt = new Date();
      const old = await tx.chatRoomGrant.findFirstOrThrow({
        where: { roomId, userId: users.sender!.id, revokedAt: null },
      });
      await tx.chatRoomGrant.update({
        where: { id: old.id },
        data: { revokedAt: effectiveAt },
      });
      await tx.chatRoomGrant.create({
        data: {
          organizationId: orgId,
          projectId,
          roomId,
          userId: old.userId,
          issuedUnderId: old.issuedUnderId,
          actions: old.actions,
          grantedBy: old.grantedBy,
          effectiveAt,
        },
      });
    });
    const sent = await pending!;
    expect(sent.status).toBe(201);
    expect(Date.parse(sent.body.createdAt)).toBeGreaterThanOrEqual(
      effectiveAt.getTime(),
    );
    const history = await get('sender', `/rooms/${roomId}/messages`).expect(
      200,
    );
    expect(history.body.items.map((m: { id: string }) => m.id)).toContain(
      sent.body.id,
    );
    expect(
      (
        await post('sender', `/rooms/${roomId}/messages`, {
          clientKey: key,
          body: 'Sau mốc cấp trong lúc chờ khóa',
        }).expect(201)
      ).body.id,
    ).toBe(sent.body.id);
  });
  it('revoking the original historical source invalidates multi-hop history', async () => {
    const original = await db.chatMessage.findFirstOrThrow({
      where: { roomId, body: 'Nguồn được chia sẻ lịch sử' },
    });
    const from = original.createdAt.toISOString(),
      to = new Date(original.createdAt.getTime() + 1).toISOString();
    await post('authority', `/projects/${projectId}/authorities`, {
      userId: users.viewer!.id,
      actions: ['ACCESS_ADMIN', 'HISTORY'],
      roomCeiling: ['READ', 'HISTORY'],
    }).expect(201);
    const receiver = await post('manager', `/rooms/${roomId}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ', 'HISTORY'],
    }).expect(201);
    await post(
      'manager',
      `/rooms/${roomId}/grants/${receiver.body.id}/history`,
      { from, to, actions: ['READ'] },
    ).expect(201);
    const leaf = await post('viewer', `/rooms/${roomId}/grants`, {
      userId: users.outsider!.id,
      actions: ['READ'],
    }).expect(201);
    await post('viewer', `/rooms/${roomId}/grants/${leaf.body.id}/history`, {
      from,
      to,
      actions: ['READ'],
    }).expect(201);
    expect(
      (
        await get('outsider', `/rooms/${roomId}/messages`).expect(200)
      ).body.items.map((m: { id: string }) => m.id),
    ).toEqual([original.id]);
    const source = await db.chatRoomGrant.findFirstOrThrow({
      where: { roomId, userId: users.manager!.id, revokedAt: null },
    });
    const beforeScope = (
      await get('outsider', `/rooms/${roomId}/messages`).expect(200)
    ).body.scopeToken;
    await post(
      'manager',
      `/rooms/${roomId}/grants/${source.id}/revoke`,
      {},
    ).expect(201);
    expect(
      (await get('outsider', `/rooms/${roomId}/messages`).expect(200)).body
        .items,
    ).toEqual([]);
    const afterScope = (
      await get('outsider', `/rooms/${roomId}/messages`).expect(200)
    ).body.scopeToken;
    expect(beforeScope).toEqual(expect.any(String));
    expect(afterScope).not.toBe(beforeScope);
  });
  it('concurrent upload replay rechecks the session after pending-file cleanup', async () => {
    const storage = app.get(FileStorage),
      put = storage.putStream.bind(storage),
      remove = storage.removePending.bind(storage);
    let writes = 0,
      releaseWrites!: () => void,
      entered!: () => void,
      resume!: () => void;
    const written = new Promise<void>((r) => {
        releaseWrites = r;
      }),
      reached = new Promise<void>((r) => {
        entered = r;
      }),
      resumeCleanup = new Promise<void>((r) => {
        resume = r;
      });
    const writing = vi
      .spyOn(storage, 'putStream')
      .mockImplementation(async (...args) => {
        const key = await put(...args);
        if (++writes === 2) releaseWrites();
        await written;
        return key;
      });
    const cleanup = vi
      .spyOn(storage, 'removePending')
      .mockImplementationOnce(async (...args) => {
        entered();
        await resumeCleanup;
        return remove(...args);
      });
    const key = randomUUID();
    const upload = () =>
      call()
        .post(`/api/v1/project-chat/rooms/${roomId}/files`)
        .set('Cookie', users.sender!.cookie)
        .set('X-Chat-Actor', users.sender!.id)
        .field('clientKey', key)
        .attach('file', Buffer.from('Replay race fixture'), {
          filename: 'race.txt',
          contentType: 'text/plain',
        })
        .then((r) => r);
    const results = Promise.all([upload(), upload()]);
    try {
      await reached;
      await db.session.updateMany({
        where: { userId: users.sender!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      resume();
      expect((await results).map((r) => r.status).sort()).toEqual([201, 401]);
      expect(
        await db.chatFile.count({
          where: { roomId, actorId: users.sender!.id, clientKey: key },
        }),
      ).toBe(1);
    } finally {
      releaseWrites();
      resume();
      await results.catch(() => undefined);
      writing.mockRestore();
      cleanup.mockRestore();
      await db.session.updateMany({
        where: { userId: users.sender!.id },
        data: { revokedAt: null },
      });
    }
  });
  it('links existing tasks and product lines without granting their content through room membership', async () => {
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `links-${run}`,
        name: 'Link fixture',
        permissions: {
          create: ['task.read', 'project.product.view'].map((code) => ({
            permission: { connect: { code } },
          })),
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: orgId,
        userId: users.manager!.id,
        roleId: role.id,
        scopeType: 'ORGANIZATION',
      },
    });
    const task = await db.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: 'Task existing',
        createdBy: users.manager!.id,
        updatedBy: users.manager!.id,
      },
    });
    const other = await db.task.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        title: 'Other task',
        createdBy: users.manager!.id,
        updatedBy: users.manager!.id,
      },
    });
    const line = await db.projectProductLine.create({
      data: {
        organizationId: orgId,
        projectId,
        code: `link-${run}`,
        createdBy: users.manager!.id,
        updatedBy: users.manager!.id,
      },
    });
    await post('manager', `/projects/${projectId}/rooms`, {
      title: 'Wrong target',
      group: 'CONSULTING',
      audience: 'INTERNAL',
      taskId: other.id,
    }).expect(404);
    const room = (
      await post('manager', `/projects/${projectId}/rooms`, {
        title: 'Linked work',
        group: 'CONSULTING',
        audience: 'INTERNAL',
        taskId: task.id,
        productLineId: line.id,
      }).expect(201)
    ).body;
    for (const who of ['manager', 'viewer'])
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users[who]!.id,
        actions: ['READ'],
      }).expect(201);
    const links = (
      await get('manager', `/rooms/${room.id}/messages`).expect(200)
    ).body.links;
    expect(links.task.id).toBe(task.id);
    expect(links.productLine.id).toBe(line.id);
    expect(
      (await get('viewer', `/rooms/${room.id}/messages`).expect(200)).body
        .links,
    ).toEqual({ task: null, productLine: null });
    expect(await db.task.count({ where: { id: task.id } })).toBe(1);
  });
  it('parent READ ceiling and internal authority identity stay mandatory for sends', async () => {
    const grant = await db.chatRoomGrant.findFirstOrThrow({
      where: { roomId, userId: users.sender!.id, revokedAt: null },
      orderBy: { effectiveAt: 'desc' },
    });
    const parent = await db.chatProjectGrant.findUniqueOrThrow({
      where: { id: grant.issuedUnderId },
    });
    try {
      await db.chatProjectGrant.update({
        where: { id: parent.id },
        data: { roomCeiling: parent.roomCeiling.filter((a) => a !== 'READ') },
      });
      await post('sender', `/rooms/${roomId}/messages`, {
        clientKey: randomUUID(),
        body: 'No inherited READ',
      }).expect(403);
      await db.chatProjectGrant.update({
        where: { id: parent.id },
        data: { roomCeiling: parent.roomCeiling },
      });
      await db.organizationMembership.updateMany({
        where: { organizationId: orgId, userId: parent.userId },
        data: { kind: 'EXTERNAL' },
      });
      await post('sender', `/rooms/${roomId}/messages`, {
        clientKey: randomUUID(),
        body: 'No internal source',
      }).expect(404);
    } finally {
      await db.chatProjectGrant.update({
        where: { id: parent.id },
        data: { roomCeiling: parent.roomCeiling },
      });
      await db.organizationMembership.updateMany({
        where: { organizationId: orgId, userId: parent.userId },
        data: { kind: 'INTERNAL' },
      });
    }
  });
  it('renewal cannot promise access past the original parent; lapsed parent starts a new epoch', async () => {
    const parent = (
      await post('authority', `/projects/${otherProjectId}/authorities`, {
        userId: users.manager!.id,
        actions: ['CREATE', 'ACCESS_ADMIN'],
        roomCeiling: ['READ', 'SEND'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }).expect(201)
    ).body;
    await post('authority', `/projects/${otherProjectId}/authorities`, {
      userId: users.publisher!.id,
      actions: ['ACCESS_ADMIN'],
      roomCeiling: ['READ', 'SEND'],
    }).expect(201);
    const room = (
      await post('manager', `/projects/${otherProjectId}/rooms`, {
        title: 'Renew parent',
        group: 'CONSULTING',
        audience: 'INTERNAL',
      }).expect(201)
    ).body;
    const grant = (
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users.viewer!.id,
        actions: ['READ'],
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      }).expect(201)
    ).body;
    await post('publisher', `/rooms/${room.id}/grants/${grant.id}/renew`, {
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }).expect(403);
    await post(
      'authority',
      `/projects/${otherProjectId}/authorities/${parent.id}/revoke`,
      {},
    ).expect(201);
    const renewed = (
      await post('publisher', `/rooms/${room.id}/grants/${grant.id}/renew`, {
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }).expect(201)
    ).body;
    expect(renewed.id).not.toBe(grant.id);
    await get('viewer', `/rooms/${room.id}/messages`).expect(200);
  });
  it('drains a 155-message database burst without losing a page or exposing pre-grant rows', async () => {
    const room = (
      await post('manager', `/projects/${projectId}/rooms`, {
        title: 'Paging burst',
        group: 'CONSULTING',
        audience: 'INTERNAL',
      }).expect(201)
    ).body;
    const grant = (
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users.sender!.id,
        actions: ['READ', 'SEND'],
      }).expect(201)
    ).body;
    await db.chatMessage.createMany({
      data: Array.from({ length: 160 }, (_, i) => ({
        organizationId: orgId,
        projectId,
        roomId: room.id,
        authorId: users.sender!.id,
        clientKey: randomUUID(),
        payloadHash: 'fixture',
        sequence: i + 1,
        body: `Fixture ${i + 1}`,
        createdAt:
          i < 5 ? new Date(Date.parse(grant.effectiveAt) - 1) : new Date(),
      })),
    });
    await db.chatRoom.update({
      where: { id: room.id },
      data: { sequence: 160 },
    });
    const first = (
      await get(
        'sender',
        `/rooms/${room.id}/messages?after=0&limit=100`,
      ).expect(200)
    ).body;
    expect(first.items).toHaveLength(100);
    expect(first.nextAfter).toBe(105);
    expect(first.hasMore).toBe(true);
    await post('sender', `/rooms/${room.id}/messages`, {
      clientKey: randomUUID(),
      body: 'Tin xen giữa hai trang',
    }).expect(201);
    const next = (
      await get(
        'sender',
        `/rooms/${room.id}/messages?after=${first.nextAfter}&limit=100`,
      ).expect(200)
    ).body;
    const sequences = [...first.items, ...next.items].map(
      (m: { sequence: number }) => m.sequence,
    );
    expect(sequences).toEqual(Array.from({ length: 156 }, (_, i) => i + 6));
    expect(next.hasMore).toBe(false);
  });
  it('releases an approved exact proposal with two actors; source and recipient boundaries remain private', async () => {
    const permissions = [
      'file.read',
      'file.download',
      'file.upload',
      'project.document.manage',
      'project.document.review',
    ];
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `publish-${run}`,
        name: 'Fixture source rights',
        administrationTier: 0,
        permissions: {
          create: permissions.map((code) => ({
            permission: { connect: { code } },
          })),
        },
      },
    });
    for (const name of ['sender', 'publisher'])
      await db.userRole.create({
        data: {
          organizationId: orgId,
          userId: users[name]!.id,
          roleId: role.id,
          scopeType: 'ORGANIZATION',
        },
      });
    const sourceActor = async (name: string): Promise<CurrentActor> => ({
      userId: users[name]!.id,
      organizationId: orgId,
      organizationMembershipId: (
        await db.organizationMembership.findUniqueOrThrow({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: users[name]!.id,
            },
          },
        })
      ).id,
      email: `${name}-${run}@example.test`,
      displayName: name,
      mustChangePassword: false,
      permissions,
      administrationScope: 'ORGANIZATION',
      managedDepartmentIds: [],
      administrationTier: 0,
    });
    const preparer = await sourceActor('sender'),
      reviewer = await sourceActor('publisher');
    const bytes = Buffer.from(
      'Phương án giả lập dành cho khách; không có giá vốn',
    );
    const file = await app.get(FilesService).upload(
      preparer,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'phuong-an.txt',
        mimetype: 'text/plain',
        size: bytes.length,
        buffer: bytes,
      } as Express.Multer.File,
    );
    const products = app.get(ProjectProductsService);
    const doc = await products.createDocument(preparer, otherProjectId, {
      stageKey: 'STAGE_1',
      workstreamKey: 'PROPOSAL',
      documentType: 'PROPOSAL',
      documentName: 'Phương án khách',
    });
    await products.linkDocumentFile(preparer, otherProjectId, doc.id, file.id);
    await products.submitDocument(preparer, otherProjectId, doc.id);
    await products.decideDocument(reviewer, otherProjectId, doc.id, {
      decision: 'APPROVED',
    });
    await post('authority', `/projects/${otherProjectId}/authorities`, {
      userId: users.manager!.id,
      actions: ['CREATE', 'ACCESS_ADMIN'],
      roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    }).expect(201);
    await post('authority', `/projects/${otherProjectId}/authorities`, {
      userId: users.publisher!.id,
      actions: ['PUBLISH'],
      roomCeiling: [],
    }).expect(201);
    const room = (
      await post('manager', `/projects/${otherProjectId}/rooms`, {
        title: 'Phát hành khách',
        group: 'CONSULTING',
        audience: 'CUSTOMER',
      }).expect(201)
    ).body;
    await post('authority', `/projects/${otherProjectId}/participants`, {
      userId: users.guest!.id,
    }).expect(201);
    for (const name of ['sender', 'publisher', 'guest'])
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users[name]!.id,
        actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
        ...(name === 'guest'
          ? { expiresAt: new Date(Date.now() + 86400000).toISOString() }
          : {}),
      }).expect(201);
    await db.fileAsset.update({
      where: { id: file.id },
      data: { confidentiality: 'RESTRICTED' },
    });
    await post('sender', `/rooms/${room.id}/releases`, {
      sourceId: doc.id,
      version: 1,
      fileId: file.id,
    }).expect(403);
    await db.fileAsset.update({
      where: { id: file.id },
      data: { confidentiality: 'INTERNAL' },
    });
    let release = (
      await post('sender', `/rooms/${room.id}/releases`, {
        sourceId: doc.id,
        version: 1,
        fileId: file.id,
      }).expect(201)
    ).body;
    const oldRelease = release.id;
    await post('manager', `/rooms/${room.id}/grants`, {
      userId: users.publisher!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    }).expect(201);
    await get('publisher', `/releases/${oldRelease}/preview`).expect(404);
    expect(
      (await get('publisher', `/rooms/${room.id}/releases`).expect(200)).body
        .pending,
    ).toEqual([]);
    release = (
      await post('sender', `/rooms/${room.id}/releases`, {
        sourceId: doc.id,
        version: 1,
        fileId: file.id,
      }).expect(201)
    ).body;
    await post('sender', `/releases/${release.id}/publish`, {
      confirmed: true,
    }).expect(403);
    await get('guest', `/releases/${release.id}/download`).expect(404);
    await post('publisher', `/releases/${release.id}/publish`, {
      confirmed: true,
    }).expect(409); // exact bytes must be reviewed first
    const storage = app.get(FileStorage),
      originalStream = storage.stream.bind(storage);
    let entered!: () => void, releaseRead!: () => void;
    const reached = new Promise<void>((r) => {
        entered = r;
      }),
      resume = new Promise<void>((r) => {
        releaseRead = r;
      });
    const barrier = vi
      .spyOn(storage, 'stream')
      .mockImplementationOnce(async (key) => {
        entered();
        await resume;
        return originalStream(key);
      });
    const inFlight = get('publisher', `/releases/${release.id}/preview`).then(
      (r) => r,
    );
    try {
      await reached;
      await db.userRole.updateMany({
        where: { userId: users.publisher!.id, roleId: role.id },
        data: { status: 'archived' },
      });
      releaseRead();
      expect((await inFlight).status).toBe(404);
      expect(
        (
          await db.chatDocumentRelease.findUniqueOrThrow({
            where: { id: release.id },
          })
        ).reviewedAt,
      ).toBeNull();
    } finally {
      releaseRead();
      await inFlight.catch(() => undefined);
      barrier.mockRestore();
      await db.userRole.updateMany({
        where: { userId: users.publisher!.id, roleId: role.id },
        data: { status: 'active' },
      });
    }
    const preview = await get(
      'publisher',
      `/releases/${release.id}/preview`,
    ).expect(200);
    expect(preview.text).toBe(bytes.toString());
    const checked = (
      await get('publisher', `/releases/${release.id}/review`).expect(200)
    ).body;
    expect(
      checked.recipients.map((u: { userId: string }) => u.userId),
    ).toContain(users.guest!.id);
    await post('manager', `/rooms/${room.id}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ'],
    }).expect(201);
    await post('publisher', `/releases/${release.id}/publish`, {
      confirmed: true,
      recipientHash: checked.recipientHash,
    }).expect(409);
    await get('publisher', `/releases/${release.id}/preview`).expect(200);
    const reviewed = (
      await get('publisher', `/releases/${release.id}/review`).expect(200)
    ).body;
    await post('publisher', `/releases/${release.id}/publish`, {
      confirmed: true,
      recipientHash: reviewed.recipientHash,
    }).expect(201);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    await call()
      .get(`/api/v1/files/${file.id}/download`)
      .set('Cookie', users.guest!.cookie)
      .expect(403);
    await get('outsider', `/releases/${release.id}/download`).expect(404);
    const stale = (
      await post('sender', `/rooms/${room.id}/releases`, {
        sourceId: doc.id,
        version: 1,
        fileId: file.id,
      }).expect(201)
    ).body;
    await get('publisher', `/releases/${stale.id}/preview`).expect(200);
    const oldReview = (
      await get('publisher', `/releases/${stale.id}/review`).expect(200)
    ).body;
    await products.supersedeDocument(preparer, otherProjectId, doc.id);
    const replacementBytes = Buffer.from('Phương án mới chưa duyệt');
    const replacement = await app.get(FilesService).upload(
      preparer,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'v2.txt',
        mimetype: 'text/plain',
        size: replacementBytes.length,
        buffer: replacementBytes,
      } as Express.Multer.File,
    );
    await products.linkDocumentFile(
      preparer,
      otherProjectId,
      doc.id,
      replacement.id,
    );
    await post('publisher', `/releases/${stale.id}/publish`, {
      confirmed: true,
      recipientHash: oldReview.recipientHash,
    }).expect(409);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    await post('publisher', `/releases/${release.id}/revoke`, {}).expect(201);
    await get('guest', `/releases/${release.id}/download`).expect(404);
  });
});
