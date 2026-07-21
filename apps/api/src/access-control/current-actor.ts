export type CurrentActor = {
  userId: string;
  organizationId: string;
  organizationMembershipId: string;
  sessionId?: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  permissions: string[];
  permissionSources?: {
    permission: string;
    roleId: string;
    roleName: string;
    scopeType: 'SYSTEM' | 'ORGANIZATION' | 'DEPARTMENT' | 'SELF';
    departmentId: string | null;
  }[];
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION';
  managedDepartmentIds: string[];
  administrationTier: number;
};
