export const navigation: {
  href: string;
  label: string;
  permission?: string;
}[] = [
  { href: '/', label: 'Tổng quan' },
  {
    href: '/settings/organization',
    label: 'Tổ chức',
    permission: 'organization.read',
  },
  {
    href: '/settings/departments',
    label: 'Phòng ban',
    permission: 'department.read',
  },
  { href: '/settings/users', label: 'Người dùng', permission: 'user.read' },
  { href: '/settings/roles', label: 'Vai trò', permission: 'role.read' },
  { href: '/settings/audit-logs', label: 'Nhật ký', permission: 'audit.read' },
  {
    href: '/settings/custom-fields',
    label: 'Trường tùy chỉnh',
    permission: 'custom_fields.read',
  },
  {
    href: '/settings/system',
    label: 'Cấu hình hệ thống',
    permission: 'system.settings.read',
  },
  { href: '/account/profile', label: 'Hồ sơ' },
  { href: '/account/change-password', label: 'Đổi mật khẩu' },
];

export const visibleNavigation = (
  permissions: string[],
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION' = 'SELF',
) =>
  navigation.filter(
    (item) =>
      (!item.permission || permissions.includes(item.permission)) &&
      (item.href !== '/settings/users' || administrationScope !== 'SELF'),
  );

export const routePermissions = navigation.flatMap((item) =>
  item.permission ? ([[item.href, item.permission]] as [string, string][]) : [],
);
