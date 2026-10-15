export type CurrentActor = {
  userId: string;
  organizationId: string;
  organizationMembershipId: string;
  sessionId?: string;
  mcpAuthorizationId?: string;
  membershipKind?: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  permissions: string[];
  permissionSources?: {
    permission: string;
    assignmentId?: string;
    administrationTier?: number;
    roleId: string;
    roleName: string;
    scopeType: 'SYSTEM' | 'ORGANIZATION' | 'DEPARTMENT' | 'SELF';
    departmentId: string | null;
    managedDepartmentIds?: string[];
  }[];
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION';
  managedDepartmentIds: string[];
  administrationTier: number;
};

/** Project-target delegation must retain a single assignment's authority. */
export function actorsForPermission(
  actor: CurrentActor,
  permission: string,
): CurrentActor[] {
  if (!actor.permissions.includes(permission)) return [];
  const sources = actor.permissionSources ?? [];
  const seen = new Set<string>();
  return sources.flatMap((source) => {
    if (
      source.permission !== permission ||
      !source.assignmentId ||
      !Number.isInteger(source.administrationTier) ||
      source.administrationTier! < 0 ||
      seen.has(source.assignmentId)
    )
      return [];
    seen.add(source.assignmentId);
    const matching = sources.filter(
      (candidate) => candidate.assignmentId === source.assignmentId,
    );
    const departments =
      source.scopeType === 'DEPARTMENT'
        ? (source.managedDepartmentIds ?? [])
        : [];
    return [
      {
        ...actor,
        permissions: matching.map(({ permission: code }) => code),
        permissionSources: matching,
        administrationScope:
          source.scopeType === 'DEPARTMENT'
            ? departments.length
              ? 'MANAGED_DEPARTMENTS'
              : 'SELF'
            : source.scopeType,
        managedDepartmentIds: departments,
        administrationTier: source.administrationTier!,
      },
    ];
  });
}
