import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'node:process';

const prisma = new PrismaClient();
const ids = {
  creator: '10000000-0000-4000-8000-000000000101',
  approver: '10000000-0000-4000-8000-000000000102',
  outsider: '10000000-0000-4000-8000-000000000103',
  project: '20000000-0000-4000-8000-000000000201',
  location: '20000000-0000-4000-8000-000000000202',
  document: '20000000-0000-4000-8000-000000000203',
  brand: '30000000-0000-4000-8000-000000000301',
  product: '30000000-0000-4000-8000-000000000302',
  variant: '30000000-0000-4000-8000-000000000303',
  supplier: '30000000-0000-4000-8000-000000000304',
};
const users = Object.values(ids).slice(0, 3);

async function cleanup() {
  const lines = await prisma.projectProductLine.findMany({
    where: { projectId: ids.project },
    select: { id: true },
  });
  const lineIds = lines.map(({ id }) => id);
  const revisions = await prisma.projectProductRevision.findMany({
    where: { productLineId: { in: lineIds } },
    select: { id: true },
  });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { projectId: ids.project },
        { recipientId: { in: users } },
        { actorId: { in: users } },
      ],
    },
  });
  await prisma.comment.deleteMany({
    where: { entityId: { in: [...lineIds, ids.document] } },
  });
  await prisma.activity.deleteMany({
    where: {
      OR: [
        { entityType: 'Project', entityId: ids.project },
        { entityType: 'ProjectProductLine', entityId: { in: lineIds } },
        { entityType: 'ProjectRequiredDocument', entityId: ids.document },
      ],
    },
  });
  await prisma.projectProductApproval.deleteMany({
    where: { revisionId: { in: revisions.map(({ id }) => id) } },
  });
  await prisma.projectProductRevision.deleteMany({
    where: { productLineId: { in: lineIds } },
  });
  await prisma.projectProductLine.deleteMany({
    where: { id: { in: lineIds } },
  });
  await prisma.projectRequiredDocumentVersion.deleteMany({
    where: { requirementId: ids.document },
  });
  await prisma.projectRequiredDocument.deleteMany({
    where: { id: ids.document },
  });
  const attachments = await prisma.entityAttachment.findMany({
    where: { projectId: ids.project },
    select: { fileAssetId: true },
  });
  await prisma.entityAttachment.deleteMany({
    where: { projectId: ids.project },
  });
  await prisma.fileAsset.deleteMany({
    where: { id: { in: attachments.map(({ fileAssetId }) => fileAssetId) } },
  });
  await prisma.projectLocation.deleteMany({
    where: { projectId: ids.project },
  });
  await prisma.projectMember.deleteMany({ where: { projectId: ids.project } });
  await prisma.project.deleteMany({ where: { id: ids.project } });
  await prisma.productVariant.deleteMany({ where: { id: ids.variant } });
  await prisma.product.deleteMany({ where: { id: ids.product } });
  await prisma.brand.deleteMany({ where: { id: ids.brand } });
  await prisma.supplier.deleteMany({ where: { id: ids.supplier } });
  await prisma.session.deleteMany({ where: { userId: { in: users } } });
  await prisma.passwordCredential.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  const testRoles = await prisma.role.findMany({
    where: { code: { startsWith: 'playwright_product_' } },
    select: { id: true },
  });
  await prisma.rolePermission.deleteMany({
    where: { roleId: { in: testRoles.map(({ id }) => id) } },
  });
  await prisma.role.deleteMany({
    where: { id: { in: testRoles.map(({ id }) => id) } },
  });
  await prisma.organizationMembership.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

async function setup() {
  await cleanup();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: 'galaxy-centre' },
  });
  const customer = await prisma.customer.findFirstOrThrow({
    where: { organizationId: organization.id, deletedAt: null },
  });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@galaxy.local' },
  });
  const passwordHash = await bcrypt.hash('Playwright-password-1', 4);
  for (const [id, email, displayName] of [
    [ids.creator, 'playwright.creator@example.test', 'Playwright Creator'],
    [ids.approver, 'playwright.approver@example.test', 'Playwright Approver'],
    [ids.outsider, 'playwright.outsider@example.test', 'Playwright Outsider'],
  ]) {
    await prisma.user.create({
      data: {
        id,
        email,
        normalizedEmail: email,
        displayName,
        status: 'active',
        organizationMembers: {
          create: { organizationId: organization.id },
        },
        credential: {
          create: { passwordHash, mustChangePassword: false },
        },
      },
    });
  }
  const systemRole = await prisma.role.findFirstOrThrow({
    where: {
      organizationId: organization.id,
      category: 'SYSTEM',
      status: 'active',
    },
  });
  for (const userId of [ids.creator, ids.approver])
    await prisma.userRole.create({
      data: {
        organizationId: organization.id,
        userId,
        roleId: systemRole.id,
        scopeType: 'ORGANIZATION',
      },
    });
  const outsiderRole = await prisma.role.create({
    data: {
      organizationId: organization.id,
      code: 'playwright_product_outsider',
      name: 'Playwright product outsider',
      maximumScope: 'SELF',
    },
  });
  const outsiderPermissions = await prisma.permission.findMany({
    where: {
      code: {
        in: [
          'project.read',
          'project.product.view',
          'file.read',
          'file.download',
          'comment.read',
          'activity.read',
        ],
      },
    },
  });
  await prisma.rolePermission.createMany({
    data: outsiderPermissions.map(({ id: permissionId }) => ({
      roleId: outsiderRole.id,
      permissionId,
    })),
  });
  await prisma.userRole.create({
    data: {
      organizationId: organization.id,
      userId: ids.outsider,
      roleId: outsiderRole.id,
      scopeType: 'SELF',
    },
  });
  await prisma.brand.create({
    data: {
      id: ids.brand,
      organizationId: organization.id,
      name: 'Playwright Brand',
    },
  });
  await prisma.product.create({
    data: {
      id: ids.product,
      organizationId: organization.id,
      brandId: ids.brand,
      productCode: 'PW-PRODUCT',
      name: 'Playwright Sofa',
      unit: 'cái',
    },
  });
  await prisma.productVariant.create({
    data: {
      id: ids.variant,
      productId: ids.product,
      code: 'PW-VARIANT',
      name: 'Playwright Oak',
      attributes: {},
    },
  });
  await prisma.supplier.create({
    data: {
      id: ids.supplier,
      organizationId: organization.id,
      legalName: 'Playwright Supplier',
      country: 'VN',
      currency: 'VND',
    },
  });
  await prisma.project.create({
    data: {
      id: ids.project,
      organizationId: organization.id,
      customerId: customer.id,
      code: 'PW-PROJECT-ACCEPTANCE',
      name: 'Playwright Product Acceptance',
      phase: 'PRODUCT_SELECTION',
      status: 'ACTIVE',
      projectManagerId: ids.creator,
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  for (const userId of [ids.creator, ids.approver])
    await prisma.projectMember.create({
      data: {
        organizationId: organization.id,
        projectId: ids.project,
        userId,
        createdBy: admin.id,
      },
    });
  await prisma.projectLocation.create({
    data: {
      id: ids.location,
      projectId: ids.project,
      type: 'ROOM',
      code: 'PW-ROOM',
      name: 'Phòng khách Playwright',
    },
  });
  await prisma.projectRequiredDocument.create({
    data: {
      id: ids.document,
      organizationId: organization.id,
      projectId: ids.project,
      stageKey: 'STAGE_1',
      workstreamKey: 'PROPOSAL',
      documentType: 'TECHNICAL_DRAWING',
      documentName: 'Hồ sơ kỹ thuật Playwright',
      required: true,
      ownerUserId: ids.creator,
      status: 'MISSING',
    },
  });
}

try {
  if (process.argv[2] === 'cleanup') await cleanup();
  else await setup();
} finally {
  await prisma.$disconnect();
}
