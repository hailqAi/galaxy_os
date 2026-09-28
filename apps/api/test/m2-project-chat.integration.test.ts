import {
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import { ProductionService } from '../src/production/production.service';
import { ContractsService } from '../src/contracts/contracts.service';
import { InstallationService } from '../src/installation/installation.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { InventoryOperationsService } from '../src/inventory/operations.service';
import { AfterSalesService } from '../src/after-sales/after-sales.service';
import { CommercialService } from '../src/commercial/commercial.service';
import { QuotationDocumentsService } from '../src/commercial/quotation-documents.service';
import ExcelJS from 'exceljs';
import { assertFileCapacity } from '../src/files/file-quota';
import { customerPublicationSource } from '../src/project-chat/customer-publication-source';
import { ProjectChatService } from '../src/project-chat/project-chat.service';

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
  const getBinary = (actor: string, path: string) =>
    get(actor, path)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', callback);
      });

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
    let earlyFailure!: (error: Error) => void;
    const failed = new Promise<never>((_, reject) => {
      earlyFailure = reject;
    });
    const runUpload = async () => {
      const response = await upload();
      if (response.status !== 201)
        earlyFailure(
          new Error(`Upload exited before cleanup: ${response.status}`),
        );
      return response;
    };
    const results = Promise.all([runUpload(), runUpload()]);
    try {
      await Promise.race([reached, failed]);
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
      actions: ['CREATE', 'ACCESS_ADMIN', 'HISTORY'],
      roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'HISTORY'],
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
    await post('manager', `/rooms/${room.id}/grants`, {
      userId: users.manager!.id,
      actions: ['READ', 'DOWNLOAD', 'HISTORY'],
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
      await Promise.race([
        reached,
        inFlight.then((r) => {
          throw new Error(`Preview exited before storage barrier: ${r.status}`);
        }),
      ]);
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
    const stored = await db.fileAsset.findUniqueOrThrow({
      where: { id: file.id },
    });
    const binaryPath = join(process.env.FILE_STORAGE_PATH!, stored.storageKey);
    try {
      await writeFile(binaryPath, 'Binary khác sau khi kiểm tra');
      await post('publisher', `/releases/${release.id}/publish`, {
        confirmed: true,
        recipientHash: reviewed.recipientHash,
      }).expect(409);
      expect(
        (
          await db.chatDocumentRelease.findUniqueOrThrow({
            where: { id: release.id },
          })
        ).publishedAt,
      ).toBeNull();
      await writeFile(binaryPath, Buffer.alloc(10 * 1024 * 1024 + 1));
      await get('publisher', `/releases/${release.id}/preview`).expect(409);
    } finally {
      await writeFile(binaryPath, bytes);
    }
    await post('publisher', `/releases/${release.id}/publish`, {
      confirmed: true,
      recipientHash: reviewed.recipientHash,
    }).expect(201);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    try {
      await writeFile(binaryPath, 'Binary khác sau phát hành');
      await get('guest', `/releases/${release.id}/download`).expect(409);
    } finally {
      await writeFile(binaryPath, bytes);
    }
    await call()
      .get(`/api/v1/files/${file.id}/download`)
      .set('Cookie', users.guest!.cookie)
      .expect(403);
    await get('outsider', `/releases/${release.id}/download`).expect(404);
    const publication = await db.chatDocumentRelease.findUniqueOrThrow({
      where: { id: release.id },
    });
    const late = (
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users.outsider!.id,
        actions: ['READ', 'DOWNLOAD'],
      }).expect(201)
    ).body;
    await post('manager', `/rooms/${room.id}/grants/${late.id}/history`, {
      from: publication.publishedAt!.toISOString(),
      to: new Date(publication.publishedAt!.getTime() + 1).toISOString(),
      actions: ['READ', 'DOWNLOAD'],
    }).expect(201);
    // Opening chat history cannot add recipients to a document already released.
    expect(
      (await get('outsider', `/rooms/${room.id}/releases`).expect(200)).body
        .published,
    ).toEqual([]);
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
  it('publishes only the approved customer quotation export and pins its version and binary', async () => {
    const permissions = [
      'quotation.read',
      'quotation.export',
      'quotation.update',
      'quotation.approve',
      'file.read',
      'file.download',
    ];
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `quote-${run}`,
        name: 'Quotation fixture rights',
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
      permissions,
      administrationScope: 'ORGANIZATION',
      managedDepartmentIds: [],
      administrationTier: 0,
      email: `${name}-${run}@example.test`,
      displayName: name,
      mustChangePassword: false,
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
    });
    const project = await db.project.findUniqueOrThrow({
      where: { id: otherProjectId },
    });
    const quotation = await db.quotation.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        customerId: project.customerId,
        number: `CHAT-${run}`,
        currency: 'VND',
        createdBy: users.sender!.id,
        updatedBy: users.sender!.id,
        versions: {
          create: {
            version: 1,
            createdBy: users.sender!.id,
            notes: 'INTERNAL-MARGIN-NOTE',
            grandTotal: '120000',
            lines: {
              create: {
                section: 'Hạng mục',
                description: 'Sản phẩm dành cho khách',
                quantity: 2,
                unit: 'bộ',
                unitPrice: '60000',
                lineTotal: '120000',
                position: 1,
              },
            },
          },
        },
      },
    });
    const room = (
      await post('manager', `/projects/${otherProjectId}/rooms`, {
        title: 'Báo giá khách',
        group: 'COMMERCIAL',
        audience: 'CUSTOMER',
      }).expect(201)
    ).body;
    for (const name of ['sender', 'publisher', 'guest'])
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users[name]!.id,
        actions: ['READ', 'UPLOAD', 'DOWNLOAD'],
        ...(name === 'guest'
          ? { expiresAt: new Date(Date.now() + 86400000).toISOString() }
          : {}),
      }).expect(201);
    const documents = app.get(QuotationDocumentsService);
    const document = await documents.generate(
      await sourceActor('sender'),
      otherProjectId,
      quotation.id,
      'XLSX',
      'VI',
    );
    const input = {
      sourceType: 'QUOTATION',
      sourceId: document.id,
      version: 1,
    };
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    const commercial = app.get(CommercialService);
    await commercial.transitionQuotation(
      await sourceActor('sender'),
      otherProjectId,
      quotation.id,
      'INTERNAL_REVIEW',
    );
    await commercial.transitionQuotation(
      await sourceActor('publisher'),
      otherProjectId,
      quotation.id,
      'APPROVED',
    );
    const raw = await db.quotationDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    const usedBefore =
      (
        await db.fileAsset.aggregate({
          where: { organizationId: orgId },
          _sum: { sizeBytes: true },
        })
      )._sum.sizeBytes! + raw.sizeBytes!;
    const quota = {
      organizationId: orgId,
      actorId: users.sender!.id,
      incomingBytes: 1073741824n - usedBefore,
      staging: false,
      organizationLimitBytes: 1073741824n,
      globalLimitBytes: 1099511627776n,
      unmeasuredFileBytes: 10485760n,
      actorStagingLimit: 10000,
    };
    await db.$transaction((tx) => assertFileCapacity(tx, quota));
    const storage = app.get(FileStorage),
      originalStream = storage.stream.bind(storage);
    let enter!: () => void, resume!: () => void;
    const reached = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const barrier = vi
      .spyOn(storage, 'stream')
      .mockImplementationOnce(async (key) => {
        enter();
        await waiting;
        return originalStream(key);
      });
    const inFlight = post('sender', `/rooms/${room.id}/releases`, input).then(
      (r) => r,
    );
    try {
      await Promise.race([
        reached,
        inFlight.then((r) => {
          throw new Error(`Prepare exited before storage barrier: ${r.status}`);
        }),
      ]);
      await db.userRole.updateMany({
        where: { userId: users.sender!.id, roleId: role.id },
        data: { status: 'archived' },
      });
      resume();
      expect((await inFlight).status).toBe(404);
      expect(
        await db.fileAsset.count({ where: { storageKey: raw.storageKey } }),
      ).toBe(0);
      expect(
        await db.chatDocumentRelease.count({
          where: { quotationDocumentId: raw.id },
        }),
      ).toBe(0);
    } finally {
      resume();
      await inFlight.catch(() => undefined);
      barrier.mockRestore();
      await db.userRole.updateMany({
        where: { userId: users.sender!.id, roleId: role.id },
        data: { status: 'active' },
      });
    }
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      version: 2,
    }).expect(409);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      fileId: randomUUID(),
    }).expect(409);
    const release = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    // Registering the same binary as a FileAsset must not charge its bytes twice.
    await db.$transaction((tx) => assertFileCapacity(tx, quota));
    await expect(
      db.$transaction((tx) =>
        assertFileCapacity(tx, {
          ...quota,
          incomingBytes: quota.incomingBytes + 1n,
        }),
      ),
    ).rejects.toThrow('Organization file capacity');
    const bytes = await app.get(FileStorage).read(raw.storageKey);
    const preview = await getBinary(
      'publisher',
      `/releases/${release.id}/preview`,
    ).expect(200);
    expect(Buffer.from(preview.body)).toEqual(bytes);
    const review = (
      await get('publisher', `/releases/${release.id}/review`).expect(200)
    ).body;
    const published = await Promise.all(
      [1, 2].map(() =>
        post('publisher', `/releases/${release.id}/publish`, {
          confirmed: true,
          recipientHash: review.recipientHash,
        }),
      ),
    );
    expect(published.map((r) => r.status)).toEqual([201, 201]);
    expect(
      await db.auditLog.count({
        where: { entityId: release.id, action: 'chat.release.publish' },
      }),
    ).toBe(1);
    const downloaded = await getBinary(
      'guest',
      `/releases/${release.id}/download`,
    ).expect(200);
    expect(Buffer.from(downloaded.body)).toEqual(bytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0]!.state).toBe('visible');
    expect(JSON.stringify(workbook.worksheets[0]!.getSheetValues())).toContain(
      '60000',
    );
    expect(JSON.stringify(workbook.model)).not.toContain(
      'INTERNAL-MARGIN-NOTE',
    );
    for (const sheet of workbook.worksheets)
      sheet.eachRow((row) =>
        row.eachCell((cell) => expect(cell.note).toBeUndefined()),
      );
    expect(
      (await db.quotation.findUniqueOrThrow({ where: { id: quotation.id } }))
        .status,
    ).toBe('APPROVED');
    const stale = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await get('publisher', `/releases/${stale.id}/preview`).expect(200);
    await commercial.reviseQuotation(
      await sourceActor('sender'),
      otherProjectId,
      quotation.id,
      {},
    );
    await post('publisher', `/releases/${stale.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    expect(
      Buffer.from(
        (
          await getBinary('guest', `/releases/${release.id}/download`).expect(
            200,
          )
        ).body,
      ),
    ).toEqual(bytes);
  });
  const productionOrderFixture = async (
    creator: CurrentActor,
    otherProjectId: string,
  ) => {
    const run = randomUUID();
    const ownership = {
      organizationId: orgId,
      projectId: otherProjectId,
      createdBy: creator.userId,
      updatedBy: creator.userId,
    };
    const pr = await db.purchaseRequest.create({
      data: {
        ...ownership,
        requestNumber: `PR-${run}`,
        sourceType: 'PROJECT',
        requestedById: creator.userId,
      },
    });
    const rfq = await db.supplierRFQ.create({
      data: {
        ...ownership,
        rfqNumber: `RFQ-${run}`,
        purchaseRequestId: pr.id,
        responseDeadline: new Date(),
        requestedCurrency: 'VND',
        deliveryDestination: 'Fixture',
      },
    });
    const supplierId = randomUUID();
    const sq = await db.supplierQuotation.create({
      data: {
        organizationId: orgId,
        rfqId: rfq.id,
        supplierId,
        quotationNumber: `SQ-${run}`,
        quotationDate: new Date(),
        currency: 'VND',
        createdBy: creator.userId,
        updatedBy: creator.userId,
      },
    });
    const comparison = await db.supplierComparison.create({
      data: {
        ...ownership,
        rfqId: rfq.id,
        purchaseRequestId: pr.id,
        exchangeRateDate: new Date(),
      },
    });
    const selection = await db.supplierSelection.create({
      data: {
        comparisonId: comparison.id,
        supplierQuotationId: sq.id,
        supplierId,
        selectedLines: [],
        selectionReason: 'Fixture',
        selectedBy: creator.userId,
        idempotencyKey: randomUUID(),
      },
    });
    const po = await db.purchaseOrder.create({
      data: {
        ...ownership,
        poNumber: `PO-${run}`,
        supplierId,
        supplierSelectionId: selection.id,
        supplierQuotationId: sq.id,
        purchaseRequestId: pr.id,
        currency: 'VND',
        deliveryAddress: 'Fixture',
        subtotal: 0,
        totalAmount: 0,
      },
    });
    const order = await db.productionOrder.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        purchaseOrderId: po.id,
        supplierId,
        ownerId: creator.userId,
      },
    });
    return order;
  };
  it('pins approved drawing and sample sources without borrowing another approval or Project', async () => {
    // This regression must also run by itself; do not borrow the proposal test's grants.
    await post('authority', `/projects/${otherProjectId}/authorities`, {
      userId: users.manager!.id,
      actions: ['CREATE', 'ACCESS_ADMIN', 'HISTORY'],
      roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'HISTORY'],
    }).expect(201);
    await post('authority', `/projects/${otherProjectId}/authorities`, {
      userId: users.publisher!.id,
      actions: ['PUBLISH'],
      roomCeiling: [],
    }).expect(201);
    await db.organizationMembership.updateMany({
      where: { organizationId: orgId, userId: users.guest!.id },
      data: { kind: 'EXTERNAL' },
    });
    await post('authority', `/projects/${otherProjectId}/participants`, {
      userId: users.guest!.id,
    }).expect(201);
    const rights = [
      'production.read',
      'file.read',
      'file.download',
      'file.upload',
      'file.delete',
    ];
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `production-${run}`,
        name: 'Production fixture',
        permissions: {
          create: rights.map((code) => ({ permission: { connect: { code } } })),
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
    const actor = async (name: string): Promise<CurrentActor> => ({
      userId: users[name]!.id,
      organizationId: orgId,
      permissions: rights,
      administrationScope: 'ORGANIZATION',
      managedDepartmentIds: [],
      administrationTier: 0,
      email: `${name}-${run}@example.test`,
      displayName: name,
      mustChangePassword: false,
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
    });
    const creator = await actor('sender'),
      approver = await actor('publisher');
    const order = await productionOrderFixture(creator, otherProjectId);
    const bytes = Buffer.from('Bản vẽ/mẫu đã duyệt dành cho khách');
    const file = await app.get(FilesService).upload(
      creator,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'ban-ve.txt',
        mimetype: 'text/plain',
        size: bytes.length,
        buffer: bytes,
      } as Express.Multer.File,
    );
    const room = (
      await post('manager', `/projects/${otherProjectId}/rooms`, {
        title: 'Mẫu và bản vẽ khách',
        group: 'CONSULTING',
        audience: 'CUSTOMER',
      }).expect(201)
    ).body;
    for (const name of ['sender', 'publisher', 'guest'])
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users[name]!.id,
        actions: ['READ', 'UPLOAD', 'DOWNLOAD'],
        ...(name === 'guest'
          ? { expiresAt: new Date(Date.now() + 86400000).toISOString() }
          : {}),
      }).expect(201);
    const production = app.get(ProductionService);
    const technical = await production.technicalApproval(creator, order.id, {
      type: 'SHOP_DRAWING',
      title: 'Bản vẽ khách',
      description: 'Bản 1',
      fileId: file.id,
    });
    const input = {
      sourceType: 'TECHNICAL',
      sourceId: technical.revisions[0]!.id,
      version: 1,
      fileId: file.id,
    };
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    await production.decideTechnical(approver, technical.id, {
      decision: 'APPROVED',
    });
    const release = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await get('publisher', `/releases/${release.id}/preview`).expect(200);
    const review = (
      await get('publisher', `/releases/${release.id}/review`).expect(200)
    ).body;
    expect(review.sourceSnapshot.type).toBe('SHOP_DRAWING');
    await post('publisher', `/releases/${release.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    await expect(
      app.get(FilesService).remove(creator, file.id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await db.fileAsset.findUniqueOrThrow({ where: { id: file.id } }))
        .deletedAt,
    ).toBeNull();
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    const stale = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await get('publisher', `/releases/${stale.id}/preview`).expect(200);
    const reader = production as unknown as {
      scopedTechnicalApproval: (
        actor: CurrentActor,
        id: string,
      ) => Promise<{
        currentRevision: number;
        createdBy: string;
        productionOrder: { projectId: string };
      }>;
    };
    const read = reader.scopedTechnicalApproval.bind(production);
    let entered!: () => void, resume!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const barrier = vi
      .spyOn(reader, 'scopedTechnicalApproval')
      .mockImplementationOnce(async (...args) => {
        const source = await read(...args);
        entered();
        await waiting;
        return source;
      });
    const decision = production
      .decideTechnical(approver, technical.id, { decision: 'APPROVED' })
      .then(
        () => null,
        (error) => error as Error,
      );
    try {
      await Promise.race([
        reached,
        decision.then(() => {
          throw new Error('Decision did not enter source barrier');
        }),
      ]);
      await production.technicalRevision(creator, technical.id, {
        description: 'Bản 2',
        fileId: file.id,
      });
      resume();
      expect(await decision).toBeInstanceOf(ConflictException);
      const latest = await db.technicalApprovalRevision.findUniqueOrThrow({
        where: {
          technicalApprovalId_revision: {
            technicalApprovalId: technical.id,
            revision: 2,
          },
        },
      });
      expect(latest.decision).toBeNull();
    } finally {
      resume();
      await decision;
      barrier.mockRestore();
    }

    await post('publisher', `/releases/${stale.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    const sample = await production.sample(creator, order.id, {
      name: 'Mẫu khách',
      fileId: file.id,
    });
    const sampleInput = {
      sourceType: 'SAMPLE',
      sourceId: sample.id,
      version: 1,
      fileId: file.id,
    };
    await post('sender', `/rooms/${room.id}/releases`, sampleInput).expect(409);
    await production.decideSample(approver, sample.id, {
      decision: 'APPROVED',
    });
    const sampleRelease = (
      await post('sender', `/rooms/${room.id}/releases`, sampleInput).expect(
        201,
      )
    ).body;
    await get('publisher', `/releases/${sampleRelease.id}/preview`).expect(200);
    await post('publisher', `/releases/${sampleRelease.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    expect(
      (await get('guest', `/releases/${sampleRelease.id}/download`).expect(200))
        .text,
    ).toBe(bytes.toString());
    await db.productionOrder.update({
      where: { id: order.id },
      data: { projectId },
    });
    await post('sender', `/rooms/${room.id}/releases`, sampleInput).expect(409);
    await db.productionOrder.update({
      where: { id: order.id },
      data: { projectId: otherProjectId },
    });
    await db.technicalApprovalRevision.update({
      where: { id: technical.revisions[0]!.id },
      data: { submittedBy: approver.userId },
    });
    await db.technicalApproval.update({
      where: { id: technical.id },
      data: { currentRevision: 1, status: 'APPROVED' },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...sampleInput,
      fileId: randomUUID(),
    }).expect(409);
  });

  it('publishes handover documents with trusted bytes and explicit source signing state', async () => {
    const rights = [
      'handover.read',
      'file.read',
      'file.download',
      'file.upload',
    ];
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `handover-${run}`,
        name: 'Handover fixture',
        permissions: {
          create: rights.map((code) => ({ permission: { connect: { code } } })),
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
    const actor: CurrentActor = {
      userId: users.sender!.id,
      organizationId: orgId,
      permissions: rights,
      administrationScope: 'ORGANIZATION',
      managedDepartmentIds: [],
      administrationTier: 0,
      email: 'fixture@example.test',
      displayName: 'Fixture',
      mustChangePassword: false,
      organizationMembershipId: (
        await db.organizationMembership.findUniqueOrThrow({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: users.sender!.id,
            },
          },
        })
      ).id,
    };
    const handover = await db.handover.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        handoverNumber: `HO-${run}`,
        createdBy: actor.userId,
      },
    });
    const bytes = Buffer.from(
      'Hướng dẫn bảo hành dành cho khách, không yêu cầu ký',
    );
    const file = await app.get(FilesService).upload(
      actor,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'bao-hanh.txt',
        mimetype: 'text/plain',
        size: bytes.length,
        buffer: bytes,
      } as Express.Multer.File,
    );
    const afterSales = app.get(AfterSalesService);
    // A client-supplied digest is never the trusted provenance of a new version.
    await expect(
      afterSales.addHandoverDocument(actor, handover.id, {
        type: 'WARRANTY_DOCUMENT',
        fileAssetId: file.id,
        checksum: '0'.repeat(64),
        language: 'VI',
      }),
    ).rejects.toThrow('checksum');
    const raw = await db.fileAsset.findUniqueOrThrow({
      where: { id: file.id },
    });
    const document = await afterSales.addHandoverDocument(actor, handover.id, {
      type: 'WARRANTY_DOCUMENT',
      fileAssetId: file.id,
      checksum: raw.checksum!,
      language: 'VI',
    });
    const roomPath = `/projects/${otherProjectId}/rooms`;
    const roomResponse = await post('manager', roomPath, {
      title: 'Hồ sơ bảo hành khách',
      group: 'AFTER_SALES',
      audience: 'CUSTOMER',
    });
    expect(
      roomResponse.status,
      JSON.stringify({
        method: 'POST',
        path: `/api/v1/project-chat${roomPath}`,
        projectId: otherProjectId,
        handoverId: handover.id,
        atUtc: new Date().toISOString(),
        requestId: roomResponse.headers['x-request-id'] ?? null,
        statusCode: roomResponse.body?.statusCode,
        message: roomResponse.body?.message,
        error: roomResponse.body?.error,
      }),
    ).toBe(201);
    const room = roomResponse.body;
    for (const name of ['sender', 'publisher', 'guest'])
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users[name]!.id,
        actions: ['READ', 'UPLOAD', 'DOWNLOAD'],
        ...(name === 'guest'
          ? { expiresAt: new Date(Date.now() + 86400000).toISOString() }
          : {}),
      }).expect(201);
    const input = {
      sourceType: 'HANDOVER',
      sourceId: document.id,
      fileId: file.id,
      version: document.version,
    };
    const release = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await get('publisher', `/releases/${release.id}/preview`).expect(200);
    const review = (
      await get('publisher', `/releases/${release.id}/review`).expect(200)
    ).body;
    expect(review.sourceSnapshot.signedStatus).toBe('NOT_REQUIRED');
    await post('publisher', `/releases/${release.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    const sideEffects = () =>
      Promise.all([
        db.inventoryTransaction.count({ where: { projectId: otherProjectId } }),
        db.installationItem.count({ where: { projectId: otherProjectId } }),
        db.acceptanceRecord.count({ where: { projectId: otherProjectId } }),
        db.warrantyAsset.count({ where: { projectId: otherProjectId } }),
        db.warrantyRegistration.count({
          where: { asset: { projectId: otherProjectId } },
        }),
        db.warrantyClaim.count({ where: { projectId: otherProjectId } }),
      ]);
    const beforePublication = await sideEffects();
    let minutesInput: typeof input | undefined;
    for (const candidate of [
      {
        type: 'HANDOVER_MINUTES' as const,
        filename: 'bien-ban-ban-giao.txt',
        text: 'Biên bản bàn giao gửi khách, ký thủ công',
        signedStatus: 'SIGNED_MANUALLY' as const,
      },
      {
        type: 'AS_BUILT_DRAWING' as const,
        filename: 'ban-ve-hoan-cong.txt',
        text: 'Bản vẽ hoàn công dành cho khách',
        signedStatus: 'NOT_REQUIRED' as const,
      },
    ]) {
      const content = Buffer.from(candidate.text);
      const asset = await app.get(FilesService).upload(
        actor,
        {
          entityType: 'Project',
          entityId: otherProjectId,
          category: 'PROJECT_DOCUMENT',
        },
        {
          originalname: candidate.filename,
          mimetype: 'text/plain',
          size: content.length,
          buffer: content,
        } as Express.Multer.File,
      );
      const stored = await db.fileAsset.findUniqueOrThrow({
        where: { id: asset.id },
      });
      const registered = await afterSales.addHandoverDocument(
        actor,
        handover.id,
        {
          type: candidate.type,
          fileAssetId: asset.id,
          checksum: stored.checksum!,
          language: 'VI',
        },
      );
      if (candidate.signedStatus === 'SIGNED_MANUALLY')
        await afterSales.signHandoverDocument(actor, registered.id, {
          signedStatus: candidate.signedStatus,
        });
      const typedInput = {
        sourceType: 'HANDOVER',
        sourceId: registered.id,
        fileId: asset.id,
        version: registered.version,
      };
      if (candidate.type === 'HANDOVER_MINUTES') minutesInput = typedInput;
      expect(
        (await get('sender', `/rooms/${room.id}/release-sources`).expect(200))
          .body,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceType: 'HANDOVER',
            sourceId: registered.id,
            version: registered.version,
          }),
        ]),
      );
      const prepared = (
        await post('sender', `/rooms/${room.id}/releases`, typedInput).expect(
          201,
        )
      ).body;
      const checked = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      expect(checked.sourceSnapshot).toMatchObject({
        sourceType: 'HANDOVER',
        type: candidate.type,
        handoverStatus: 'DRAFT',
        signedStatus: candidate.signedStatus,
        version: registered.version,
        checksum: stored.checksum,
      });
      expect(
        (
          await getBinary(
            'publisher',
            `/releases/${prepared.id}/preview`,
          ).expect(200)
        ).body,
      ).toEqual(content);
      await post('sender', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: checked.recipientHash,
      }).expect(403);
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: checked.recipientHash,
      }).expect(201);
      expect(
        (
          await getBinary('guest', `/releases/${prepared.id}/download`).expect(
            200,
          )
        ).body,
      ).toEqual(content);
      await get('tenantB', `/releases/${prepared.id}/download`).expect(404);
    }
    expect(await sideEffects()).toEqual(beforePublication);
    const newerMinutes = Buffer.from('Biên bản bàn giao phiên bản sau');
    const newerFile = await app.get(FilesService).upload(
      actor,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'bien-ban-ban-giao-2.txt',
        mimetype: 'text/plain',
        size: newerMinutes.length,
        buffer: newerMinutes,
      } as Express.Multer.File,
    );
    const newerStored = await db.fileAsset.findUniqueOrThrow({
      where: { id: newerFile.id },
    });
    await afterSales.addHandoverDocument(actor, handover.id, {
      type: 'HANDOVER_MINUTES',
      fileAssetId: newerFile.id,
      checksum: newerStored.checksum!,
      language: 'VI',
    });
    await post('sender', `/rooms/${room.id}/releases`, minutesInput!).expect(
      409,
    );
    expect(await sideEffects()).toEqual(beforePublication);
    const stale = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await get('publisher', `/releases/${stale.id}/preview`).expect(200);
    await afterSales.signHandoverDocument(actor, document.id, {
      signedStatus: 'PENDING',
    });
    await post('publisher', `/releases/${stale.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    expect(
      (await db.handover.findUniqueOrThrow({ where: { id: handover.id } }))
        .status,
    ).toBe('DRAFT');
    const replacementBytes = Buffer.from('Hồ sơ bảo hành phiên bản mới');
    const replacement = await app.get(FilesService).upload(
      actor,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'bao-hanh-2.txt',
        mimetype: 'text/plain',
        size: replacementBytes.length,
        buffer: replacementBytes,
      } as Express.Multer.File,
    );
    const replacementRaw = await db.fileAsset.findUniqueOrThrow({
      where: { id: replacement.id },
    });
    const replacementInput = {
      type: 'WARRANTY_DOCUMENT',
      fileAssetId: replacement.id,
      checksum: replacementRaw.checksum!,
      language: 'VI',
    };
    const versions = await Promise.all(
      [1, 2].map(() =>
        afterSales.addHandoverDocument(actor, handover.id, replacementInput),
      ),
    );
    expect(versions[0]!.id).toBe(versions[1]!.id);
    expect(versions[0]!.version).toBe(2);
    expect(
      (
        await db.handoverDocument.findUniqueOrThrow({
          where: { id: document.id },
        })
      ).supersededBy,
    ).toBe(versions[0]!.id);
    expect(
      await db.handoverDocument.count({
        where: {
          handoverId: handover.id,
          type: 'WARRANTY_DOCUMENT',
          supersededBy: null,
        },
      }),
    ).toBe(1);
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    expect(
      (await get('guest', `/releases/${release.id}/download`).expect(200)).text,
    ).toBe(bytes.toString());
    await db.handover.update({
      where: { id: handover.id },
      data: { status: 'COMPLETED' },
    });
    const completed = await afterSales.completeHandover(actor, handover.id, {});
    expect(completed).toHaveProperty('checklist');
    expect(completed).toHaveProperty('documents');
    expect(completed).toHaveProperty('statusHistory');
  });

  it('blocks a waiting send when lock or revoke commits before its authorization', async () => {
    const room = (
      await post('manager', `/projects/${projectId}/rooms`, {
        title: 'Race thứ tự commit',
        group: 'CONSULTING',
        audience: 'INTERNAL',
      }).expect(201)
    ).body;
    await post('manager', `/rooms/${room.id}/grants`, {
      userId: users.sender!.id,
      actions: ['READ', 'SEND'],
    }).expect(201);
    const accepted = (
      await post('sender', `/rooms/${room.id}/messages`, {
        clientKey: randomUUID(),
        body: 'Đã commit trước khóa',
      }).expect(201)
    ).body;
    for (const revoke of [false, true]) {
      let waitingSend!: Promise<request.Response>;
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId}::uuid FOR UPDATE`;
        waitingSend = post('sender', `/rooms/${room.id}/messages`, {
          clientKey: randomUUID(),
          body: 'Phải bị chặn sau commit',
        }).then((r) => r);
        await vi.waitFor(async () => {
          const [row] = await db.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Project%'`;
          expect(row!.count).toBeGreaterThan(0n);
        });
        if (revoke)
          await tx.chatRoomGrant.updateMany({
            where: {
              roomId: room.id,
              userId: users.sender!.id,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
        else
          await tx.chatRoom.update({
            where: { id: room.id },
            data: { locked: true },
          });
      });
      expect((await waitingSend).status).toBe(revoke ? 404 : 409);
      await post('manager', `/rooms/${room.id}/lock`, { locked: false }).expect(
        201,
      );
    }
    expect(await db.chatMessage.count({ where: { roomId: room.id } })).toBe(1);
    expect(
      (await db.chatMessage.findUniqueOrThrow({ where: { id: accepted.id } }))
        .body,
    ).toBe('Đã commit trước khóa');
  });
  const customerSnapshotFixture = async (
    paymentCurrency = 'VND',
    extraPermissions: string[] = [],
    paymentAmount = '120000',
  ) => {
    const run = randomUUID();
    const permissions = [
      'contract.read',
      'receivable.read',
      'installation.read',
      'file.read',
      'file.download',
      'quotation.update',
      'quotation.approve',
      ...extraPermissions,
    ];
    const role = await db.role.create({
      data: {
        organizationId: orgId,
        code: `snapshot-${run}`,
        name: 'Nguồn khách thử',
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
    const actor: CurrentActor = {
      userId: users.sender!.id,
      organizationId: orgId,
      permissions,
      administrationScope: 'ORGANIZATION',
      managedDepartmentIds: [],
      administrationTier: 0,
      email: 'synthetic@example.test',
      displayName: 'sender',
      mustChangePassword: false,
      organizationMembershipId: (
        await db.organizationMembership.findUniqueOrThrow({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: users.sender!.id,
            },
          },
        })
      ).id,
    };
    const baseProject = await db.project.findUniqueOrThrow({
      where: { id: otherProjectId },
    });
    const project = await db.project.create({
      data: {
        organizationId: orgId,
        customerId: baseProject.customerId,
        code: `snapshot-${run}`,
        name: 'Hồ sơ nguồn khách giả lập',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    const snapshotProjectId = project.id;
    const quotation = await db.quotation.create({
      data: {
        organizationId: orgId,
        projectId: snapshotProjectId,
        customerId: project.customerId,
        number: `CONTRACT-${run}`,
        currency: 'VND',
        grandTotal: '120000',
        createdBy: actor.userId,
        updatedBy: actor.userId,
        versions: {
          create: { version: 1, createdBy: actor.userId, grandTotal: '120000' },
        },
      },
    });
    const commercial = app.get(CommercialService);
    for (const state of ['INTERNAL_REVIEW', 'APPROVED', 'SENT', 'ACCEPTED'])
      await commercial.transitionQuotation(
        state === 'APPROVED'
          ? { ...actor, userId: users.publisher!.id }
          : actor,
        snapshotProjectId,
        quotation.id,
        state,
      );
    const contracts = app.get(ContractsService);
    const contract = await contracts.create(actor, snapshotProjectId, {
      quotationId: quotation.id,
      contractNumber: `C-${run}`,
      sellerLegalEntity: 'Galaxy giả lập',
      buyerLegalEntity: 'Khách đúng hồ sơ',
    });
    const schedules = await contracts.schedules(
      actor,
      snapshotProjectId,
      contract.id,
      {
        items: [
          {
            milestoneName: 'Đợt 1',
            dueDate: new Date('2027-01-01Z'),
            amount: '120000',
            condition: 'Theo hợp đồng',
          },
        ],
      },
    );
    const payment = await contracts.payment(actor, snapshotProjectId, {
      paymentDate: new Date('2027-01-03T00:00:00.000Z'),
      amount: paymentAmount,
      currency: paymentCurrency,
      paymentMethod: 'BANK_TRANSFER',
      bankReference: `PRIVATE-${run}`,
      notes: `INTERNAL-${run}`,
      idempotencyKey: `m2-payment-${run}`,
      allocations: [{ scheduleId: schedules[0]!.id, amount: paymentAmount }],
    });
    await post('authority', `/projects/${snapshotProjectId}/authorities`, {
      userId: users.manager!.id,
      actions: ['CREATE', 'ACCESS_ADMIN', 'HISTORY'],
      roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'HISTORY'],
    }).expect(201);
    await post('authority', `/projects/${snapshotProjectId}/authorities`, {
      userId: users.publisher!.id,
      actions: ['PUBLISH'],
      roomCeiling: [],
    }).expect(201);
    await db.organizationMembership.updateMany({
      where: { organizationId: orgId, userId: users.guest!.id },
      data: { kind: 'EXTERNAL' },
    });
    await post('authority', `/projects/${snapshotProjectId}/participants`, {
      userId: users.guest!.id,
    }).expect(201);
    const room = (
      await post('manager', `/projects/${snapshotProjectId}/rooms`, {
        title: 'Nguồn hợp đồng và kế hoạch',
        group: 'COMMERCIAL',
        audience: 'CUSTOMER',
      }).expect(201)
    ).body;
    for (const name of ['sender', 'publisher', 'guest'])
      await post('manager', `/rooms/${room.id}/grants`, {
        userId: users[name]!.id,
        actions: ['READ', 'UPLOAD', 'DOWNLOAD'],
        ...(name === 'guest'
          ? { expiresAt: new Date(Date.now() + 86400000).toISOString() }
          : {}),
      }).expect(201);
    return {
      actor,
      contracts,
      contract,
      schedules,
      payment,
      room,
      role,
      permissions,
      run,
      otherProjectId: snapshotProjectId,
    };
  };
  it('prepares customer contract, payment schedule and installation snapshots through real domain writers without business side effects', async () => {
    const {
      actor,
      contracts,
      contract,
      schedules,
      payment,
      room,
      role,
      run,
      otherProjectId,
    } = await customerSnapshotFixture();
    const installation = app.get(InstallationService);
    const plan = await installation.createPlan(actor, {
      projectId: otherProjectId,
      planNumber: `I-${run}`,
      name: 'Lịch dự kiến',
      siteReady: false,
      customerCoordination: false,
      plannedStartDate: new Date('2027-01-02Z'),
    });
    await installation.createWorkOrder(actor, plan.id, {
      workOrderNumber: `W-${run}`,
      title: 'Lắp hạng mục A',
      requiredInventory: false,
      approvedDrawing: false,
      checklist: [{ title: 'Kiểm tra', required: true }],
    });
    const sourceRows = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body;
    const completed: {
      id: string;
      bytes: Buffer;
      input: {
        sourceType: string;
        sourceId: string;
        sourceFingerprint: string;
        clientKey: string;
      };
    }[] = [];
    for (const [sourceType, sourceId, word] of [
      ['CONTRACT', contract.id, 'Khách đúng hồ sơ'],
      ['PAYMENT', schedules[0]!.id, '120000'],
      ['CUSTOMER_PAYMENT_RECORD', payment.id, '120000'],
      ['DELIVERY_INSTALL', plan.id, 'Lắp hạng mục A'],
    ] as const) {
      const source = sourceRows.find(
        (s: { sourceType: string; sourceId: string }) =>
          s.sourceType === sourceType && s.sourceId === sourceId,
      );
      expect(
        source,
        `Nguồn ${sourceType} phải có đường chuẩn bị thật`,
      ).toBeDefined();
      const input = {
        sourceType,
        sourceId,
        sourceFingerprint: source.sourceFingerprint,
        clientKey: randomUUID(),
      };
      await post('sender', `/rooms/${room.id}/releases`, {
        ...input,
        sourceFingerprint: '0'.repeat(64),
      }).expect(409);
      const prepared = (
        await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
      ).body;
      expect(
        (await post('sender', `/rooms/${room.id}/releases`, input).expect(201))
          .body.id,
      ).toBe(prepared.id);
      await post('sender', `/rooms/${room.id}/releases`, {
        ...input,
        sourceFingerprint: 'f'.repeat(64),
      }).expect(409);
      const preview = (
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          200,
        )
      ).body as Buffer;
      expect(preview.toString()).toContain(word);
      expect(preview.toString()).not.toMatch(
        /bankReference|exchangeRate|internalNote|overrideReason|PRIVATE-|INTERNAL-/,
      );
      const review = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      await post('sender', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(403);
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(201);
      expect(
        (
          await getBinary('guest', `/releases/${prepared.id}/download`).expect(
            200,
          )
        ).body,
      ).toEqual(preview);
      await get('tenantB', `/releases/${prepared.id}/download`).expect(404);
      completed.push({ id: prepared.id, bytes: preview, input });
    }
    expect(
      (await db.contract.findUniqueOrThrow({ where: { id: contract.id } }))
        .status,
    ).toBe('DRAFT');
    const original = completed[0]!;
    const pending = (
      await post('sender', `/rooms/${room.id}/releases`, {
        ...original.input,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const storage = app.get(FileStorage),
      put = storage.putStream.bind(storage);
    const change = vi
      .spyOn(storage, 'putStream')
      .mockImplementationOnce(async (...args) => {
        await contracts.transition(actor, otherProjectId, contract.id, {
          status: 'INTERNAL_REVIEW',
        });
        return put(...args);
      });
    try {
      await post('sender', `/rooms/${room.id}/releases`, {
        ...original.input,
        clientKey: randomUUID(),
      }).expect(409);
    } finally {
      change.mockRestore();
    }
    await get('publisher', `/releases/${pending.id}/preview`).expect(409);
    expect(
      (
        await getBinary('guest', `/releases/${original.id}/download`).expect(
          200,
        )
      ).body,
    ).toEqual(original.bytes);
    const fresh = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body.find(
      (r: { sourceType: string; sourceId: string }) =>
        r.sourceType === 'CONTRACT' && r.sourceId === contract.id,
    );
    const input = {
      sourceType: 'CONTRACT',
      sourceId: contract.id,
      sourceFingerprint: fresh.sourceFingerprint,
      clientKey: randomUUID(),
    };
    const finalize = storage.publishPending.bind(storage);
    let ownedKey = '';
    const revoked = vi
      .spyOn(storage, 'publishPending')
      .mockImplementationOnce(async (key, claim) => {
        ownedKey = key;
        await finalize(key, claim);
        const revokedRoles = await db.userRole.updateMany({
          where: { roleId: role.id, userId: actor.userId },
          data: { status: 'archived' },
        });
        expect(revokedRoles.count).toBe(1);
      });
    try {
      await post('sender', `/rooms/${room.id}/releases`, input).expect(404);
    } finally {
      revoked.mockRestore();
      await db.userRole.updateMany({
        where: { roleId: role.id, userId: actor.userId },
        data: { status: 'active' },
      });
    }
    expect(ownedKey).not.toBe('');
    expect(await db.fileAsset.count({ where: { storageKey: ownedKey } })).toBe(
      0,
    );
    expect(
      await db.contractDocument.count({ where: { storageKey: ownedKey } }),
    ).toBe(0);
    expect(
      await db.chatDocumentRelease.count({
        where: { roomId: room.id, prepareKey: input.clientKey },
      }),
    ).toBe(0);
    await expect(storage.read(ownedKey)).rejects.toThrow();
    const parallel = await Promise.all([
      post('sender', `/rooms/${room.id}/releases`, input),
      post('sender', `/rooms/${room.id}/releases`, input),
    ]);
    expect(parallel.map((r) => r.status)).toEqual([201, 201]);
    expect(parallel[0]!.body.id).toBe(parallel[1]!.body.id);
    await contracts.transition(actor, otherProjectId, contract.id, {
      status: 'SIGNED',
    });
    const appendix = await contracts.createAppendix(
      actor,
      otherProjectId,
      contract.id,
      {
        appendixNumber: 'PL-1',
        type: 'SCHEDULE_CHANGE',
        title: 'Điều chỉnh lịch dự kiến',
        valueChange: '0',
        currency: 'VND',
        idempotencyKey: randomUUID(),
      },
    );
    const appendixSource = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body.find((r: { appendixId?: string }) => r.appendixId === appendix.id);
    expect(appendixSource).toBeDefined();
    await post('sender', `/rooms/${room.id}/releases`, {
      sourceType: 'CONTRACT',
      sourceId: contract.id,
      appendixId: randomUUID(),
      sourceFingerprint: appendixSource.sourceFingerprint,
      clientKey: randomUUID(),
    }).expect(409);
    const appendixRelease = (
      await post('sender', `/rooms/${room.id}/releases`, {
        sourceType: 'CONTRACT',
        sourceId: contract.id,
        appendixId: appendix.id,
        sourceFingerprint: appendixSource.sourceFingerprint,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    expect(
      (
        await getBinary(
          'publisher',
          `/releases/${appendixRelease.id}/preview`,
        ).expect(200)
      ).body.toString(),
    ).toContain('Điều chỉnh lịch dự kiến');
    const installInput = { ...completed[3]!.input, clientKey: randomUUID() };
    const staleInstall = (
      await post('sender', `/rooms/${room.id}/releases`, installInput).expect(
        201,
      )
    ).body;
    await installation.createWorkOrder(actor, plan.id, {
      workOrderNumber: `W2-${run}`,
      title: 'Hạng mục phát sinh',
      requiredInventory: false,
      approvedDrawing: false,
      checklist: [{ title: 'Kiểm tra' }],
    });
    await get('publisher', `/releases/${staleInstall.id}/preview`).expect(409);
    expect(
      (
        await getBinary(
          'guest',
          `/releases/${completed[3]!.id}/download`,
        ).expect(200)
      ).body,
    ).toEqual(completed[3]!.bytes);
    expect(
      (await db.contract.findUniqueOrThrow({ where: { id: contract.id } }))
        .status,
    ).toBe('SIGNED');
    expect(
      await db.customerPayment.count({
        where: { organizationId: orgId, projectId: otherProjectId },
      }),
    ).toBe(1);
    const recordedPayment = await db.customerPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(recordedPayment.amount.toString()).toBe('120000');
    expect(recordedPayment.bankReference).toBe(`PRIVATE-${run}`);
    expect(recordedPayment.notes).toBe(`INTERNAL-${run}`);
    expect(
      (
        await db.installationWorkOrder.findFirstOrThrow({
          where: { planId: plan.id },
        })
      ).status,
    ).toBe('DRAFT');
  });
  const customerFileFixture = async (
    paymentFile = false,
    extraPermissions: string[] = [],
  ) => {
    const fixture = await customerSnapshotFixture(
      'VND',
      [
        'contract.update',
        'file.upload',
        'file.update',
        'file.delete',
        'file.restore',
        ...(paymentFile ? ['receivable.payment.record'] : []),
        ...extraPermissions,
      ],
      paymentFile ? '60000' : '120000',
    );
    const bytes = Buffer.from(
      paymentFile
        ? 'Chứng từ khoản thu do nhân viên cung cấp'
        : 'Hợp đồng gửi khách xem xét, chưa xác nhận chữ ký',
    );
    const file = (
      await call()
        .post('/api/v1/files')
        .set('Cookie', users.sender!.cookie)
        .field('entityType', 'Project')
        .field('entityId', fixture.otherProjectId)
        .field('category', 'PROJECT_DOCUMENT')
        .attach('file', bytes, {
          filename: 'hop-dong.txt',
          contentType: 'text/plain',
        })
        .expect(201)
    ).body;
    const candidates = (
      await get(
        'sender',
        `/rooms/${fixture.room.id}/${paymentFile ? 'payment' : 'contract'}-files?sourceId=${paymentFile ? fixture.payment.id : fixture.contract.id}`,
      ).expect(200)
    ).body;
    expect(candidates.files).toContainEqual(
      expect.objectContaining({ id: file.id, version: file.version }),
    );
    return {
      ...fixture,
      bytes,
      file,
      input: {
        sourceType: paymentFile ? 'CUSTOMER_PAYMENT_FILE' : 'CONTRACT_FILE',
        sourceId: paymentFile ? fixture.payment.id : fixture.contract.id,
        fileId: file.id,
        version: file.version,
        sourceFingerprint: candidates.sourceFingerprint,
        clientKey: randomUUID(),
      },
    };
  };
  const siteDeliveryFixture = async () => {
    const fixture = await customerFileFixture(false, [
      'installation.execute',
      'installation.manage',
    ]);
    const { actor, otherProjectId } = fixture;
    const installation = app.get(InstallationService);
    const plan = await installation.createPlan(actor, {
      projectId: otherProjectId,
      planNumber: randomUUID(),
      name: 'Giao tại công trường fixture',
      siteReady: false,
      customerCoordination: false,
    });
    const workOrder = await installation.createWorkOrder(actor, plan.id, {
      workOrderNumber: randomUUID(),
      title: 'Chưa lắp đặt',
      requiredInventory: true,
      approvedDrawing: false,
      checklist: [{ title: 'Kiểm tra công trường', required: true }],
    });
    const brand = await db.brand.create({
      data: { organizationId: orgId, name: randomUUID() },
    });
    const product = await db.product.create({
      data: {
        organizationId: orgId,
        brandId: brand.id,
        productCode: randomUUID(),
        name: 'Hàng fixture',
        unit: 'm',
      },
    });
    const inventoryItem = await db.inventoryItem.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        productId: product.id,
        itemCode: randomUUID(),
        unit: 'm',
      },
    });
    const warehouse = await db.warehouse.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        code: randomUUID(),
        name: 'Kho fixture',
        type: 'PROJECT',
        createdBy: actor.userId,
      },
    });
    await app.get(InventoryService).post(actor, {
      transactionNumber: randomUUID(),
      type: 'RECEIVE',
      idempotencyKey: randomUUID(),
      projectId: otherProjectId,
      sourceType: 'FixtureOpening',
      sourceId: inventoryItem.id,
      lines: [
        {
          inventoryItemId: inventoryItem.id,
          warehouseId: warehouse.id,
          quantity: '2.125',
          onHandDelta: '2.125',
          availableDelta: '2.125',
        },
      ],
    });
    const operations = app.get(InventoryOperationsService);
    const issue = await operations.createIssue(actor, {
      projectId: otherProjectId,
      warehouseId: warehouse.id,
      issueNumber: randomUUID(),
      reason: 'PROJECT_SITE',
      recipient: 'Nhân viên giao fixture',
      lines: [{ inventoryItemId: inventoryItem.id, quantity: '2.125' }],
    });
    await operations.approveIssue(
      { ...actor, userId: users.publisher!.id },
      issue.id,
    );
    await operations.postIssue(actor, issue.id);
    const input = {
      clientKey: randomUUID(),
      deliveryDate: '2027-01-04T00:00:00.000Z',
      recipient: 'Người nhận tại công trường',
      evidenceFileId: fixture.file.id,
      evidenceFileVersion: fixture.file.version,
      items: [{ stockIssueLineId: issue.lines[0]!.id, quantity: '1.125' }],
    };
    return {
      ...fixture,
      workOrder,
      inventoryItem,
      issue,
      deliveryInput: input,
    };
  };
  it('records and publishes staff site delivery evidence through HTTP without inventory or acceptance side effects', async () => {
    const {
      room,
      workOrder,
      deliveryInput,
      bytes,
      otherProjectId,
      inventoryItem,
    } = await siteDeliveryFixture();
    const before = {
      inventory: await db.inventoryTransaction.count({
        where: { projectId: otherProjectId },
      }),
      items: await db.installationItem.count({
        where: { projectId: otherProjectId },
      }),
      acceptance: await db.acceptanceRecord.count({
        where: { projectId: otherProjectId },
      }),
    };
    const options = (
      await call()
        .get(
          `/api/v1/installation/work-orders/${workOrder.id}/delivery-options`,
        )
        .set('Cookie', users.sender!.cookie)
        .expect(200)
    ).body;
    expect(options.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stockIssueLineId: deliveryInput.items[0]!.stockIssueLineId,
          inventoryItemId: inventoryItem.id,
          unit: 'm',
          quantity: '2.125',
        }),
      ]),
    );
    const response = () =>
      call()
        .post(`/api/v1/installation/work-orders/${workOrder.id}/deliveries`)
        .set('Cookie', users.sender!.cookie)
        .send(deliveryInput);
    const delivery = (await response().expect(201)).body;
    expect((await response().expect(201)).body.id).toBe(delivery.id);
    expect(delivery).toMatchObject({
      installationWorkOrderId: workOrder.id,
      evidenceFileId: deliveryInput.evidenceFileId,
      evidenceFileVersion: deliveryInput.evidenceFileVersion,
      items: [
        expect.objectContaining({
          inventoryItemId: inventoryItem.id,
          quantity: '1.125',
          unit: 'm',
        }),
      ],
    });
    const source = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body.find(
      (s: { sourceType: string; sourceId: string }) =>
        s.sourceType === 'SITE_DELIVERY' && s.sourceId === delivery.id,
    );
    expect(source).toBeDefined();
    expect(source.name).toContain(workOrder.workOrderNumber);
    expect(source.name).toContain(deliveryInput.recipient);
    expect(source.name).toContain(deliveryInput.deliveryDate.slice(0, 10));
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, {
        sourceType: 'SITE_DELIVERY',
        sourceId: delivery.id,
        fileId: deliveryInput.evidenceFileId,
        version: deliveryInput.evidenceFileVersion,
        sourceFingerprint: source.sourceFingerprint,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    expect(
      (
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    const review = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    await post('sender', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(403);
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    expect(
      (
        await getBinary('guest', `/releases/${prepared.id}/download`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    expect({
      inventory: await db.inventoryTransaction.count({
        where: { projectId: otherProjectId },
      }),
      items: await db.installationItem.count({
        where: { projectId: otherProjectId },
      }),
      acceptance: await db.acceptanceRecord.count({
        where: { projectId: otherProjectId },
      }),
    }).toEqual(before);
    expect(
      (
        await db.installationWorkOrder.findUniqueOrThrow({
          where: { id: workOrder.id },
        })
      ).status,
    ).toBe('DRAFT');
  });
  const postDelivery = (actor: string, id: string, input: object) =>
    call()
      .post(`/api/v1/installation/work-orders/${id}/deliveries`)
      .set('Cookie', users[actor]!.cookie)
      .send(input);
  it('rejects site delivery quantity, metadata, evidence version and changed replay input', async () => {
    const { workOrder, deliveryInput } = await siteDeliveryFixture();
    for (const [quantity, status] of [
      ['0', 422],
      ['2.126', 422],
      ['1.0000', 400],
      ['-1', 400],
    ] as const)
      await postDelivery('sender', workOrder.id, {
        ...deliveryInput,
        items: [{ ...deliveryInput.items[0], quantity }],
      }).expect(status);
    await postDelivery('sender', workOrder.id, {
      ...deliveryInput,
      recipient: '   ',
    }).expect(400);
    await postDelivery('sender', workOrder.id, {
      ...deliveryInput,
      deliveryDate: 'not-a-date',
    }).expect(400);
    await postDelivery('sender', workOrder.id, {
      ...deliveryInput,
      items: [{ ...deliveryInput.items[0], inventoryItemId: randomUUID() }],
    }).expect(400);
    await postDelivery('sender', workOrder.id, {
      ...deliveryInput,
      evidenceFileVersion: deliveryInput.evidenceFileVersion + 1,
    }).expect(409);
    await postDelivery('sender', workOrder.id, deliveryInput).expect(201);
    await postDelivery('sender', workOrder.id, {
      ...deliveryInput,
      recipient: 'Khác nội dung',
    }).expect(409);
    expect(
      await db.siteDelivery.count({
        where: { installationWorkOrderId: workOrder.id },
      }),
    ).toBe(1);
  });
  it('rejects site delivery source Project mismatch and evidence owned by another source', async () => {
    const { workOrder, deliveryInput, issue, otherProjectId, room, input } =
      await siteDeliveryFixture();
    await db.stockIssue.update({
      where: { id: issue.id },
      data: { projectId },
    });
    await postDelivery('sender', workOrder.id, deliveryInput).expect(404);
    await db.stockIssue.update({
      where: { id: issue.id },
      data: { projectId: otherProjectId },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(201);
    await postDelivery('sender', workOrder.id, deliveryInput).expect(404);
    expect(
      await db.siteDelivery.count({
        where: { installationWorkOrderId: workOrder.id },
      }),
    ).toBe(0);
  });
  it.each(['source', 'file', 'permission'] as const)(
    'rechecks site delivery %s after evidence storage I/O',
    async (change) => {
      const { workOrder, deliveryInput, issue, file, actor } =
        await siteDeliveryFixture();
      const assignments = await db.userRole.findMany({
        where: { userId: actor.userId, status: 'active' },
        select: { id: true },
      });
      const storage = app.get(FileStorage),
        stream = storage.stream.bind(storage);
      const reading = vi
        .spyOn(storage, 'stream')
        .mockImplementationOnce(async (key) => {
          if (change === 'source')
            await db.stockIssueLine.update({
              where: { id: issue.lines[0]!.id },
              data: { quantity: '2' },
            });
          else if (change === 'file')
            await app
              .get(FilesService)
              .update(actor, file.id, { category: 'CHANGED' });
          else
            await db.userRole.updateMany({
              where: { id: { in: assignments.map((a) => a.id) } },
              data: { status: 'archived' },
            });
          return stream(key);
        });
      try {
        await postDelivery('sender', workOrder.id, deliveryInput).expect(
          change === 'permission' ? 404 : 409,
        );
      } finally {
        reading.mockRestore();
        if (change === 'permission')
          await db.userRole.updateMany({
            where: { id: { in: assignments.map((a) => a.id) } },
            data: { status: 'active' },
          });
      }
      expect(
        await db.siteDelivery.count({
          where: { installationWorkOrderId: workOrder.id },
        }),
      ).toBe(0);
    },
  );
  it('keeps site delivery idempotent under concurrent HTTP writes', async () => {
    const { workOrder, deliveryInput } = await siteDeliveryFixture();
    const [first, second] = await Promise.all([
      postDelivery('sender', workOrder.id, deliveryInput),
      postDelivery('sender', workOrder.id, deliveryInput),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).toBe(first.body.id);
    expect(
      await db.siteDelivery.count({
        where: { installationWorkOrderId: workOrder.id },
      }),
    ).toBe(1);
    expect(
      await db.activity.count({
        where: { entityId: first.body.id, event: 'SITE_DELIVERY_RECORDED' },
      }),
    ).toBe(1);
  });
  it('serializes site delivery evidence associations through the typed FileAsset foreign key', async () => {
    const { workOrder, deliveryInput, actor, otherProjectId } =
      await siteDeliveryFixture();
    let pending!: Promise<request.Response>;
    await db.$transaction(async (tx) => {
      const [backend] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      await tx.siteDelivery.create({
        data: {
          organizationId: actor.organizationId,
          projectId: otherProjectId,
          installationWorkOrderId: workOrder.id,
          deliveryDate: new Date(),
          recipient: 'Legacy nguồn khác',
          evidenceFileId: deliveryInput.evidenceFileId,
          items: [],
          createdBy: actor.userId,
        },
      });
      pending = postDelivery('sender', workOrder.id, deliveryInput).then(
        (response) => response,
      );
      await expect
        .poll(
          async () => {
            const rows = await db.$queryRaw<
              { blocked: boolean }[]
            >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${backend!.pid}=ANY(pg_blocking_pids(pid)) AND query LIKE '%FileAsset%') AS blocked`;
            return rows[0]!.blocked;
          },
          { timeout: 1000 },
        )
        .toBe(true);
    });
    const blocked = await pending;
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toBe(
      'File đang thuộc nguồn khác; cần bản riêng để xem xét',
    );
    expect(
      await db.siteDelivery.count({
        where: { clientKey: deliveryInput.clientKey },
      }),
    ).toBe(0);
  });
  it('hides pinned site delivery metadata from WorkOrder readers without fresh scoped file rights', async () => {
    const { workOrder, deliveryInput, room, otherProjectId, actor } =
      await siteDeliveryFixture();
    // Satisfy the existing WorkOrder read prerequisite independently of the
    // new pinned-evidence permissions checked below.
    await db.projectMember.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        userId: users.publisher!.id,
        createdBy: actor.userId,
      },
    });
    const delivery = (
      await postDelivery('sender', workOrder.id, deliveryInput).expect(201)
    ).body;
    const source = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body.find(
      (s: { sourceType: string }) => s.sourceType === 'SITE_DELIVERY',
    );
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, {
        sourceType: 'SITE_DELIVERY',
        sourceId: delivery.id,
        fileId: deliveryInput.evidenceFileId,
        version: deliveryInput.evidenceFileVersion,
        sourceFingerprint: source.sourceFingerprint,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const assignments = await db.userRole.findMany({
      where: { userId: users.publisher!.id, status: 'active' },
      select: { id: true },
    });
    const reader = await db.role.create({
      data: {
        organizationId: orgId,
        code: randomUUID(),
        name: 'Chỉ đọc WO',
        permissions: {
          create: { permission: { connect: { code: 'installation.read' } } },
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: orgId,
        userId: users.publisher!.id,
        roleId: reader.id,
        scopeType: 'ORGANIZATION',
      },
    });
    await db.userRole.updateMany({
      where: { id: { in: assignments.map((a) => a.id) } },
      data: { status: 'archived' },
    });
    const read = () =>
      call()
        .get(`/api/v1/installation/work-orders/${workOrder.id}`)
        .set('Cookie', users.publisher!.cookie);
    try {
      const denied = (await read().expect(200)).body;
      expect(denied.deliveries).toEqual([]);
      expect(JSON.stringify(denied)).not.toContain(
        deliveryInput.evidenceFileId,
      );
      const files = await db.role.create({
        data: {
          organizationId: orgId,
          code: randomUUID(),
          name: 'Chỉ đọc file',
          permissions: {
            create: { permission: { connect: { code: 'file.read' } } },
          },
        },
      });
      const fileAssignment = await db.userRole.create({
        data: {
          organizationId: orgId,
          userId: users.publisher!.id,
          roleId: files.id,
          scopeType: 'ORGANIZATION',
        },
      });
      const download = await db.role.create({
        data: {
          organizationId: orgId,
          code: randomUUID(),
          name: 'Tải file ở binding khác',
          permissions: {
            create: { permission: { connect: { code: 'file.download' } } },
          },
        },
      });
      await db.userRole.create({
        data: {
          organizationId: orgId,
          userId: users.publisher!.id,
          roleId: download.id,
          scopeType: 'ORGANIZATION',
        },
      });
      expect((await read().expect(200)).body.deliveries).toEqual([]);
      await db.rolePermission.create({
        data: {
          role: { connect: { id: files.id } },
          permission: { connect: { code: 'file.download' } },
        },
      });
      expect((await read().expect(200)).body.deliveries).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: delivery.id })]),
      );
      await postDelivery('publisher', workOrder.id, {
        ...deliveryInput,
        clientKey: randomUUID(),
      }).expect(403);
      await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
        200,
      );
      const review = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(201);
      await db.userRole.update({
        where: { id: fileAssignment.id },
        data: { status: 'archived' },
      });
      expect((await read().expect(200)).body.deliveries).toEqual([]);
    } finally {
      await db.userRole.updateMany({
        where: { id: { in: assignments.map((a) => a.id) } },
        data: { status: 'active' },
      });
    }
  });
  it('hides pinned site delivery metadata after customer rebind or evidence version change', async () => {
    const { workOrder, deliveryInput, room, actor, otherProjectId } =
      await siteDeliveryFixture();
    const delivery = (
      await postDelivery('sender', workOrder.id, deliveryInput).expect(201)
    ).body;
    await db.projectMember.create({
      data: {
        organizationId: orgId,
        projectId: otherProjectId,
        userId: users.publisher!.id,
        createdBy: actor.userId,
      },
    });
    const read = () =>
      call()
        .get(`/api/v1/installation/work-orders/${workOrder.id}`)
        .set('Cookie', users.publisher!.cookie);
    expect((await read().expect(200)).body.deliveries).toHaveLength(1);
    const project = await db.project.findUniqueOrThrow({
      where: { id: otherProjectId },
    });
    const customer = await db.customer.create({
      data: {
        organizationId: orgId,
        type: 'INDIVIDUAL',
        displayName: 'Khách khác của Project',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    await db.project.update({
      where: { id: otherProjectId },
      data: { customerId: customer.id },
    });
    const rebound = (await read().expect(200)).body;
    expect(rebound.deliveries).toEqual([]);
    expect(JSON.stringify(rebound)).not.toContain(deliveryInput.evidenceFileId);
    expect(
      (await get('sender', `/rooms/${room.id}/release-sources`).expect(200))
        .body,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: delivery.id }),
      ]),
    );
    await db.project.update({
      where: { id: otherProjectId },
      data: { customerId: project.customerId },
    });
    expect((await read().expect(200)).body.deliveries).toHaveLength(1);
    await db.fileAsset.update({
      where: { id: deliveryInput.evidenceFileId },
      data: { version: { increment: 1 } },
    });
    expect((await read().expect(200)).body.deliveries).toEqual([]);
  });
  it('requires scoped site delivery execute rights and keeps the writer behind the feature flag', async () => {
    const { workOrder, deliveryInput, actor, role } =
      await siteDeliveryFixture();
    const other = await db.userRole.findMany({
      where: {
        userId: actor.userId,
        status: 'active',
        roleId: { not: role.id },
      },
      select: { id: true },
    });
    const permission = await db.permission.findUniqueOrThrow({
      where: { code: 'installation.execute' },
    });
    await db.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
    });
    const executeRole = await db.role.create({
      data: {
        organizationId: orgId,
        code: randomUUID(),
        name: 'Thực hiện ngoài phạm vi',
        permissions: { create: { permissionId: permission.id } },
      },
    });
    const assignment = await db.userRole.create({
      data: {
        organizationId: orgId,
        userId: actor.userId,
        roleId: executeRole.id,
        scopeType: 'SELF',
      },
    });
    await db.userRole.updateMany({
      where: { id: { in: other.map((a) => a.id) } },
      data: { status: 'archived' },
    });
    const flag = process.env.FEATURE_PROJECT_CHAT;
    try {
      await postDelivery('sender', workOrder.id, deliveryInput).expect(404);
      await db.userRole.update({
        where: { id: assignment.id },
        data: { scopeType: 'ORGANIZATION' },
      });
      process.env.FEATURE_PROJECT_CHAT = 'false';
      await postDelivery('sender', workOrder.id, deliveryInput).expect(404);
      process.env.FEATURE_PROJECT_CHAT = flag;
      await postDelivery('sender', workOrder.id, deliveryInput).expect(201);
    } finally {
      process.env.FEATURE_PROJECT_CHAT = flag;
      await db.userRole.updateMany({
        where: { id: { in: other.map((a) => a.id) } },
        data: { status: 'active' },
      });
    }
  });
  it('rejects unpinned and stale site delivery sources and tampered evidence before publication', async () => {
    const { room, workOrder, deliveryInput, file, bytes } =
      await siteDeliveryFixture();
    const delivery = (
      await postDelivery('sender', workOrder.id, deliveryInput).expect(201)
    ).body;
    const source = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body.find(
      (s: { sourceType: string }) => s.sourceType === 'SITE_DELIVERY',
    );
    const input = {
      sourceType: 'SITE_DELIVERY',
      sourceId: delivery.id,
      fileId: file.id,
      version: file.version,
      sourceFingerprint: source.sourceFingerprint,
      clientKey: randomUUID(),
    };
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
      200,
    );
    const review = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    await db.siteDelivery.update({
      where: { id: delivery.id },
      data: { recipient: 'Nguồn thay đổi' },
    });
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    await db.siteDelivery.update({
      where: { id: delivery.id },
      data: { recipient: delivery.recipient },
    });
    const stored = await db.fileAsset.findUniqueOrThrow({
      where: { id: file.id },
    });
    const path = join(process.env.FILE_STORAGE_PATH!, stored.storageKey);
    try {
      await writeFile(path, 'Khác bytes đã ghim');
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(409);
    } finally {
      await writeFile(path, bytes);
    }
    await db.siteDelivery.update({
      where: { id: delivery.id },
      data: {
        clientKey: null,
        requestHash: null,
        evidenceFileVersion: null,
        evidenceChecksum: null,
      },
    });
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      clientKey: randomUUID(),
    }).expect(409);
    expect(
      (
        await db.chatDocumentRelease.findUniqueOrThrow({
          where: { id: prepared.id },
        })
      ).publishedAt,
    ).toBeNull();
  });
  it('publishes an employee supplied payment file with exact bytes and no payment side effects', async () => {
    const { room, payment, file, bytes, input, actor, otherProjectId } =
      await customerFileFixture(true);
    const before = await db.customerPayment.findMany({
      where: { projectId: otherProjectId },
      include: { allocations: true },
    });
    expect(
      (await get('sender', `/rooms/${room.id}/release-sources`).expect(200))
        .body,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'CUSTOMER_PAYMENT_FILE',
          sourceId: payment.id,
          sourceFingerprint: input.sourceFingerprint,
        }),
      ]),
    );
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    expect(
      (await post('sender', `/rooms/${room.id}/releases`, input).expect(201))
        .body.id,
    ).toBe(prepared.id);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      version: file.version + 1,
    }).expect(409);
    const release = await db.chatDocumentRelease.findUniqueOrThrow({
      where: { id: prepared.id },
    });
    expect(release).toMatchObject({
      customerPaymentId: payment.id,
      fileAssetId: file.id,
      contractDocumentId: null,
      version: file.version,
      sourceSnapshot: expect.objectContaining({
        sourceType: 'CUSTOMER_PAYMENT_FILE',
        purpose: 'Chứng từ khoản thu do nhân viên cung cấp',
      }),
    });
    expect(prepared.fileVersion).toBe(file.version);
    expect(
      (
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    const review = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    await post('sender', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(403);
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    expect(
      (
        await getBinary('guest', `/releases/${prepared.id}/download`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    await call()
      .get(`/api/v1/files/${file.id}/download`)
      .set('Cookie', users.guest!.cookie)
      .expect(403);
    await expect(app.get(FilesService).remove(actor, file.id)).rejects.toThrow(
      ConflictException,
    );
    expect(
      await db.customerPayment.findMany({
        where: { projectId: otherProjectId },
        include: { allocations: true },
      }),
    ).toEqual(before);
    expect(
      await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
    ).toBe(1);
  });
  it.each(['contract-first', 'payment-first'] as const)(
    'rejects payment file ownership across contract sources: %s',
    async (order) => {
      const { room, contract, file, input } = await customerFileFixture(true);
      const source = (
        await get(
          'sender',
          `/rooms/${room.id}/contract-files?sourceId=${contract.id}`,
        ).expect(200)
      ).body;
      const contractInput = {
        ...input,
        sourceType: 'CONTRACT_FILE',
        sourceId: contract.id,
        sourceFingerprint: source.sourceFingerprint,
        clientKey: randomUUID(),
      };
      const first = order === 'contract-first' ? contractInput : input;
      const second = order === 'contract-first' ? input : contractInput;
      await post('sender', `/rooms/${room.id}/releases`, first).expect(201);
      await post('sender', `/rooms/${room.id}/releases`, second).expect(404);
      expect(
        (
          await get(
            'sender',
            `/rooms/${room.id}/${order === 'contract-first' ? 'payment' : 'contract'}-files?sourceId=${second.sourceId}`,
          ).expect(200)
        ).body.files,
      ).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: file.id })]),
      );
    },
  );
  it('rejects payment file reuse by another payment and changed replay payload', async () => {
    const {
      room,
      payment,
      input,
      contracts,
      actor,
      otherProjectId,
      schedules,
    } = await customerFileFixture(true);
    await post('sender', `/rooms/${room.id}/releases`, input).expect(201);
    const other = await contracts.payment(actor, otherProjectId, {
      paymentDate: new Date('2027-01-04Z'),
      amount: '60000',
      currency: 'VND',
      paymentMethod: 'BANK_TRANSFER',
      idempotencyKey: randomUUID(),
      allocations: [{ scheduleId: schedules[0]!.id, amount: '60000' }],
    });
    const candidate = (
      await get(
        'sender',
        `/rooms/${room.id}/payment-files?sourceId=${other.id}`,
      ).expect(200)
    ).body;
    expect(candidate.files).toEqual([]);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      sourceId: other.id,
      sourceFingerprint: candidate.sourceFingerprint,
    }).expect(404);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      sourceFingerprint: '0'.repeat(64),
    }).expect(409);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      appendixId: randomUUID(),
    }).expect(400);
    expect(
      await db.chatDocumentRelease.count({
        where: { customerPaymentId: payment.id },
      }),
    ).toBe(1);
  });
  it('rejects payment file sources with currency, customer or Project disagreement', async () => {
    const { room, input, payment, contract, actor } =
      await customerFileFixture(true);
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { currency: 'USD' },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { currency: 'VND' },
    });
    const wrongCustomer = await db.customer.create({
      data: {
        organizationId: orgId,
        type: 'INDIVIDUAL',
        displayName: 'Sai khách khoản thu',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    await db.contract.update({
      where: { id: contract.id },
      data: { customerId: wrongCustomer.id },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    await db.contract.update({
      where: { id: contract.id },
      data: { customerId: contract.customerId },
    });
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { projectId },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    expect(
      await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
    ).toBe(0);
  });
  it.each(['source', 'file', 'permission'] as const)(
    'rechecks payment file %s after storage before registration',
    async (change) => {
      const { room, payment, file, input, actor } =
        await customerFileFixture(true);
      const assignments = await db.userRole.findMany({
        where: { userId: actor.userId, status: 'active' },
        select: { id: true },
      });
      const storage = app.get(FileStorage),
        stream = storage.stream.bind(storage);
      const reading = vi
        .spyOn(storage, 'stream')
        .mockImplementationOnce(async (key) => {
          if (change === 'source')
            await db.customerPayment.update({
              where: { id: payment.id },
              data: { paymentMethod: 'CASH' },
            });
          else if (change === 'file')
            await app
              .get(FilesService)
              .update(actor, file.id, { category: 'CHANGED' });
          else
            await db.userRole.updateMany({
              where: { id: { in: assignments.map((a) => a.id) } },
              data: { status: 'archived' },
            });
          return stream(key);
        });
      try {
        await post('sender', `/rooms/${room.id}/releases`, input).expect(
          change === 'permission' ? 404 : 409,
        );
      } finally {
        reading.mockRestore();
        if (change === 'permission')
          await db.userRole.updateMany({
            where: { id: { in: assignments.map((a) => a.id) } },
            data: { status: 'active' },
          });
      }
      expect(
        await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
      ).toBe(0);
    },
  );
  it('rejects stale payment file source and changed stored bytes after review', async () => {
    const { room, payment, input, file } = await customerFileFixture(true);
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
      200,
    );
    const review = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { paymentMethod: 'CASH' },
    });
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { paymentMethod: payment.paymentMethod },
    });
    const stored = await db.fileAsset.findUniqueOrThrow({
      where: { id: file.id },
    });
    await writeFile(
      join(process.env.FILE_STORAGE_PATH!, stored.storageKey),
      'Bytes khác',
    );
    await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
      409,
    );
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    expect(
      (
        await db.chatDocumentRelease.findUniqueOrThrow({
          where: { id: prepared.id },
        })
      ).publishedAt,
    ).toBeNull();
  });
  it('publishes a registered contract review file with exact bytes and typed provenance', async () => {
    const { room, contract, file, bytes, input, actor, otherProjectId } =
      await customerFileFixture();
    const attachments = await db.entityAttachment.findMany({
      where: { fileAssetId: file.id },
    });
    expect(
      (await get('sender', `/rooms/${room.id}/release-sources`).expect(200))
        .body,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'CONTRACT_FILE',
          sourceId: contract.id,
          sourceFingerprint: input.sourceFingerprint,
        }),
      ]),
    );
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      version: file.version + 1,
    }).expect(409);
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    expect(
      (await post('sender', `/rooms/${room.id}/releases`, input).expect(201))
        .body.id,
    ).toBe(prepared.id);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      version: file.version + 1,
    }).expect(409);
    const release = await db.chatDocumentRelease.findUniqueOrThrow({
      where: { id: prepared.id },
      include: { contractDocument: true },
    });
    expect(release.contractDocument).toMatchObject({
      contractId: contract.id,
      fileAssetId: file.id,
      format: 'CUSTOMER_REVIEW_FILE',
      version: prepared.version,
    });
    expect(prepared.fileVersion).toBe(file.version);
    expect(
      (
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    const review = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    await post('sender', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(403);
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    expect(
      (
        await getBinary('guest', `/releases/${prepared.id}/download`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    await call()
      .get(`/api/v1/files/${file.id}/download`)
      .set('Cookie', users.guest!.cookie)
      .expect(403);
    await expect(app.get(FilesService).remove(actor, file.id)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      app.get(FilesService).update(actor, file.id, { category: 'OTHER' }),
    ).rejects.toThrow(ConflictException);
    // Exercise the shared restore guard with a synthetic legacy-deleted publication.
    await db.fileAsset.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
    try {
      await expect(
        app.get(FilesService).restore(actor, file.id),
      ).rejects.toThrow(ConflictException);
    } finally {
      await db.fileAsset.update({
        where: { id: file.id },
        data: { deletedAt: null },
      });
    }
    expect(
      await db.entityAttachment.findMany({ where: { fileAssetId: file.id } }),
    ).toEqual(attachments);
    expect(
      await db.fileAsset.findUniqueOrThrow({ where: { id: file.id } }),
    ).toMatchObject({
      confidentiality: 'INTERNAL',
      version: file.version,
      deletedAt: null,
    });
    expect(
      await db.contractDocument.count({ where: { contractId: contract.id } }),
    ).toBe(1);
    expect(
      await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
    ).toBe(1);
    const unchanged = await db.contract.findUniqueOrThrow({
      where: { id: contract.id },
    });
    expect(unchanged.status).toBe('DRAFT');
    expect(unchanged.signedDate).toBeNull();
    expect(unchanged.currentValue.toString()).toBe('120000');
    expect(
      await db.customerPayment.count({ where: { projectId: otherProjectId } }),
    ).toBe(1);
  });
  it('rejects contract review files with another Project, customer or internal source context', async () => {
    const { room, contract, input, file, actor, otherProjectId } =
      await customerFileFixture();
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      sourceId: randomUUID(),
    }).expect(409);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      appendixId: randomUUID(),
    }).expect(409);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      sourceFingerprint: '0'.repeat(64),
    }).expect(409);
    const wrongCustomer = await db.customer.create({
      data: {
        organizationId: orgId,
        type: 'INDIVIDUAL',
        displayName: 'Sai khách',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    await db.contract.update({
      where: { id: contract.id },
      data: { customerId: wrongCustomer.id },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    await db.contract.update({
      where: { id: contract.id },
      data: { customerId: contract.customerId, updatedAt: contract.updatedAt },
    });
    const foreign = await db.entityAttachment.create({
      data: {
        fileAssetId: file.id,
        entityType: 'Project',
        entityId: projectId,
        projectId,
        createdBy: actor.userId,
      },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(404);
    expect(
      (
        await get(
          'sender',
          `/rooms/${room.id}/contract-files?sourceId=${contract.id}`,
        ).expect(200)
      ).body.files,
    ).toEqual([]);
    await db.entityAttachment.delete({ where: { id: foreign.id } });
    const attachment = await db.entityAttachment.findFirstOrThrow({
      where: { fileAssetId: file.id, projectId: otherProjectId },
    });
    await db.entityAttachment.update({
      where: { id: attachment.id },
      data: { entityType: 'ChatRoom', entityId: room.id },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(404);
    await db.entityAttachment.update({
      where: { id: attachment.id },
      data: {
        entityType: 'Project',
        entityId: otherProjectId,
        customerId: wrongCustomer.id,
      },
    });
    await post('sender', `/rooms/${room.id}/releases`, input).expect(404);
    expect(
      await db.contractDocument.count({ where: { contractId: contract.id } }),
    ).toBe(0);
  });
  it('rejects unsupported contract review MIME metadata before reading or registering bytes', async () => {
    const { room, contract, file, input } = await customerFileFixture();
    await db.fileAsset.update({
      where: { id: file.id },
      data: { mimeType: 'text/html', originalFilename: 'hop-dong.html' },
    });
    expect(
      (
        await get(
          'sender',
          `/rooms/${room.id}/contract-files?sourceId=${contract.id}`,
        ).expect(200)
      ).body.files,
    ).toEqual([]);
    await post('sender', `/rooms/${room.id}/releases`, input).expect(404);
    expect(
      await db.contractDocument.count({ where: { contractId: contract.id } }),
    ).toBe(0);
  });
  it.each(['source', 'file', 'permission'] as const)(
    'rechecks contract review %s after storage reading before registration',
    async (change) => {
      const { room, contract, input, file, actor, contracts, otherProjectId } =
        await customerFileFixture();
      const assignments = await db.userRole.findMany({
        where: {
          organizationId: orgId,
          userId: actor.userId,
          status: 'active',
        },
        select: { id: true },
      });
      const storage = app.get(FileStorage),
        stream = storage.stream.bind(storage);
      const changed = vi
        .spyOn(storage, 'stream')
        .mockImplementationOnce(async (key) => {
          if (change === 'source')
            await contracts.transition(actor, otherProjectId, contract.id, {
              status: 'INTERNAL_REVIEW',
            });
          else if (change === 'file')
            await app
              .get(FilesService)
              .update(actor, file.id, { category: 'CHANGED' });
          else
            await db.userRole.updateMany({
              where: { id: { in: assignments.map((a) => a.id) } },
              data: { status: 'archived' },
            });
          return stream(key);
        });
      try {
        await post('sender', `/rooms/${room.id}/releases`, input).expect(
          change === 'permission' ? 404 : 409,
        );
      } finally {
        changed.mockRestore();
        if (change === 'permission')
          await db.userRole.updateMany({
            where: { id: { in: assignments.map((a) => a.id) } },
            data: { status: 'active' },
          });
      }
      expect(
        await db.contractDocument.count({ where: { contractId: contract.id } }),
      ).toBe(0);
      expect(
        await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
      ).toBe(0);
    },
  );
  it('requires fresh contract review after source change and preserves an already published file', async () => {
    const {
      room,
      contract,
      input,
      file,
      actor,
      contracts,
      otherProjectId,
      bytes,
    } = await customerFileFixture();
    const published = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    await getBinary('publisher', `/releases/${published.id}/preview`).expect(
      200,
    );
    const review = (
      await get('publisher', `/releases/${published.id}/review`).expect(200)
    ).body;
    await post('publisher', `/releases/${published.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    const pending = (
      await post('sender', `/rooms/${room.id}/releases`, {
        ...input,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await getBinary('publisher', `/releases/${pending.id}/preview`).expect(200);
    await contracts.transition(actor, otherProjectId, contract.id, {
      status: 'INTERNAL_REVIEW',
    });
    await get('publisher', `/releases/${pending.id}/preview`).expect(409);
    await post('publisher', `/releases/${pending.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    expect(
      (
        await getBinary('guest', `/releases/${published.id}/download`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    expect(
      (await db.fileAsset.findUniqueOrThrow({ where: { id: file.id } }))
        .version,
    ).toBe(file.version);
  });
  it('pins contract review bytes and version across retries and later file mutation', async () => {
    const { room, contract, input, file, actor, bytes, otherProjectId } =
      await customerFileFixture();
    const stored = await db.fileAsset.findUniqueOrThrow({
      where: { id: file.id },
    });
    const binaryPath = join(process.env.FILE_STORAGE_PATH!, stored.storageKey);
    try {
      await writeFile(binaryPath, 'Khác bản đã tải');
      await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
    } finally {
      await writeFile(binaryPath, bytes);
    }
    expect(
      await db.contractDocument.count({ where: { contractId: contract.id } }),
    ).toBe(0);
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    const second = await app.get(FilesService).upload(
      actor,
      {
        entityType: 'Project',
        entityId: otherProjectId,
        category: 'PROJECT_DOCUMENT',
      },
      {
        originalname: 'khac.txt',
        mimetype: 'text/plain',
        size: bytes.length,
        buffer: bytes,
      } as Express.Multer.File,
    );
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      fileId: second.id,
    }).expect(409);
    await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
      200,
    );
    const review = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    try {
      await writeFile(binaryPath, 'Thay sau khi kiểm tra');
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(409);
    } finally {
      await writeFile(binaryPath, bytes);
    }
    await app.get(FilesService).update(actor, file.id, { category: 'CHANGED' });
    await get('publisher', `/releases/${prepared.id}/preview`).expect(409);
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(409);
    expect(
      await db.contractDocument.count({ where: { contractId: contract.id } }),
    ).toBe(1);
    expect(
      (
        await db.chatDocumentRelease.findUniqueOrThrow({
          where: { id: prepared.id },
        })
      ).publishedAt,
    ).toBeNull();
  });
  it.each([
    [
      'does not borrow contract review registration authority from an out-of-scope binding',
      false,
    ],
    [
      'does not borrow payment file registration authority from an out-of-scope binding',
      true,
    ],
  ] as const)('%s', async (_name, paymentFile) => {
    const { room, input, role, actor } = await customerFileFixture(paymentFile);
    const otherAssignments = await db.userRole.findMany({
      where: {
        userId: actor.userId,
        organizationId: orgId,
        status: 'active',
        roleId: { not: role.id },
      },
      select: { id: true },
    });
    const updatePermission = await db.permission.findUniqueOrThrow({
      where: {
        code: paymentFile ? 'receivable.payment.record' : 'contract.update',
      },
    });
    const updateRole = await db.role.create({
      data: {
        organizationId: orgId,
        code: `contract-update-${randomUUID()}`,
        name: 'Quyền ngoài hồ sơ',
        permissions: { create: { permissionId: updatePermission.id } },
      },
    });
    const updateAssignment = await db.userRole.create({
      data: {
        organizationId: orgId,
        userId: actor.userId,
        roleId: updateRole.id,
        scopeType: 'SELF',
      },
    });
    await db.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: updatePermission.id,
        },
      },
    });
    await db.userRole.updateMany({
      where: { id: { in: otherAssignments.map((a) => a.id) } },
      data: { status: 'archived' },
    });
    try {
      await get(
        'sender',
        `/rooms/${room.id}/${paymentFile ? 'payment' : 'contract'}-files?sourceId=${input.sourceId}`,
      ).expect(404);
      const sources = (
        await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
      ).body;
      expect(sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceType: paymentFile ? 'CUSTOMER_PAYMENT_RECORD' : 'CONTRACT',
            sourceId: input.sourceId,
          }),
        ]),
      );
      expect(sources).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          }),
        ]),
      );
      await post('sender', `/rooms/${room.id}/releases`, input).expect(404);
      await db.userRole.update({
        where: { id: updateAssignment.id },
        data: { scopeType: 'ORGANIZATION' },
      });
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201);
    } finally {
      await db.userRole.updateMany({
        where: { id: { in: otherAssignments.map((a) => a.id) } },
        data: { status: 'active' },
      });
    }
  });
  it('publishes a recorded signed contract copy with distinct purpose and no business side effects', async () => {
    const { room, contract, contracts, actor, input, otherProjectId, bytes } =
      await customerFileFixture();
    for (const status of ['INTERNAL_REVIEW', 'SIGNED'])
      await contracts.transition(actor, otherProjectId, contract.id, {
        status,
        ...(status === 'SIGNED' ? { signedDate: new Date('2026-01-02Z') } : {}),
      });
    const path = `/rooms/${room.id}/contract-files?sourceId=${contract.id}`;
    const signed = (
      await get('sender', `${path}&purpose=RECORDED_SIGNED_COPY`).expect(200)
    ).body;
    const review = (await get('sender', path).expect(200)).body;
    expect(signed.sourceFingerprint).not.toBe(review.sourceFingerprint);
    const sources = (
      await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
    ).body;
    for (const purpose of ['CUSTOMER_REVIEW_FILE', 'RECORDED_SIGNED_COPY'])
      expect(sources).toContainEqual(
        expect.objectContaining({
          sourceType: 'CONTRACT_FILE',
          sourceId: contract.id,
          purpose,
        }),
      );
    const before = {
      contract: await db.contract.findUniqueOrThrow({
        where: { id: contract.id },
      }),
      payments: await db.customerPayment.count({
        where: { projectId: otherProjectId },
      }),
      history: await db.contractStatusHistory.count({
        where: { contractId: contract.id },
      }),
    };
    const payload = {
      ...input,
      purpose: 'RECORDED_SIGNED_COPY',
      sourceFingerprint: signed.sourceFingerprint,
    };
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, payload).expect(201)
    ).body;
    expect(
      (await post('sender', `/rooms/${room.id}/releases`, payload).expect(201))
        .body.id,
    ).toBe(prepared.id);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...payload,
      purpose: 'CUSTOMER_REVIEW_FILE',
      sourceFingerprint: review.sourceFingerprint,
    }).expect(409);
    const other = (
      await post('sender', `/rooms/${room.id}/releases`, {
        ...payload,
        purpose: 'CUSTOMER_REVIEW_FILE',
        sourceFingerprint: review.sourceFingerprint,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    expect(other.id).not.toBe(prepared.id);
    const stored = await db.chatDocumentRelease.findUniqueOrThrow({
      where: { id: prepared.id },
      include: { contractDocument: true },
    });
    expect(stored.sourceSnapshot).toMatchObject({
      purpose: 'RECORDED_SIGNED_COPY',
    });
    expect(stored.contractDocument?.sourceSnapshot).toEqual(
      stored.sourceSnapshot,
    );
    await post('sender', `/releases/${prepared.id}/publish`, {
      confirmed: true,
    }).expect(403);
    expect(
      (
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    const checked = (
      await get('publisher', `/releases/${prepared.id}/review`).expect(200)
    ).body;
    await post('publisher', `/releases/${prepared.id}/publish`, {
      confirmed: true,
      recipientHash: checked.recipientHash,
    }).expect(201);
    expect(
      (
        await getBinary('guest', `/releases/${prepared.id}/download`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    expect({
      contract: await db.contract.findUniqueOrThrow({
        where: { id: contract.id },
      }),
      payments: await db.customerPayment.count({
        where: { projectId: otherProjectId },
      }),
      history: await db.contractStatusHistory.count({
        where: { contractId: contract.id },
      }),
    }).toEqual(before);
    expect(
      await db.contractDocument.count({ where: { contractId: contract.id } }),
    ).toBe(2);
  });
  it('requires recorded signed contract states and dates and rejects foreign purpose inputs', async () => {
    const { room, contract, contracts, actor, otherProjectId, input, payment } =
      await customerFileFixture();
    const path = `/rooms/${room.id}/contract-files?sourceId=${contract.id}&purpose=RECORDED_SIGNED_COPY`;
    await get('sender', path).expect(409);
    for (const status of [
      'INTERNAL_REVIEW',
      'SIGNED',
      'ACTIVE',
      'SUSPENDED',
      'ACTIVE',
      'COMPLETED',
    ]) {
      await contracts.transition(actor, otherProjectId, contract.id, {
        status,
      });
      await get('sender', path).expect(
        status === 'INTERNAL_REVIEW' ? 409 : 200,
      );
    }
    for (const data of [
      { signedDate: null },
      { status: 'CANCELLED', signedDate: new Date() },
      { status: 'TERMINATED', signedDate: new Date() },
    ]) {
      await db.contract.update({ where: { id: contract.id }, data });
      await get('sender', path).expect(409);
    }
    await get(
      'sender',
      `/rooms/${room.id}/contract-files?sourceId=${contract.id}&purpose=VERIFIED_SIGNATURE`,
    ).expect(400);
    await get(
      'sender',
      `/rooms/${room.id}/payment-files?sourceId=${payment.id}&purpose=RECORDED_SIGNED_COPY`,
    ).expect(400);
    await post('sender', `/rooms/${room.id}/releases`, {
      ...input,
      sourceType: 'CUSTOMER_PAYMENT_FILE',
      sourceId: payment.id,
      purpose: 'RECORDED_SIGNED_COPY',
    }).expect(400);
  });
  it('publishes recorded signed appendices with appendix-only authority and pins their actual signing date', async () => {
    const {
      room,
      contract,
      contracts,
      actor,
      input,
      otherProjectId,
      role,
      bytes,
    } = await customerFileFixture(false, [
      'appendix.create',
      'appendix.approve',
    ]);
    for (const status of ['INTERNAL_REVIEW', 'SIGNED'])
      await contracts.transition(actor, otherProjectId, contract.id, {
        status,
      });
    const appendix = await contracts.createAppendix(
      actor,
      otherProjectId,
      contract.id,
      {
        appendixNumber: randomUUID(),
        type: 'SCHEDULE_CHANGE',
        title: 'Phụ lục ghi nhận ký',
        valueChange: '0',
        currency: 'VND',
        idempotencyKey: randomUUID(),
      },
    );
    const path = `/rooms/${room.id}/contract-files?sourceId=${contract.id}&appendixId=${appendix.id}&purpose=RECORDED_SIGNED_COPY`;
    for (const status of ['INTERNAL_REVIEW', 'APPROVED'])
      await contracts.transitionAppendix(
        actor,
        otherProjectId,
        contract.id,
        appendix.id,
        { status },
      );
    await get('sender', path).expect(409);
    await contracts.transitionAppendix(
      actor,
      otherProjectId,
      contract.id,
      appendix.id,
      { status: 'SIGNED', signedDate: new Date('2026-01-03Z') },
    );
    const original = await db.contractAppendix.findUniqueOrThrow({
      where: { id: appendix.id },
    });
    await db.contractAppendix.update({
      where: { id: appendix.id },
      data: { signedDate: null },
    });
    await get('sender', path).expect(409);
    await db.contractAppendix.update({
      where: { id: appendix.id },
      data: { signedDate: original.signedDate, updatedAt: original.updatedAt },
    });
    const assignments = await db.userRole.findMany({
      where: {
        userId: { in: [actor.userId, users.publisher!.id] },
        roleId: { not: role.id },
        status: 'active',
      },
      select: { id: true },
    });
    await db.userRole.updateMany({
      where: { id: { in: assignments.map((a) => a.id) } },
      data: { status: 'archived' },
    });
    await db.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { code: { in: ['contract.update', 'appendix.approve'] } },
      },
    });
    const signingRole = await db.role.create({
      data: {
        organizationId: orgId,
        code: randomUUID(),
        name: 'Ghi nhận phụ lục',
        permissions: {
          create: { permission: { connect: { code: 'appendix.approve' } } },
        },
      },
    });
    const signingAssignment = await db.userRole.create({
      data: {
        organizationId: orgId,
        userId: actor.userId,
        roleId: signingRole.id,
        scopeType: 'SELF',
      },
    });
    try {
      await get('sender', path).expect(404);
      await db.userRole.update({
        where: { id: signingAssignment.id },
        data: { scopeType: 'ORGANIZATION' },
      });
      const candidates = (await get('sender', path).expect(200)).body;
      const sources = (
        await get('sender', `/rooms/${room.id}/release-sources`).expect(200)
      ).body;
      expect(sources).toContainEqual(
        expect.objectContaining({
          sourceType: 'CONTRACT_FILE',
          appendixId: appendix.id,
          purpose: 'RECORDED_SIGNED_COPY',
        }),
      );
      expect(sources).not.toContainEqual(
        expect.objectContaining({
          sourceType: 'CONTRACT_FILE',
          appendixId: appendix.id,
          purpose: 'CUSTOMER_REVIEW_FILE',
        }),
      );
      const prepared = (
        await post('sender', `/rooms/${room.id}/releases`, {
          ...input,
          appendixId: appendix.id,
          purpose: 'RECORDED_SIGNED_COPY',
          sourceFingerprint: candidates.sourceFingerprint,
        }).expect(201)
      ).body;
      expect(
        (
          await getBinary(
            'publisher',
            `/releases/${prepared.id}/preview`,
          ).expect(200)
        ).body,
      ).toEqual(bytes);
      const review = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      await db.contractAppendix.update({
        where: { id: appendix.id },
        data: {
          signedDate: new Date('2026-01-04Z'),
          updatedAt: original.updatedAt,
        },
      });
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(409);
      await db.contractAppendix.update({
        where: { id: appendix.id },
        data: {
          signedDate: original.signedDate,
          updatedAt: original.updatedAt,
        },
      });
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(201);
      expect(
        (
          await getBinary('guest', `/releases/${prepared.id}/download`).expect(
            200,
          )
        ).body,
      ).toEqual(bytes);
      expect(
        await db.contractAppendix.findUniqueOrThrow({
          where: { id: appendix.id },
        }),
      ).toEqual(original);
    } finally {
      await db.userRole.updateMany({
        where: { id: { in: assignments.map((a) => a.id) } },
        data: { status: 'active' },
      });
    }
  });
  it.each(['source', 'permission'] as const)(
    'rechecks recorded signed copy %s after storage I/O',
    async (change) => {
      const { room, contract, contracts, actor, input, otherProjectId } =
        await customerFileFixture();
      for (const status of ['INTERNAL_REVIEW', 'SIGNED'])
        await contracts.transition(actor, otherProjectId, contract.id, {
          status,
        });
      const candidates = (
        await get(
          'sender',
          `/rooms/${room.id}/contract-files?sourceId=${contract.id}&purpose=RECORDED_SIGNED_COPY`,
        ).expect(200)
      ).body;
      const assignments = await db.userRole.findMany({
        where: { userId: actor.userId, status: 'active' },
        select: { id: true },
      });
      const storage = app.get(FileStorage),
        stream = storage.stream.bind(storage);
      const reading = vi
        .spyOn(storage, 'stream')
        .mockImplementationOnce(async (key) => {
          if (change === 'source')
            await contracts.transition(actor, otherProjectId, contract.id, {
              status: 'ACTIVE',
            });
          else
            await db.userRole.updateMany({
              where: { id: { in: assignments.map((a) => a.id) } },
              data: { status: 'archived' },
            });
          return stream(key);
        });
      try {
        await post('sender', `/rooms/${room.id}/releases`, {
          ...input,
          purpose: 'RECORDED_SIGNED_COPY',
          sourceFingerprint: candidates.sourceFingerprint,
        }).expect(change === 'permission' ? 404 : 409);
      } finally {
        reading.mockRestore();
        if (change === 'permission')
          await db.userRole.updateMany({
            where: { id: { in: assignments.map((a) => a.id) } },
            data: { status: 'active' },
          });
      }
      expect(
        await db.contractDocument.count({ where: { contractId: contract.id } }),
      ).toBe(0);
      expect(
        await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
      ).toBe(0);
    },
  );
  it('registers a contract appendix review file against its exact appendix source', async () => {
    const { room, contract, contracts, actor, input, otherProjectId, bytes } =
      await customerFileFixture();
    await contracts.transition(actor, otherProjectId, contract.id, {
      status: 'INTERNAL_REVIEW',
    });
    await contracts.transition(actor, otherProjectId, contract.id, {
      status: 'SIGNED',
    });
    const appendix = await contracts.createAppendix(
      actor,
      otherProjectId,
      contract.id,
      {
        appendixNumber: 'PL-1',
        type: 'SCHEDULE_CHANGE',
        title: 'Lịch đề xuất',
        valueChange: '0',
        currency: 'VND',
        idempotencyKey: randomUUID(),
      },
    );
    const candidates = (
      await get(
        'sender',
        `/rooms/${room.id}/contract-files?sourceId=${contract.id}&appendixId=${appendix.id}`,
      ).expect(200)
    ).body;
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, {
        ...input,
        appendixId: appendix.id,
        sourceFingerprint: candidates.sourceFingerprint,
      }).expect(201)
    ).body;
    expect(
      (
        await db.chatDocumentRelease.findUniqueOrThrow({
          where: { id: prepared.id },
          include: { contractDocument: true },
        })
      ).contractDocument,
    ).toMatchObject({
      contractId: contract.id,
      appendixId: appendix.id,
      format: 'CUSTOMER_REVIEW_FILE',
    });
    expect(
      (
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          200,
        )
      ).body,
    ).toEqual(bytes);
    expect(
      (
        await db.contractAppendix.findUniqueOrThrow({
          where: { id: appendix.id },
        })
      ).status,
    ).toBe('DRAFT');
  });
  it.each(['quality', 'packing', 'milestone'] as const)(
    'rejects contract review file ownership from a real production %s writer',
    async (kind) => {
      const { room, contract, file, input, actor, otherProjectId } =
        await customerFileFixture();
      const order = await productionOrderFixture(actor, otherProjectId);
      const production = app.get(ProductionService);
      if (kind === 'quality')
        await production.quality(actor, order.id, {
          reportNumber: randomUUID(),
          inspectionDate: new Date(),
          result: 'PASSED',
          summary: 'Nội bộ sản xuất',
          fileId: file.id,
        });
      else if (kind === 'packing')
        await production.packing(actor, order.id, {
          packingNumber: randomUUID(),
          packageCount: 1,
          packedAt: new Date(),
          fileId: file.id,
        });
      else
        await production.milestone(actor, order.id, {
          name: 'Mốc nội bộ',
          sequence: 1,
          status: 'PLANNED',
          evidenceFileId: file.id,
        });
      expect(
        (
          await get(
            'sender',
            `/rooms/${room.id}/contract-files?sourceId=${contract.id}`,
          ).expect(200)
        ).body.files,
      ).toEqual([]);
      await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
      expect(
        await db.contractDocument.count({ where: { contractId: contract.id } }),
      ).toBe(0);
    },
  );
  it.each(['acceptance', 'confirmation'] as const)(
    'rejects contract review file ownership from a real after-sales %s writer',
    async (kind) => {
      const { room, contract, file, input, actor, otherProjectId } =
        await customerFileFixture();
      const prepared = (
        await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
      ).body;
      await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
        200,
      );
      const review = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      const afterSales = app.get(AfterSalesService);
      if (kind === 'acceptance') {
        const inspection = await afterSales.createInspection(actor, {
          projectId: otherProjectId,
          inspectionNumber: randomUUID(),
          type: 'CUSTOMER',
          items: [{ scope: 'Nghiệm thu fixture' }],
        });
        await afterSales.decideInspectionItem(actor, inspection.items[0]!.id, {
          result: 'PASSED',
        });
        await afterSales.createAcceptance(actor, inspection.id, {
          signedDocumentId: file.id,
          participants: [
            {
              name: 'Khách fixture',
              role: 'CUSTOMER',
              signingStatus: 'PENDING',
            },
          ],
        });
      } else {
        const ticket = await db.serviceTicket.create({
          data: {
            organizationId: actor.organizationId,
            projectId: otherProjectId,
            customerId: contract.customerId,
            ticketNumber: randomUUID(),
            issueCategory: 'OTHER',
            priority: 'NORMAL',
            description: 'Hậu mãi fixture',
            status: 'RESOLVED',
            createdBy: actor.userId,
          },
        });
        await afterSales.confirmTicket(actor, ticket.id, {
          customerName: 'Khách fixture',
          confirmed: true,
          documentId: file.id,
        });
      }
      expect(
        (
          await get(
            'sender',
            `/rooms/${room.id}/contract-files?sourceId=${contract.id}`,
          ).expect(200)
        ).body.files,
      ).toEqual([]);
      await post('sender', `/rooms/${room.id}/releases`, {
        ...input,
        clientKey: randomUUID(),
      }).expect(409);
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(409);
      expect(
        (
          await db.chatDocumentRelease.findUniqueOrThrow({
            where: { id: prepared.id },
          })
        ).publishedAt,
      ).toBeNull();
      expect(
        await db.contractDocument.count({ where: { contractId: contract.id } }),
      ).toBe(1);
    },
  );
  it.each([
    [
      'publishes a contract review file with source read permission and no contract update authority',
      false,
    ],
    [
      'publishes a payment file with source read permission and no payment record authority',
      true,
    ],
  ] as const)('%s', async (_name, paymentFile) => {
    const { room, input } = await customerFileFixture(paymentFile);
    const prepared = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    const assignments = await db.userRole.findMany({
      where: {
        organizationId: orgId,
        userId: users.publisher!.id,
        status: 'active',
      },
      select: { id: true },
    });
    const reader = await db.role.create({
      data: {
        organizationId: orgId,
        code: `contract-reader-${randomUUID()}`,
        name: 'Chỉ xem nguồn',
        permissions: {
          create: [
            paymentFile ? 'receivable.read' : 'contract.read',
            'file.read',
            'file.download',
          ].map((code) => ({ permission: { connect: { code } } })),
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: orgId,
        userId: users.publisher!.id,
        roleId: reader.id,
        scopeType: 'ORGANIZATION',
      },
    });
    await db.userRole.updateMany({
      where: { id: { in: assignments.map((a) => a.id) } },
      data: { status: 'archived' },
    });
    try {
      await post('publisher', `/rooms/${room.id}/releases`, {
        ...input,
        clientKey: randomUUID(),
      }).expect(404);
      await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
        200,
      );
      const review = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(201);
    } finally {
      await db.userRole.updateMany({
        where: { id: { in: assignments.map((a) => a.id) } },
        data: { status: 'active' },
      });
    }
  });
  it.each(
    (['registration', 'preview', 'publication'] as const).flatMap((stage) =>
      [false, true].map(
        (paymentFile) =>
          [
            `rejects ${paymentFile ? 'payment file' : 'contract review'} ${stage} when an earlier scalar source writer is still in flight`,
            stage,
            paymentFile,
          ] as const,
      ),
    ),
  )('%s', async (_name, stage, paymentFile) => {
    const { room, contract, file, input, actor, otherProjectId } =
      await customerFileFixture(paymentFile);
    const order = await productionOrderFixture(actor, otherProjectId);
    const prepared =
      stage === 'registration'
        ? null
        : (
            await post('sender', `/rooms/${room.id}/releases`, input).expect(
              201,
            )
          ).body;
    if (stage === 'publication')
      await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
        200,
      );
    const review =
      stage === 'publication'
        ? (
            await get('publisher', `/releases/${prepared.id}/review`).expect(
              200,
            )
          ).body
        : null;
    await db.$transaction(async (tx) => {
      await tx.qualityReport.create({
        data: {
          productionOrderId: order.id,
          reportNumber: randomUUID(),
          inspectionDate: new Date(),
          result: 'PASSED',
          summary: 'Chưa commit',
          fileId: file.id,
          createdBy: actor.userId,
        },
      });
      if (stage === 'registration')
        await post('sender', `/rooms/${room.id}/releases`, input).expect(409);
      else if (stage === 'preview')
        await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
          409,
        );
      else
        await post('publisher', `/releases/${prepared.id}/publish`, {
          confirmed: true,
          recipientHash: review.recipientHash,
        }).expect(409);
    });
    if (stage === 'registration') {
      expect(
        await db.contractDocument.count({ where: { contractId: contract.id } }),
      ).toBe(0);
      expect(
        await db.chatDocumentRelease.count({ where: { roomId: room.id } }),
      ).toBe(0);
    } else {
      const release = await db.chatDocumentRelease.findUniqueOrThrow({
        where: { id: prepared.id },
      });
      expect(release.publishedAt).toBeNull();
      if (stage === 'preview') expect(release.reviewedAt).toBeNull();
    }
  });
  it.each([
    [
      'serializes a later scalar source writer behind final contract review publication without locking tables during storage reads',
      false,
    ],
    [
      'serializes a later scalar source writer behind final payment file publication without locking tables during storage reads',
      true,
    ],
  ] as const)('%s', async (_name, paymentFile) => {
    const { room, file, bytes, input, actor, otherProjectId } =
      await customerFileFixture(paymentFile);
    const order = await productionOrderFixture(actor, otherProjectId);
    const storage = app.get(FileStorage),
      stream = storage.stream.bind(storage);
    const storageRead = vi
      .spyOn(storage, 'stream')
      .mockImplementation(async (key) => {
        const locks = await db.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='QualityReport' AND l.mode='ShareLock' AND l.granted`;
        expect(locks[0]!.count).toBe(0n);
        return stream(key);
      });
    const service = app.get(ProjectChatService) as unknown as {
      event(
        tx: Prisma.TransactionClient,
        actor: CurrentActor,
        projectId: string,
        entityId: string,
        action: string,
        details?: Prisma.InputJsonObject,
      ): Promise<unknown>;
    };
    const event = service.event.bind(service);
    let writer: Promise<unknown> | undefined;
    let blocked = false;
    const publication = vi
      .spyOn(service, 'event')
      .mockImplementation(
        async (tx, eventActor, projectId, entityId, action, details) => {
          if (action === 'chat.release.publish') {
            const [backend] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            writer = db.qualityReport
              .create({
                data: {
                  productionOrderId: order.id,
                  reportNumber: randomUUID(),
                  inspectionDate: new Date(),
                  result: 'PASSED',
                  summary: 'Ghi sau quyết định',
                  fileId: file.id,
                  createdBy: actor.userId,
                },
              })
              .then((row) => row);
            await expect
              .poll(
                async () => {
                  const rows = await db.$queryRaw<
                    { blocked: boolean }[]
                  >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${backend!.pid}=ANY(pg_blocking_pids(pid)) AND query LIKE '%QualityReport%') AS blocked`;
                  return rows[0]!.blocked;
                },
                { timeout: 1000 },
              )
              .toBe(true);
            blocked = true;
          }
          return event(tx, eventActor, projectId, entityId, action, details);
        },
      );
    try {
      const prepared = (
        await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
      ).body;
      await getBinary('publisher', `/releases/${prepared.id}/preview`).expect(
        200,
      );
      const review = (
        await get('publisher', `/releases/${prepared.id}/review`).expect(200)
      ).body;
      await post('publisher', `/releases/${prepared.id}/publish`, {
        confirmed: true,
        recipientHash: review.recipientHash,
      }).expect(201);
      expect(blocked).toBe(true);
      await writer;
      expect(
        (
          await db.chatDocumentRelease.findUniqueOrThrow({
            where: { id: prepared.id },
          })
        ).publishedAt,
      ).not.toBeNull();
      expect(storageRead).toHaveBeenCalledTimes(3);
      expect(
        (
          await getBinary('guest', `/releases/${prepared.id}/download`).expect(
            200,
          )
        ).body,
      ).toEqual(bytes);
    } finally {
      publication.mockRestore();
      storageRead.mockRestore();
      await writer;
    }
  });
  it('rejects inconsistent customer payment sources and stale publication while retaining published bytes', async () => {
    const {
      actor,
      contract,
      schedules,
      payment,
      room,
      role,
      permissions,
      otherProjectId,
    } = await customerSnapshotFixture('USD');
    const sourceAssignment = await db.userRole.findFirstOrThrow({
      where: { userId: actor.userId, roleId: role.id },
    });
    const sourceActor: CurrentActor = {
      ...actor,
      permissionSources: permissions.map((permission) => ({
        permission,
        assignmentId: sourceAssignment.id,
        administrationTier: role.administrationTier,
        roleId: role.id,
        roleName: role.name,
        scopeType: 'ORGANIZATION',
        departmentId: null,
      })),
    };
    const expectPaymentUnavailable = () =>
      expect(
        customerPublicationSource(db, sourceActor, otherProjectId, {
          sourceType: 'CUSTOMER_PAYMENT_RECORD',
          sourceId: payment.id,
        }),
      ).rejects.toThrow(ConflictException);
    // The existing payment writer accepts mismatched currencies; publication must not.
    await expectPaymentUnavailable();
    expect(
      (await get('sender', `/rooms/${room.id}/release-sources`).expect(200))
        .body,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'CUSTOMER_PAYMENT_RECORD',
          sourceId: payment.id,
        }),
      ]),
    );
    // Restore a consistent fixture for the successful publication checks below.
    await db.customerPayment.update({
      where: { id: payment.id },
      data: { currency: 'VND' },
    });
    const source = await customerPublicationSource(
      db,
      sourceActor,
      otherProjectId,
      {
        sourceType: 'CUSTOMER_PAYMENT_RECORD',
        sourceId: payment.id,
      },
    );
    const input = {
      sourceType: 'CUSTOMER_PAYMENT_RECORD',
      sourceId: payment.id,
      sourceFingerprint: source.fingerprint,
      clientKey: randomUUID(),
    };
    const published = (
      await post('sender', `/rooms/${room.id}/releases`, input).expect(201)
    ).body;
    const bytes = (
      await getBinary('publisher', `/releases/${published.id}/preview`).expect(
        200,
      )
    ).body as Buffer;
    const review = (
      await get('publisher', `/releases/${published.id}/review`).expect(200)
    ).body;
    await post('publisher', `/releases/${published.id}/publish`, {
      confirmed: true,
      recipientHash: review.recipientHash,
    }).expect(201);
    const publishedPayment = { id: published.id, input, bytes };
    const pendingPayment = (
      await post('sender', `/rooms/${room.id}/releases`, {
        ...publishedPayment.input,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await getBinary(
      'publisher',
      `/releases/${pendingPayment.id}/preview`,
    ).expect(200);
    const paymentReview = (
      await get('publisher', `/releases/${pendingPayment.id}/review`).expect(
        200,
      )
    ).body;
    await db.customerPaymentSchedule.update({
      where: { id: schedules[0]!.id },
      data: { currency: 'USD' },
    });
    await expectPaymentUnavailable();
    await get('publisher', `/releases/${pendingPayment.id}/preview`).expect(
      409,
    );
    await post('publisher', `/releases/${pendingPayment.id}/publish`, {
      confirmed: true,
      recipientHash: paymentReview.recipientHash,
    }).expect(409);
    await db.customerPaymentSchedule.update({
      where: { id: schedules[0]!.id },
      data: { currency: 'VND' },
    });
    const wrongCustomer = await db.customer.create({
      data: {
        organizationId: orgId,
        type: 'INDIVIDUAL',
        displayName: 'Khách khác giả lập',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    // Corrupt only this run's fixture to exercise source-integrity rejection.
    for (const data of [
      { currency: 'USD' },
      { customerId: wrongCustomer.id },
      { status: 'CANCELLED' },
    ]) {
      await db.contract.update({ where: { id: contract.id }, data });
      await expectPaymentUnavailable();
      await db.contract.update({
        where: { id: contract.id },
        data: {
          currency: 'VND',
          customerId: contract.customerId,
          status: 'DRAFT',
        },
      });
    }
    const allocations = await db.paymentAllocation.findMany({
      where: { paymentId: payment.id },
    });
    await db.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
    await expectPaymentUnavailable();
    await db.paymentAllocation.createMany({ data: allocations });
    await db.customerPaymentSchedule.update({
      where: { id: schedules[0]!.id },
      data: { milestoneName: 'Mốc đã thay đổi' },
    });
    await post('publisher', `/releases/${pendingPayment.id}/publish`, {
      confirmed: true,
      recipientHash: paymentReview.recipientHash,
    }).expect(409);
    expect(
      (
        await getBinary(
          'guest',
          `/releases/${publishedPayment.id}/download`,
        ).expect(200)
      ).body,
    ).toEqual(publishedPayment.bytes);
    await db.customerPaymentSchedule.update({
      where: { id: schedules[0]!.id },
      data: { milestoneName: schedules[0]!.milestoneName },
    });
  });
});
