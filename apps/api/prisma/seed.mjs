import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const organizationData = {
  name: 'Galaxy Centre',
  slug: 'galaxy-centre',
  timezone: 'Asia/Ho_Chi_Minh',
  defaultCurrency: 'VND',
};
const departments = [
  ['EXECUTIVE', 'Ban Giám đốc', 'BOARD', null, 0],
  ['BUSINESS_DIVISION', 'Khối Kinh doanh', 'DIVISION', null, 10],
  ['SALES', 'Phòng Sales', 'DEPARTMENT', 'BUSINESS_DIVISION', 11],
  ['SALES_TEAM_1', 'Nhóm Sales 1', 'TEAM', 'SALES', 12],
  ['SALES_TEAM_2', 'Nhóm Sales 2', 'TEAM', 'SALES', 13],
  [
    'BUSINESS_DEVELOPMENT',
    'Phòng Phát triển kinh doanh',
    'DEPARTMENT',
    'BUSINESS_DIVISION',
    14,
  ],
  ['DESIGN', 'Phòng Thiết kế'],
  ['ESTIMATING', 'Phòng Dự toán'],
  ['PROCUREMENT_IMPORT', 'Phòng Mua hàng và Xuất nhập khẩu'],
  ['ACCOUNTING', 'Phòng Kế toán'],
  ['PROJECT_MANAGEMENT', 'Phòng Quản lý dự án'],
  ['INSTALLATION', 'Phòng Thi công'],
  ['WARRANTY', 'Phòng Bảo hành'],
  ['MARKETING', 'Phòng Marketing'],
  ['SYSTEM_ADMINISTRATION', 'Quản trị hệ thống', 'OTHER', null, 100],
];
const permissions = [
  'system.settings.read',
  'system.settings.update',
  'system.security.read',
  'system.security.update',
  'system.organizations.read',
  'system.organizations.manage',
  'system.roles.read',
  'system.roles.manage',
  'system.permissions.read',
  'system.permissions.manage',
  'system.audit.read',
  'custom_fields.read',
  'custom_fields.create',
  'custom_fields.update',
  'custom_fields.archive',
  'custom_fields.delegate',
  'organization.read',
  'organization.update',
  'organization.settings.read',
  'organization.settings.update',
  'department.read',
  'department.create',
  'department.update',
  'department.archive',
  'user.read',
  'user.create',
  'user.update',
  'user.disable',
  'user.reactivate',
  'user.password.reset',
  'user.password.temporary',
  'user.session.read',
  'user.capabilities.read',
  'user.session.revoke',
  'user.audit.read',
  'membership.read',
  'membership.create',
  'membership.update',
  'department.member.manage',
  'department.member.read',
  'department.manager.assign',
  'department.role.manage',
  'role.read',
  'role.create',
  'role.update',
  'role.archive',
  'role.assign',
  'role.delegation.manage',
  'permission.read',
  'permission.assign',
  'audit.read',
  'audit.export',
  'crm.customer.read',
  'crm.customer.create',
  'crm.customer.update',
  'crm.customer.delete',
  'crm.contact.read',
  'crm.contact.create',
  'crm.contact.update',
  'crm.contact.delete',
  'crm.lead.read',
  'crm.lead.create',
  'crm.lead.update',
  'crm.lead.delete',
  'crm.lead.assign',
  'crm.lead.change_status',
  'crm.lead.convert',
  'crm.opportunity.read',
  'crm.opportunity.create',
  'crm.opportunity.update',
  'crm.opportunity.delete',
  'crm.opportunity.change_stage',
  'crm.opportunity.convert',
  'project.read',
  'project.create',
  'project.update',
  'project.delete',
  'project.manage_members',
  'project.manage_departments',
  'project.change_phase',
  'task.read',
  'task.create',
  'task.update',
  'task.delete',
  'task.assign',
  'task.complete',
  'survey.read',
  'survey.create',
  'survey.update',
  'survey.approve',
  'requirement.read',
  'requirement.create',
  'requirement.update',
  'requirement.approve',
  'file.read',
  'file.upload',
  'file.update',
  'file.delete',
  'file.download',
  'file.restore',
  'comment.read',
  'comment.create',
  'comment.update_own',
  'comment.update_any',
  'comment.delete_own',
  'comment.delete_any',
  'comment.mention',
  'notification.read',
  'activity.read',
  'dashboard.read',
  'search.read',
  'import.read',
  'import.create',
  'import.confirm',
  'marketing.campaign.read',
  'marketing.campaign.create',
  'marketing.campaign.update',
  'marketing.content.read',
  'marketing.content.create',
  'marketing.content.update',
  'marketing.content.review',
  'marketing.content.approve',
  'marketing.content.schedule',
  'marketing.content.publish',
];
const roles = [
  ['system_admin', 'Quản trị hệ thống'],
  ['organization_admin', 'Quản trị tổ chức'],
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
  ['sales_manager', 'Quản lý kinh doanh'],
  ['department_manager', 'Quản lý phòng ban'],
  ['deputy_manager', 'Phó phòng'],
  ['team_lead', 'Trưởng nhóm'],
  ['employee', 'Nhân viên'],
  ['secretary', 'Thư ký'],
];

async function seed() {
  const organization = await prisma.organization.upsert({
    where: { slug: organizationData.slug },
    create: organizationData,
    update: organizationData,
  });
  await Promise.all(
    departments.map(
      ([code, name, unitType = 'DEPARTMENT', , displayOrder = 0]) =>
        prisma.department.upsert({
          where: {
            organizationId_code: { organizationId: organization.id, code },
          },
          create: {
            organizationId: organization.id,
            code,
            name,
            unitType,
            displayOrder,
          },
          update: { name, unitType, displayOrder },
        }),
    ),
  );
  const seededDepartments = await prisma.department.findMany({
    where: { organizationId: organization.id },
  });
  for (const [code, , , parentCode] of departments) {
    const unit = seededDepartments.find((item) => item.code === code);
    const parent = seededDepartments.find((item) => item.code === parentCode);
    if (unit && parent)
      await prisma.department.update({
        where: { id: unit.id },
        data: { parentId: parent.id },
      });
  }
  for (const code of permissions) {
    await prisma.permission.upsert({
      where: { code },
      create: {
        code,
        name: code,
        description: `Allows ${code}`,
        module: code.split('.')[0],
        isProtected: code.startsWith('system.'),
      },
      update: {
        name: code,
        description: `Allows ${code}`,
        module: code.split('.')[0],
        isProtected: code.startsWith('system.'),
      },
    });
  }
  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { organizationId_code: { organizationId: organization.id, code } },
      create: { organizationId: organization.id, code, name },
      update: { name },
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
    await prisma.role.update({
      where: { id: role.id },
      data: {
        isSystem: role.code === 'system_admin',
        isProtected: role.code === 'system_admin',
        isDelegable: ![
          'system_admin',
          'organization_admin',
          'director',
        ].includes(role.code),
        administrationTier:
          role.code === 'system_admin'
            ? 100
            : role.code === 'organization_admin'
              ? 80
              : role.code === 'director'
                ? 60
                : ['sales_manager', 'department_manager'].includes(role.code)
                  ? 40
                  : role.code === 'deputy_manager'
                    ? 30
                    : role.code === 'team_lead'
                      ? 20
                      : 0,
        category:
          role.code === 'system_admin'
            ? 'SYSTEM'
            : role.code === 'organization_admin'
              ? 'ORGANIZATION'
              : role.code === 'director'
                ? 'EXECUTIVE'
                : [
                      'sales_manager',
                      'department_manager',
                      'deputy_manager',
                      'team_lead',
                    ].includes(role.code)
                  ? 'DEPARTMENT'
                  : ['employee', 'secretary'].includes(role.code)
                    ? 'STANDARD'
                    : 'CUSTOM',
        maximumScope:
          role.code === 'system_admin'
            ? 'SYSTEM'
            : ['organization_admin', 'director'].includes(role.code)
              ? 'ORGANIZATION'
              : [
                    'sales_manager',
                    'department_manager',
                    'deputy_manager',
                    'team_lead',
                  ].includes(role.code)
                ? 'DEPARTMENT'
                : 'SELF',
      },
    });
    const allowed =
      role.code === 'system_admin'
        ? allPermissions
        : role.code === 'organization_admin'
          ? allPermissions.filter(
              (permission) => !permission.code.startsWith('system.'),
            )
          : role.code === 'director'
            ? allPermissions.filter(
                (permission) =>
                  (readCodes.has(permission.code) &&
                    !permission.code.startsWith('system.')) ||
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
            : role.code === 'marketing'
              ? allPermissions.filter(
                  (permission) =>
                    permission.code.startsWith('marketing.') ||
                    [
                      'dashboard.read',
                      'search.read',
                      'activity.read',
                      'file.read',
                      'file.upload',
                      'comment.read',
                      'comment.create',
                      'notification.read',
                    ].includes(permission.code),
                )
              : ['sales', 'sales_manager'].includes(role.code)
                ? allPermissions.filter(
                    (permission) =>
                      permission.code.startsWith('crm.') ||
                      (role.code === 'sales_manager' &&
                        [
                          'organization.read',
                          'department.read',
                          'department.member.read',
                          'department.member.manage',
                          'user.read',
                          'user.update',
                          'user.disable',
                          'user.reactivate',
                          'user.password.reset',
                          'user.password.temporary',
                          'user.session.revoke',
                          'membership.read',
                          'role.read',
                          'role.assign',
                          'user.audit.read',
                        ].includes(permission.code)) ||
                      [
                        'dashboard.read',
                        'search.read',
                        'activity.read',
                        'file.read',
                        'file.upload',
                        'comment.read',
                        'comment.create',
                        'notification.read',
                      ].includes(permission.code),
                  )
                : ['project_manager', 'employee'].includes(role.code)
                  ? allPermissions.filter(
                      (permission) =>
                        ['project.', 'task.', 'survey.', 'requirement.'].some(
                          (prefix) => permission.code.startsWith(prefix),
                        ) ||
                        [
                          'dashboard.read',
                          'search.read',
                          'activity.read',
                          'file.read',
                          'file.upload',
                          'comment.read',
                          'comment.create',
                          'notification.read',
                        ].includes(permission.code),
                    )
                  : [
                        'department_manager',
                        'deputy_manager',
                        'team_lead',
                      ].includes(role.code)
                    ? allPermissions.filter((permission) =>
                        [
                          'organization.read',
                          'department.read',
                          'department.member.read',
                          'department.member.manage',
                          'user.read',
                          'user.update',
                          'user.disable',
                          'user.reactivate',
                          'user.password.reset',
                          'user.password.temporary',
                          'user.session.revoke',
                          'membership.read',
                          'role.read',
                          'role.assign',
                          'user.audit.read',
                        ].includes(permission.code),
                      )
                    : allPermissions.filter((permission) =>
                        ['organization.read', 'department.read'].includes(
                          permission.code,
                        ),
                      );
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: allowed.map(({ id }) => id) },
      },
    });
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
    where: { normalizedEmail: email },
    create: {
      email,
      normalizedEmail: email,
      displayName: 'Local Administrator',
      status: 'active',
    },
    update: {
      email,
      normalizedEmail: email,
      displayName: 'Local Administrator',
      status: 'active',
    },
  });
  const seedPassword = process.env.DEV_SEED_PASSWORD;
  let seedPasswordHash;
  if (seedPassword) {
    if (seedPassword.length < 12)
      throw new Error('DEV_SEED_PASSWORD must be at least 12 characters');
    if (Buffer.byteLength(seedPassword) > 72)
      throw new Error('DEV_SEED_PASSWORD must be at most 72 UTF-8 bytes');
    const rounds = Number(process.env.PASSWORD_BCRYPT_ROUNDS ?? 12);
    if (!Number.isInteger(rounds) || rounds < 4 || rounds > 14)
      throw new Error('PASSWORD_BCRYPT_ROUNDS must be between 4 and 14');
    seedPasswordHash = await hash(seedPassword, rounds);
    await prisma.passwordCredential.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        passwordHash: seedPasswordHash,
        mustChangePassword: true,
      },
      update: {},
    });
  }
  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      administrationScope: 'SYSTEM',
    },
    update: { status: 'active', administrationScope: 'SYSTEM' },
  });
  const adminRole = seededRoles.find((role) => role.code === 'system_admin');
  if (!adminRole) throw new Error('system_admin seed role is missing');
  await prisma.userRole.updateMany({
    where: {
      organizationId: organization.id,
      userId: user.id,
      roleId: adminRole.id,
    },
    data: { scopeType: 'SYSTEM', departmentId: null, status: 'active' },
  });
  if (
    !(await prisma.userRole.findFirst({
      where: {
        organizationId: organization.id,
        userId: user.id,
        roleId: adminRole.id,
        scopeType: 'SYSTEM',
      },
    }))
  )
    await prisma.userRole.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        roleId: adminRole.id,
        scopeType: 'SYSTEM',
      },
    });
  const customerNames = [
    'Công ty Ánh Dương',
    'Gia đình Minh Anh',
    'Galaxy Retail',
    'Nội thất Đông Dương',
    'Công ty Bắc Hà',
    'Gia đình Hoàng Nam',
    'Kiến trúc Mộc',
    'Showroom Galaxy Centre',
  ];
  for (const [index, displayName] of customerNames.entries()) {
    const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.customer.upsert({
      where: { id },
      create: {
        id,
        organizationId: organization.id,
        type: index % 3 === 1 ? 'INDIVIDUAL' : 'COMPANY',
        displayName,
        phone: `09000000${String(index + 1).padStart(2, '0')}`,
        email: `customer${index + 1}@example.test`,
        ownerId: user.id,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: { displayName, ownerId: user.id, deletedAt: null },
    });
    for (
      let contactIndex = 0;
      contactIndex < (index < 4 ? 2 : 1);
      contactIndex++
    ) {
      const contactId = `20000000-0000-4000-8000-${String(index * 2 + contactIndex + 1).padStart(12, '0')}`;
      await prisma.contact.upsert({
        where: { id: contactId },
        create: {
          id: contactId,
          organizationId: organization.id,
          customerId: id,
          firstName: contactIndex ? 'Liên hệ' : 'Đại diện',
          displayName: `${contactIndex ? 'Liên hệ' : 'Đại diện'} ${displayName}`,
          email: `contact${index * 2 + contactIndex + 1}@example.test`,
          isPrimary: contactIndex === 0,
          createdBy: user.id,
          updatedBy: user.id,
        },
        update: { customerId: id, deletedAt: null },
      });
    }
  }
  const salesDepartment = await prisma.department.findFirstOrThrow({
    where: { organizationId: organization.id, code: 'SALES' },
  });
  const leadSourceNames = [
    'Website',
    'Facebook',
    'YouTube',
    'TikTok',
    'Kiến trúc sư',
    'Nhà thiết kế',
    'Đối tác',
    'Khách hàng cũ',
    'Giới thiệu',
    'Sự kiện',
    'Khách đến trực tiếp',
    'Khác',
  ];
  const leadSources = [];
  for (const [index, name] of leadSourceNames.entries())
    leadSources.push(
      await prisma.leadSource.upsert({
        where: {
          organizationId_code: {
            organizationId: organization.id,
            code: `SOURCE_${index + 1}`,
          },
        },
        create: {
          organizationId: organization.id,
          code: `SOURCE_${index + 1}`,
          name,
        },
        update: { name, status: 'active' },
      }),
    );
  for (let index = 0; index < 15; index++) {
    const id = `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.lead.upsert({
      where: { id },
      create: {
        id,
        organizationId: organization.id,
        name: `Lead mẫu ${index + 1}`,
        companyName: index % 2 ? `Công ty mẫu ${index + 1}` : undefined,
        phone: `09100000${String(index + 1).padStart(2, '0')}`,
        email: `lead${index + 1}@example.test`,
        sourceId: leadSources[index % leadSources.length].id,
        ownerId: user.id,
        departmentId: salesDepartment.id,
        status: ['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED'][
          index % 5
        ],
        priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'][index % 4],
        estimatedValue: (index + 1) * 100000000,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: {
        sourceId: leadSources[index % leadSources.length].id,
        ownerId: user.id,
        departmentId: salesDepartment.id,
        deletedAt: null,
      },
    });
  }
  const seededLeads = await prisma.lead.findMany({
    where: { organizationId: organization.id },
    orderBy: { id: 'asc' },
    take: 8,
  });
  const customer = await prisma.customer.findFirstOrThrow({
    where: { organizationId: organization.id },
  });
  for (const [index, lead] of seededLeads.entries()) {
    const id = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.opportunity.upsert({
      where: { id },
      create: {
        id,
        organizationId: organization.id,
        leadId: lead.id,
        customerId: customer.id,
        name: `Cơ hội ${lead.name}`,
        ownerId: user.id,
        departmentId: salesDepartment.id,
        stage: [
          'DISCOVERY',
          'QUALIFICATION',
          'SURVEY',
          'REQUIREMENT',
          'DESIGN_PREPARATION',
          'PROPOSAL',
          'NEGOTIATION',
          'WON',
        ][index],
        probability: Math.min(100, (index + 1) * 10),
        estimatedValue: lead.estimatedValue,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: {
        customerId: customer.id,
        ownerId: user.id,
        departmentId: salesDepartment.id,
        deletedAt: null,
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: 'CONVERTED',
        convertedAt: lead.convertedAt ?? new Date(),
        convertedBy: user.id,
      },
    });
  }
  const seededOpportunities = await prisma.opportunity.findMany({
    where: { organizationId: organization.id },
    orderBy: { id: 'asc' },
    take: 5,
  });
  const projectNames = [
    'Biệt thự Ecopark',
    'Biệt thự Quận 7',
    'Showroom Galaxy Centre',
    'Villa Đào Tấn',
    'Dự án Bắc Ninh',
  ];
  for (const [index, opportunity] of seededOpportunities.entries()) {
    const id = `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const project = await prisma.project.upsert({
      where: { id },
      create: {
        id,
        organizationId: organization.id,
        opportunityId: opportunity.id,
        code: `GAL-${String(index + 1).padStart(4, '0')}`,
        name: projectNames[index],
        customerId: customer.id,
        projectOwnerId: user.id,
        salesOwnerId: user.id,
        projectManagerId: user.id,
        status: 'ACTIVE',
        phase: ['SURVEY', 'REQUIREMENT', 'DESIGN'][index % 3],
        healthStatus: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'][index % 3],
        progressPercentage: (index + 1) * 15,
        estimatedValue: opportunity.estimatedValue,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: {
        name: projectNames[index],
        customerId: customer.id,
        projectManagerId: user.id,
        deletedAt: null,
      },
    });
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      create: {
        organizationId: organization.id,
        projectId: project.id,
        userId: user.id,
        role: 'PROJECT_MANAGER',
        createdBy: user.id,
      },
      update: { role: 'PROJECT_MANAGER' },
    });
    await prisma.projectDepartment.upsert({
      where: {
        projectId_departmentId: {
          projectId: project.id,
          departmentId: salesDepartment.id,
        },
      },
      create: {
        organizationId: organization.id,
        projectId: project.id,
        departmentId: salesDepartment.id,
        createdBy: user.id,
      },
      update: {},
    });
  }
  const seededProjects = await prisma.project.findMany({
    where: { organizationId: organization.id },
    orderBy: { id: 'asc' },
    take: 5,
  });
  for (let index = 0; index < 20; index++) {
    const id = `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const project = seededProjects[index % seededProjects.length];
    const task = await prisma.task.upsert({
      where: { id },
      create: {
        id,
        organizationId: organization.id,
        title: `Công việc mẫu ${index + 1}`,
        description: 'Công việc Sprint 2 mẫu',
        projectId: project.id,
        customerId: project.customerId,
        departmentId: salesDepartment.id,
        priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'][index % 4],
        status: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'][
          index % 5
        ],
        dueDate: new Date(Date.now() + (index - 5) * 86400000),
        completedAt: index % 5 === 4 ? new Date() : undefined,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: {
        projectId: project.id,
        departmentId: salesDepartment.id,
        deletedAt: null,
      },
    });
    await prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: task.id, userId: user.id } },
      create: {
        organizationId: organization.id,
        taskId: task.id,
        userId: user.id,
        assignedBy: user.id,
      },
      update: {},
    });
  }
  for (let index = 0; index < 3; index++) {
    const project = seededProjects[index];
    const surveyId = `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const survey = await prisma.survey.upsert({
      where: { id: surveyId },
      create: {
        id: surveyId,
        organizationId: organization.id,
        projectId: project.id,
        location: project.location ?? 'Hà Nội',
        siteCondition: 'Hiện trạng khảo sát mẫu',
        measurements: { width: 10 + index, height: 3 },
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: { projectId: project.id, deletedAt: null },
    });
    const requirementId = `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await prisma.requirement.upsert({
      where: { id: requirementId },
      create: {
        id: requirementId,
        organizationId: organization.id,
        projectId: project.id,
        surveyId: survey.id,
        title: `Yêu cầu ${project.name}`,
        customerRequirements: 'Không gian hiện đại và tiện dụng',
        stylePreferences: 'Modern Luxury',
        budgetMin: 500000000,
        budgetMax: 1500000000,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: { projectId: project.id, surveyId: survey.id, deletedAt: null },
    });
  }
  const accountingDepartment = await prisma.department.findFirstOrThrow({
    where: { organizationId: organization.id, code: 'ACCOUNTING' },
  });
  for (const account of [
    {
      email: 'organization.admin@galaxy.local',
      displayName: 'Organization Administrator',
      roleCode: 'organization_admin',
      scope: 'ORGANIZATION',
    },
    {
      email: 'director@galaxy.local',
      displayName: 'Director',
      roleCode: 'director',
      scope: 'ORGANIZATION',
    },
    {
      email: 'sales.manager@galaxy.local',
      displayName: 'Sales Manager',
      roleCode: 'sales_manager',
      scope: 'MANAGED_DEPARTMENTS',
    },
    {
      email: 'employee@galaxy.local',
      displayName: 'Representative Employee',
      roleCode: 'employee',
      scope: 'SELF',
    },
    {
      email: 'accounting.manager@galaxy.local',
      displayName: 'Accounting Manager',
      roleCode: 'department_manager',
      scope: 'MANAGED_DEPARTMENTS',
      department: 'ACCOUNTING',
    },
    {
      email: 'sales.employee@galaxy.local',
      displayName: 'Sales Employee',
      roleCode: 'employee',
      scope: 'SELF',
    },
    {
      email: 'accounting.employee@galaxy.local',
      displayName: 'Accounting Employee',
      roleCode: 'employee',
      scope: 'SELF',
      department: 'ACCOUNTING',
    },
    {
      email: 'normal.employee@galaxy.local',
      displayName: 'Normal Employee',
      roleCode: 'employee',
      scope: 'SELF',
      department: 'ACCOUNTING',
    },
  ]) {
    const seededUser = await prisma.user.upsert({
      where: { normalizedEmail: account.email },
      create: {
        email: account.email,
        normalizedEmail: account.email,
        displayName: account.displayName,
        status: 'active',
      },
      update: { displayName: account.displayName },
    });
    const membership = await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: seededUser.id,
        },
      },
      create: {
        organizationId: organization.id,
        userId: seededUser.id,
        administrationScope: account.scope,
      },
      update: { status: 'active', administrationScope: account.scope },
    });
    if (seedPasswordHash)
      await prisma.passwordCredential.upsert({
        where: { userId: seededUser.id },
        create: {
          userId: seededUser.id,
          passwordHash: seedPasswordHash,
          mustChangePassword: true,
        },
        update: {},
      });
    const department =
      account.department === 'ACCOUNTING'
        ? accountingDepartment
        : salesDepartment;
    await prisma.departmentMembership.upsert({
      where: {
        departmentId_userId: {
          departmentId: department.id,
          userId: seededUser.id,
        },
      },
      create: {
        organizationId: organization.id,
        departmentId: department.id,
        userId: seededUser.id,
        isPrimary: true,
      },
      update: {},
    });
    const role = seededRoles.find(({ code }) => code === account.roleCode);
    if (!role) throw new Error(`${account.roleCode} seed role is missing`);
    const scopeType =
      account.scope === 'ORGANIZATION'
        ? 'ORGANIZATION'
        : account.scope === 'MANAGED_DEPARTMENTS'
          ? 'DEPARTMENT'
          : 'SELF';
    await prisma.userRole.updateMany({
      where: {
        organizationId: organization.id,
        userId: seededUser.id,
        roleId: role.id,
      },
      data: {
        scopeType,
        departmentId: scopeType === 'DEPARTMENT' ? department.id : null,
        status: 'active',
      },
    });
    if (
      !(await prisma.userRole.findFirst({
        where: {
          organizationId: organization.id,
          userId: seededUser.id,
          roleId: role.id,
          scopeType,
          departmentId: scopeType === 'DEPARTMENT' ? department.id : null,
        },
      }))
    )
      await prisma.userRole.create({
        data: {
          organizationId: organization.id,
          userId: seededUser.id,
          roleId: role.id,
          scopeType,
          departmentId: scopeType === 'DEPARTMENT' ? department.id : null,
        },
      });
    if (account.scope === 'MANAGED_DEPARTMENTS')
      await prisma.managedDepartment.upsert({
        where: {
          managerId_departmentId: {
            managerId: membership.id,
            departmentId: department.id,
          },
        },
        create: {
          organizationId: organization.id,
          managerId: membership.id,
          departmentId: department.id,
          createdByUserId: user.id,
          includeChildren: true,
        },
        update: { status: 'active', includeChildren: true },
      });
  }

  let campaign = await prisma.campaign.findFirst({
    where: { organizationId: organization.id, name: 'Galaxy Living 2026' },
  });
  campaign ??= await prisma.campaign.create({
    data: {
      organizationId: organization.id,
      name: 'Galaxy Living 2026',
      brandEcosystem: 'Galaxycentre.vn',
      ownerId: user.id,
      utmSource: 'website',
      utmMedium: 'organic',
      utmCampaign: 'galaxy-living-2026',
    },
  });
  let content = await prisma.contentItem.findFirst({
    where: {
      organizationId: organization.id,
      title: 'Không gian sống Galaxy Living',
    },
  });
  content ??= await prisma.contentItem.create({
    data: {
      organizationId: organization.id,
      title: 'Không gian sống Galaxy Living',
      originalContent:
        'Giới thiệu giải pháp thiết kế không gian sống của Galaxy Centre.',
      campaignId: campaign.id,
      brandEcosystem: 'Galaxycentre.vn',
      authorId: user.id,
    },
  });
  await prisma.contentVariant.upsert({
    where: {
      contentItemId_channel: {
        contentItemId: content.id,
        channel: 'WEBSITE',
      },
    },
    create: {
      contentItemId: content.id,
      channel: 'WEBSITE',
      title: content.title,
      body: content.originalContent,
    },
    update: {},
  });
}

seed().finally(() => prisma.$disconnect());
