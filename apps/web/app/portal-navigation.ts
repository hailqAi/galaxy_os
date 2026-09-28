export type NavigationItem = {
  key: string;
  label: string;
  href: string;
  icon: string;
  requiredPermission?: string;
  allowedRoles?: string[];
  featureFlag?: string;
  children?: NavigationItem[];
  activeRouteMatcher: string;
  sortOrder: number;
};

export const navigation: NavigationItem[] = [
  {
    key: 'overview',
    label: 'Tổng quan',
    href: '/',
    icon: '⌂',
    activeRouteMatcher: '^/(dashboard)?$',
    sortOrder: 10,
    children: [
      item(
        'executive-dashboard',
        'Dashboard điều hành',
        '/',
        'dashboard.read',
        10,
      ),
      item('my-tasks', 'Việc cần xử lý', '/tasks', 'task.read', 20),
      item('alerts', 'Cảnh báo', '/notifications', 'notification.read', 30),
    ],
  },
  {
    key: 'users',
    label: 'Người dùng',
    href: '/settings/users',
    icon: '♙',
    activeRouteMatcher: '^/settings/(users|departments|roles|audit-logs)',
    sortOrder: 20,
    children: [
      item('accounts', 'Tài khoản', '/settings/users', 'user.read', 10),
      item(
        'departments',
        'Phòng ban',
        '/settings/departments',
        'department.read',
        20,
      ),
      item('roles', 'Vai trò & quyền', '/settings/roles', 'role.read', 30),
      item(
        'access-log',
        'Nhật ký truy cập',
        '/settings/audit-logs',
        'audit.read',
        40,
      ),
    ],
  },
  {
    key: 'projects',
    label: 'Dự án',
    href: '/projects',
    icon: '▣',
    requiredPermission: 'project.read',
    activeRouteMatcher: '^/projects',
    sortOrder: 30,
    children: [
      {
        key: 'all-projects',
        label: 'Tất cả dự án',
        href: '/projects',
        icon: '',
        requiredPermission: 'project.read',
        activeRouteMatcher: '^/projects(?:/)?$',
        sortOrder: 10,
      },
      item(
        'my-projects',
        'Dự án của tôi',
        '/projects/mine',
        'project.read',
        20,
      ),
      item(
        'project-actions',
        'Việc cần xử lý',
        '/projects/actions',
        'project.read',
        30,
      ),
      item(
        'project-alerts',
        'Cảnh báo',
        '/projects/alerts',
        'project.read',
        40,
      ),
    ],
  },
  {
    key: 'warehouse',
    label: 'Kho',
    href: '/warehouses',
    icon: '▤',
    activeRouteMatcher: '^/(warehouses|inventory)',
    sortOrder: 40,
    children: [
      item(
        'warehouse-overview',
        'Tổng quan kho',
        '/warehouses',
        'warehouse.read',
        10,
      ),
      item(
        'warehouse-location',
        'Kho & vị trí',
        '/warehouses',
        'warehouse.read',
        20,
      ),
      item(
        'receipts',
        'Nhập kho',
        '/inventory/receipts',
        'inventory.receipt.read',
        30,
      ),
      item(
        'quality',
        'Kiểm tra chất lượng',
        '/inventory/receipts',
        'inventory.quality.inspect',
        40,
      ),
      item('stock', 'Tồn kho', '/inventory/items', 'inventory.read', 50),
      item(
        'reservations',
        'Giữ hàng dự án',
        '/inventory/reservations',
        'inventory.reservation.read',
        60,
      ),
      item(
        'issues-transfers',
        'Xuất & điều chuyển',
        '/inventory/issues',
        'inventory.issue.read',
        70,
      ),
      item(
        'returns-adjustments',
        'Trả hàng & điều chỉnh',
        '/inventory/returns',
        'inventory.return.create',
        80,
      ),
      item(
        'counts',
        'Kiểm kê',
        '/inventory/counts',
        'inventory.count.read',
        90,
      ),
      item(
        'transactions',
        'Lịch sử giao dịch',
        '/inventory/transactions',
        'inventory.read',
        100,
      ),
    ],
  },
  {
    key: 'master-data',
    label: 'Danh mục',
    href: '/catalog',
    icon: '◇',
    activeRouteMatcher: '^/(catalog|partners)',
    sortOrder: 50,
    children: [
      item('products', 'Sản phẩm', '/catalog', 'catalog.read', 10),
      item('brands', 'Thương hiệu', '/catalog', 'catalog.read', 20),
      item('suppliers', 'Nhà cung cấp', '/partners', 'supplier.read', 30),
    ],
  },
  {
    key: 'system',
    label: 'Hệ thống',
    href: '/settings/organization',
    icon: '⚙',
    activeRouteMatcher: '^/settings/(organization|system|custom-fields)',
    sortOrder: 60,
    children: [
      item(
        'organization',
        'Cấu hình tổ chức',
        '/settings/organization',
        'organization.read',
        10,
      ),
      item(
        'system-log',
        'Nhật ký hệ thống',
        '/settings/audit-logs',
        'audit.read',
        20,
      ),
      item(
        'document-config',
        'Cấu hình tài liệu',
        '/settings/custom-fields',
        'custom_fields.read',
        30,
      ),
      item(
        'display-config',
        'Cấu hình hiển thị',
        '/settings/system',
        'system.settings.read',
        40,
      ),
    ],
  },
];

function item(
  key: string,
  label: string,
  href: string,
  requiredPermission: string,
  sortOrder: number,
): NavigationItem {
  return {
    key,
    label,
    href,
    icon: '',
    requiredPermission,
    activeRouteMatcher: `^${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|$)`,
    sortOrder,
  };
}

const canSee = (
  item: NavigationItem,
  permissions: string[],
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION',
) =>
  (!item.requiredPermission || permissions.includes(item.requiredPermission)) &&
  !(item.href === '/settings/users' && administrationScope === 'SELF') &&
  (!item.featureFlag || process.env[item.featureFlag] === 'true');

export const visibleNavigation = (
  permissions: string[],
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION' = 'SELF',
) =>
  navigation
    .map((group) => {
      const children = group.children?.filter((child) =>
        canSee(child, permissions, administrationScope),
      );
      return { ...group, href: children?.[0]?.href ?? group.href, children };
    })
    .filter(
      (group) =>
        canSee(group, permissions, administrationScope) &&
        (!group.children || group.children.length > 0),
    );

export const routePermissions = navigation
  .flatMap((group) => [group, ...(group.children ?? [])])
  .filter((item): item is NavigationItem & { requiredPermission: string } =>
    Boolean(item.requiredPermission),
  )
  .map(
    ({ href, requiredPermission }) =>
      [href, requiredPermission] as [string, string],
  )
  .sort(([left], [right]) => right.length - left.length);

// Chat uses explicit room grants at the API, not legacy dashboard/project roles.
export const isProjectChatPath = (path: string) =>
  path === '/work' || /^\/projects\/[0-9a-f-]{36}\/work$/.test(path);

export const isNavigationActive = (item: NavigationItem, pathname: string) =>
  new RegExp(item.activeRouteMatcher).test(pathname);
