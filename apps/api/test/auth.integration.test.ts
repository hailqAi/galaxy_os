import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/auth/email.service';

process.env.DATABASE_URL ??=
  'postgresql://galaxy:galaxy_local@localhost:5432/galaxy_os?schema=public';
process.env.PASSWORD_BCRYPT_ROUNDS = '4';

describe.sequential('real authentication and personal account', () => {
  const prisma = new PrismaClient();
  const email = `auth-${Date.now()}@galaxy.local`;
  const oldPassword = 'Temporary password 123';
  const newPassword = 'Permanent passphrase 456';
  let app: INestApplication;
  let userId: string;
  let cookie: string;

  beforeAll(async () => {
    vi.stubEnv('ALLOW_DEV_AUTH', 'false');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AVATAR_STORAGE_PATH', `/tmp/galaxy-auth-test-${Date.now()}`);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'galaxy-centre' },
    });
    const role = await prisma.role.findFirstOrThrow({
      where: { organizationId: organization.id, code: 'sales' },
    });
    const user = await prisma.user.create({
      data: {
        email,
        normalizedEmail: email,
        displayName: 'Auth Test',
        status: 'active',
      },
    });
    userId = user.id;
    const membership = await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId },
    });
    await prisma.userRole.create({
      data: { organizationId: organization.id, userId, roleId: role.id },
    });
    await prisma.passwordCredential.create({
      data: {
        userId,
        passwordHash: await hash(oldPassword, 4),
        mustChangePassword: true,
      },
    });
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    expect(membership.status).toBe('active');
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.passwordCredential.deleteMany({ where: { userId } });
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.departmentMembership.deleteMany({ where: { userId } });
    await prisma.organizationMembership.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it('fails unknown email and invalid password with the same generic response', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `missing-${email}`, password: oldPassword })
      .expect(401);
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong password' })
      .expect(401);
    expect(unknown.body.message).toBe('Invalid email or password');
    expect(invalid.body.message).toBe(unknown.body.message);
    for (let attempt = 0; attempt < 4; attempt++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword })
      .expect(401);
    expect(
      (await prisma.passwordCredential.findUniqueOrThrow({ where: { userId } }))
        .lockedUntil,
    ).not.toBeNull();
    await prisma.passwordCredential.update({
      where: { userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  it('rejects cross-site authentication mutations', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email, password: oldPassword })
      .expect(403);
  });

  it('logs in with an HttpOnly opaque session and forces first password change', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: email.toUpperCase(), password: oldPassword })
      .expect(201);
    expect(login.body).toEqual({ authenticated: true });
    expect(JSON.stringify(login.body)).not.toContain('password');
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('SameSite=Lax');
    expect(setCookie[0]).toContain('Path=/api/v1');
    cookie = setCookie[0]!.split(';')[0]!;
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    expect(me.body.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .get('/api/v1/organization')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('changes password, revokes old credentials, and keeps login identifier immutable', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Cookie', cookie)
      .send({ displayName: 'Changed', email: 'other@example.com' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({
        currentPassword: oldPassword,
        newPassword,
        confirmNewPassword: newPassword,
      })
      .expect(201);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email,
    ).toBe(email);
    expect(
      (await prisma.passwordCredential.findUniqueOrThrow({ where: { userId } }))
        .mustChangePassword,
    ).toBe(false);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(201);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(
      ';',
    )[0]!;
  });

  it('updates own profile and validates avatar content', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('Cookie', cookie)
      .send({ displayName: '  Auth   Person  ' })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .displayName,
    ).toBe('Auth Person');
    await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Cookie', cookie)
      .attach('avatar', Buffer.from('not an image'), 'attack.svg')
      .expect(400);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .set('Cookie', cookie)
      .attach('avatar', png, '../../avatar.png')
      .expect(201);
    expect(uploaded.body.avatarUrl).toMatch(/^\/me\/avatar\/[0-9a-f-]+\.png$/);
    await request(app.getHttpServer())
      .delete('/api/v1/me/avatar')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('rejects expired sessions and marks production cookies Secure', async () => {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { expiresAt: new Date(0) },
    });
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', cookie)
      .expect(401);
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: {
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(Date.now() - 61 * 60_000),
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', cookie)
      .expect(401);
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://galaxy.example';
    process.env.APP_BASE_URL = 'https://galaxy.example';
    process.env.SMTP_HOST = 'smtp.example';
    process.env.EMAIL_FROM = 'no-reply@galaxy.example';
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(201);
    const setCookie = login.headers['set-cookie'] as unknown as string[];
    expect(setCookie[0]).toContain('Secure');
    cookie = setCookie[0]!.split(';')[0]!;
    process.env.NODE_ENV = 'test';
  });

  it('logout revokes the session and a disabled user cannot reuse one', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', cookie)
      .expect(401);
    const fresh = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(201);
    const freshCookie = (
      fresh.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'disabled' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', freshCookie)
      .expect(401);
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'active' },
    });
  });

  it('uses generic forgot-password responses and a hashed single-use reset token', async () => {
    EmailService.captured.length = 0;
    const existing = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: email.toUpperCase() })
      .expect(201);
    const missing = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: `missing-${email}` })
      .expect(201);
    expect(existing.body).toEqual(missing.body);
    await vi.waitFor(() =>
      expect(EmailService.captured.length).toBeGreaterThan(0),
    );
    const resetMail = EmailService.captured.at(-1)!;
    const rawToken = new URL(
      resetMail.text.match(/https?:\/\/\S+/)![0],
    ).searchParams.get('token')!;
    const stored = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId, usedAt: null, revokedAt: null },
    });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(201);
    const oldCookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
    const recovered = 'Recovered passphrase 789';
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawToken,
        newPassword: recovered,
        confirmNewPassword: recovered,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', oldCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawToken,
        newPassword: recovered,
        confirmNewPassword: recovered,
      })
      .expect(400);
    expect(
      EmailService.captured.some(({ subject }) =>
        subject.includes('password changed'),
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: recovered })
      .expect(201);
  });

  it('does not recreate a logged-out actor from the development flag alone', async () => {
    process.env.ALLOW_DEV_AUTH = 'true';
    process.env.DEV_AUTH_USER_EMAIL = email;
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('x-galaxy-dev-auth', email)
      .expect(200);
    process.env.ALLOW_DEV_AUTH = 'false';
  });
});
