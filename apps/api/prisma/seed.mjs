import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const organizationData = {
  name: 'Galaxy Centre',
  slug: 'galaxy-centre',
  timezone: 'Asia/Ho_Chi_Minh',
  defaultCurrency: 'VND',
};
const departments = [
  ['EXECUTIVE', 'Executive'],
  ['SALES', 'Sales'],
  ['DESIGN', 'Design'],
  ['ESTIMATING', 'Estimating'],
  ['PROCUREMENT_IMPORT', 'Procurement and Import'],
  ['ACCOUNTING', 'Accounting'],
  ['PROJECT_MANAGEMENT', 'Project Management'],
  ['INSTALLATION', 'Installation'],
  ['WARRANTY', 'Warranty'],
  ['MARKETING', 'Marketing'],
  ['SYSTEM_ADMINISTRATION', 'System Administration'],
];
const permissions = [
  'organization.read',
  'organization.update',
  'department.read',
  'department.create',
  'department.update',
  'department.archive',
  'user.read',
  'user.create',
  'user.update',
  'user.disable',
  'membership.read',
  'membership.update',
  'role.read',
  'role.create',
  'role.update',
  'role.archive',
  'role.assign',
  'permission.read',
  'permission.assign',
  'audit.read',
];
const roles = [
  ['system_admin', 'Quản trị hệ thống'],
  ['director', 'Giám đốc'],
  ['sales', 'Kinh doanh'],
  ['design', 'Thiết kế'],
  ['estimator', 'Dự toán'],
  ['procurement', 'Mua hàng'],
  ['accounting', 'Kế toán'],
  ['project_manager', 'Quản lý dự án'],
  ['installer', 'Lắp đặt'],
  ['warranty', 'Bảo hành'],
  ['marketing', 'Marketing'],
];

async function seed() {
  const organization = await prisma.organization.upsert({
    where: { slug: organizationData.slug },
    create: organizationData,
    update: organizationData,
  });
  await Promise.all(
    departments.map(([code, name]) =>
      prisma.department.upsert({
        where: {
          organizationId_code: { organizationId: organization.id, code },
        },
        create: { organizationId: organization.id, code, name },
        update: { name },
      }),
    ),
  );
  for (const code of permissions) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, name: code, description: `Allows ${code}` },
      update: { name: code, description: `Allows ${code}` },
    });
  }
  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { organizationId_code: { organizationId: organization.id, code } },
      create: { organizationId: organization.id, code, name, isSystem: true },
      update: { name, isSystem: true },
    });
  }
  const allPermissions = await prisma.permission.findMany();
  const seededRoles = await prisma.role.findMany({
    where: { organizationId: organization.id },
  });
  const readCodes = new Set(
    permissions.filter((code) => code.endsWith('.read')),
  );
  for (const role of seededRoles) {
    const allowed =
      role.code === 'system_admin'
        ? allPermissions
        : role.code === 'director'
          ? allPermissions.filter(
              (permission) =>
                readCodes.has(permission.code) ||
                [
                  'organization.update',
                  'department.create',
                  'department.update',
                  'user.create',
                  'user.update',
                  'membership.update',
                  'role.assign',
                ].includes(permission.code),
            )
          : allPermissions.filter((permission) =>
              ['organization.read', 'department.read'].includes(
                permission.code,
              ),
            );
    await prisma.rolePermission.createMany({
      data: allowed.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
  const email = (process.env.DEV_AUTH_USER_EMAIL ?? 'admin@galaxy.local')
    .trim()
    .toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, displayName: 'Local Administrator', status: 'active' },
    update: { displayName: 'Local Administrator', status: 'active' },
  });
  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    create: { organizationId: organization.id, userId: user.id },
    update: { status: 'active' },
  });
  const adminRole = seededRoles.find((role) => role.code === 'system_admin');
  if (!adminRole) throw new Error('system_admin seed role is missing');
  await prisma.userRole.upsert({
    where: {
      organizationId_userId_roleId: {
        organizationId: organization.id,
        userId: user.id,
        roleId: adminRole.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      roleId: adminRole.id,
    },
    update: {},
  });
}

seed().finally(() => prisma.$disconnect());
