export type AccessPreview = {
  scope: string;
  visibleModules: string[];
  visibleDepartmentIds: string[];
  manageableUsers: number;
  effectivePermissions: string[];
  deniedPermissions: string[];
  sourceRoles: {
    roleId: string;
    roleName: string;
    scopeType: string;
    departmentId: string | null;
  }[];
};

const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null;

const sourceRoles = (value: unknown): value is AccessPreview['sourceRoles'] =>
  Array.isArray(value) &&
  value.every(
    (role) =>
      !!role &&
      typeof role === 'object' &&
      typeof (role as AccessPreview['sourceRoles'][number]).roleId ===
        'string' &&
      typeof (role as AccessPreview['sourceRoles'][number]).roleName ===
        'string' &&
      typeof (role as AccessPreview['sourceRoles'][number]).scopeType ===
        'string' &&
      (typeof (role as AccessPreview['sourceRoles'][number]).departmentId ===
        'string' ||
        (role as AccessPreview['sourceRoles'][number]).departmentId === null),
  );

export function normalizeAccessPreview(value: unknown): AccessPreview | null {
  if (!value || typeof value !== 'object') return null;
  const preview = value as Record<string, unknown>;
  if (
    typeof preview.scope !== 'string' ||
    typeof preview.manageableUsers !== 'number' ||
    !Number.isFinite(preview.manageableUsers) ||
    !sourceRoles(preview.sourceRoles)
  )
    return null;
  const visibleModules = strings(preview.visibleModules);
  const visibleDepartmentIds = strings(preview.visibleDepartmentIds);
  const effectivePermissions = strings(preview.effectivePermissions);
  const deniedPermissions = strings(preview.deniedPermissions);
  if (
    !visibleModules ||
    !visibleDepartmentIds ||
    !effectivePermissions ||
    !deniedPermissions
  )
    return null;
  return {
    scope: preview.scope,
    manageableUsers: preview.manageableUsers,
    visibleModules,
    visibleDepartmentIds,
    effectivePermissions,
    deniedPermissions,
    sourceRoles: preview.sourceRoles,
  };
}
