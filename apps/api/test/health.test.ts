import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/health.controller';
import { PrismaService } from '../src/prisma.service';

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
    await app.init();
  });

  afterEach(async () => {
    query.mockReset();
    await app.close();
  });

  it('reports liveness', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200, { status: 'ok', service: 'api' });
  });

  it('reports readiness when PostgreSQL responds', async () => {
    query.mockResolvedValueOnce([{ '?column?': 1 }]);
    const controller = new HealthController({
      $queryRaw: query,
    } as unknown as PrismaService);
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
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
