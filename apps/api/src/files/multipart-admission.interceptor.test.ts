import { ExecutionContext, CallHandler } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ImportsController } from '../imports/imports.controller';
import { CurrentActor } from '../access-control/current-actor';
import { FilesController } from './files.controller';
import { MultipartAdmissionInterceptor } from './multipart-admission.interceptor';

const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: ['file.upload'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

const context = {
  switchToHttp: () => ({ getRequest: () => ({ actor }) }),
} as ExecutionContext;

describe('MultipartAdmissionInterceptor', () => {
  it('rejects a third actor upload before buffering and releases completed slots', () => {
    const gate = new MultipartAdmissionInterceptor();
    const first = new Subject<void>();
    const second = new Subject<void>();
    gate.intercept(context, { handle: () => first } as CallHandler).subscribe();
    gate
      .intercept(context, { handle: () => second } as CallHandler)
      .subscribe();

    expect(() =>
      gate.intercept(context, {
        handle: () => new Subject<void>(),
      } as CallHandler),
    ).toThrow(expect.objectContaining({ status: 429 }));

    first.complete();
    expect(() =>
      gate.intercept(context, {
        handle: () => new Subject<void>(),
      } as CallHandler),
    ).not.toThrow();
  });

  it.each([
    ['generic files', FilesController.prototype.upload],
    ['imports', ImportsController.prototype.create],
  ])('runs before the %s Multer interceptor', (_name, handler) => {
    const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, handler);
    expect(interceptors[0]).toBe(MultipartAdmissionInterceptor);
  });
});
