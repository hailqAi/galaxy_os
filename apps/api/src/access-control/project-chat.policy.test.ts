import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectChatPolicy } from './project-chat.policy';
import { actorsForPermission, type CurrentActor } from './current-actor';

function fixture() {
  const departmentId = randomUUID(),
    childId = randomUUID();
  const actor = {
    userId: randomUUID(),
    organizationId: randomUUID(),
    organizationMembershipId: randomUUID(),
    permissions: ['project.read', 'task.read', 'stale.permission'],
  } as CurrentActor;
  let current = ['project.read', 'task.read'];
  const assignments = ['SYSTEM', 'DEPARTMENT', 'SELF'].map((scopeType) => ({
    id: randomUUID(),
    roleId: randomUUID(),
    scopeType,
    departmentId: scopeType === 'DEPARTMENT' ? departmentId : null,
  }));
  const findMany = vi.fn(
    async (query: {
      include: {
        role: {
          include: {
            permissions: {
              where?: { permission: { code: { in: string[] } } };
            };
          };
        };
      };
    }) =>
      assignments.map((a) => ({
        ...a,
        role: {
          id: a.roleId,
          name: 'Synthetic role',
          administrationTier: 0,
          permissions: current
            .filter((code) => {
              const requested =
                query.include.role.include.permissions.where?.permission.code
                  .in;
              return !requested || requested.includes(code);
            })
            .map((code) => ({ permission: { code } })),
        },
      })),
  );
  const tx = {
    userRole: { findMany },
    managedDepartment: {
      findMany: vi.fn(async () => [{ departmentId, includeChildren: true }]),
    },
    department: {
      findMany: vi.fn(async () => [{ id: childId, parentId: departmentId }]),
    },
  } as unknown as Prisma.TransactionClient;
  const policy = new ProjectChatPolicy(null as never);
  vi.spyOn(policy, 'live').mockResolvedValue({ kind: 'INTERNAL' } as never);
  return {
    actor,
    tx,
    policy,
    findMany,
    assignments,
    departmentId,
    childId,
    revoke: () => {
      current = ['project.read'];
    },
  };
}
describe('fresh Project chat permissions', () => {
  it.each([undefined, ['task.read']])(
    'loads requested permissions without changing assignment scopes (%j)',
    async (requested) => {
      const f = fixture();
      const fresh = await f.policy.freshActor(f.tx, f.actor, requested);
      const expected = requested ?? ['project.read', 'task.read'];
      expect(fresh.permissions).toEqual(f.assignments.flatMap(() => expected));
      expect(fresh.permissionSources).toEqual(
        f.assignments.flatMap((a) =>
          expected.map((permission) => ({
            permission,
            assignmentId: a.id,
            roleId: a.roleId,
            roleName: 'Synthetic role',
            administrationTier: 0,
            scopeType: a.scopeType,
            departmentId: a.departmentId,
            managedDepartmentIds: a.departmentId
              ? [f.departmentId, f.childId]
              : [],
          })),
        ),
      );
      expect(
        actorsForPermission(fresh, 'task.read').map((a) => ({
          scope: a.administrationScope,
          departments: a.managedDepartmentIds,
        })),
      ).toEqual([
        { scope: 'SYSTEM', departments: [] },
        {
          scope: 'MANAGED_DEPARTMENTS',
          departments: [f.departmentId, f.childId],
        },
        { scope: 'SELF', departments: [] },
      ]);
      const permissionQuery =
        f.findMany.mock.calls[0]![0].include.role.include.permissions;
      expect(permissionQuery.where).toEqual(
        requested ? { permission: { code: { in: requested } } } : undefined,
      );
    },
  );
  it('requeries revoked permissions and never retains stale actor grants', async () => {
    const f = fixture();
    expect(
      (await f.policy.freshActor(f.tx, f.actor, ['task.read'])).permissions,
    ).toHaveLength(3);
    f.revoke();
    const fresh = await f.policy.freshActor(f.tx, f.actor, ['task.read']);
    expect(fresh.permissions).toEqual([]);
    expect(fresh.permissionSources).toEqual([]);
    expect(f.findMany).toHaveBeenCalledTimes(2);
  });
});
