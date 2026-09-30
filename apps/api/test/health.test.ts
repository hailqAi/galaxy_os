import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/health.controller';
import { PrismaService } from '../src/prisma.service';
import { observeHttp } from '../src/runtime-http';

describe('system endpoints', () => {
  let app: INestApplication;
  const query = vi.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: query })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(observeHttp);
    await app.init();
  });

  afterEach(async () => {
    query.mockReset();
    await app.close();
  });

  it('reports liveness', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'ok', service: 'api' });
      });
  });

  it('reports readiness when PostgreSQL responds', async () => {
    query.mockResolvedValueOnce([{ '?column?': 1 }]);
    const controller = new HealthController({
      $queryRaw: query,
    } as unknown as PrismaService);
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });
  it('returns fresh diagnostic markers and disables health caching', async () => {
    vi.stubEnv('GALAXY_RELEASE_ID', 'release-fixture');
    const first = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(first.body.releaseId).toBe('release-fixture');
    expect(first.body.instanceId).toBe(second.body.instanceId);
    expect(first.body.requestId).not.toBe(second.body.requestId);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['x-request-id']).toBe(first.body.requestId);
    vi.unstubAllEnvs();
  });

  it('reports unavailability when PostgreSQL fails', async () => {
    query.mockRejectedValueOnce(new Error('offline'));
    const controller = new HealthController({
      $queryRaw: query,
    } as unknown as PrismaService);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
