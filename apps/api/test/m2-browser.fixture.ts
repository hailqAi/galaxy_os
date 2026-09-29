import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export async function createM2BrowserFixture() {
  const target = JSON.parse(
    execFileSync(
      process.execPath,
      [resolve(__dirname, '../scripts/g00-isolated-environment.mjs')],
      { encoding: 'utf8' },
    ),
  ) as { databaseName: string; databaseUser: string };
  const db = new PrismaClient();
  const run = randomUUID();
  const password = 'm2a-browser-fixture-only';
  const users: Record<string, { id: string; email: string; cookie: string }> =
    {};
  try {
    const identity = await db.$queryRaw<
      { database: string; username: string }[]
    >`SELECT current_database() AS database,current_user AS username`;
    if (
      identity[0]?.database !== target.databaseName ||
      identity[0]?.username !== target.databaseUser
    )
      throw new Error('Fixture database identity mismatch');
    const org = await db.organization.create({
      data: {
        slug: `browser-${run}`,
        name: 'M2 trình duyệt giả lập',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    });
    const digest = await hash(password, 4);
    for (const name of [
      'authority',
      'manager',
      'sender',
      'viewer',
      'locker',
      'guest',
      'publisher',
    ]) {
      const email = `${name}-${run}@example.test`;
      const user = await db.user.create({
        data: {
          email,
          normalizedEmail: email,
          displayName: `M2 ${name}`,
          status: 'active',
          credential: {
            create: { passwordHash: digest, mustChangePassword: false },
          },
          organizationMembers: {
            create: {
              organizationId: org.id,
              kind: name === 'guest' ? 'EXTERNAL' : 'INTERNAL',
            },
          },
        },
      });
      users[name] = { id: user.id, email, cookie: '' };
    }
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        code: `browser-${run}`,
        name: 'Fixture IAM authority',
        administrationTier: 10,
        permissions: {
          create: [
            'role.assign',
            'chat.create',
            'chat.access.manage',
            'chat.lock',
            'chat.history',
            'chat.publish',
            'chat.read',
            'chat.send',
            'chat.upload',
            'chat.download',
          ].map((code) => ({ permission: { connect: { code } } })),
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: org.id,
        userId: users.authority!.id,
        roleId: role.id,
        scopeType: 'ORGANIZATION',
      },
    });
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        displayName: 'Khách fixture',
        type: 'INDIVIDUAL',
        createdBy: users.authority!.id,
        updatedBy: users.authority!.id,
      },
    });
    const project = await db.project.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        code: `browser-${run}`,
        name: 'Project browser M2-A',
        projectOwnerId: users.sender!.id,
        createdBy: users.authority!.id,
        updatedBy: users.authority!.id,
      },
    });
    await db.projectMember.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        userId: users.publisher!.id,
        createdBy: users.authority!.id,
      },
    });
    const api = process.env.INTERNAL_API_URL!;
    for (const user of Object.values(users)) {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password }),
      });
      if (!res.ok) throw new Error(`Fixture login ${res.status}`);
      user.cookie = res.headers.getSetCookie()[0]!.split(';')[0]!;
    }
    async function post(
      actor: string,
      path: string,
      body: unknown,
    ): Promise<Record<string, string>> {
      const response = await fetch(`${api}/project-chat${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: users[actor]!.cookie,
          'X-Chat-Actor': users[actor]!.id,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Fixture ${path}: ${response.status}`);
      return response.json();
    }
    const managerAuthority = await post(
      'authority',
      `/projects/${project.id}/authorities`,
      {
        userId: users.manager!.id,
        actions: ['CREATE', 'ACCESS_ADMIN', 'LOCK', 'HISTORY'],
        roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'LOCK', 'HISTORY'],
      },
    );
    const internal = await post('manager', `/projects/${project.id}/rooms`, {
      title: 'Nội bộ thử nghiệm',
      group: 'CONSULTING',
      audience: 'INTERNAL',
    });
    const external = await post('manager', `/projects/${project.id}/rooms`, {
      title: 'Khách thử nghiệm',
      group: 'CONSULTING',
      audience: 'CUSTOMER',
    });
    const sender = await post('manager', `/rooms/${internal.id}/grants`, {
      userId: users.sender!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    });
    await post('manager', `/rooms/${internal.id}/grants`, {
      userId: users.viewer!.id,
      actions: ['READ'],
    });
    await post('authority', `/projects/${project.id}/participants`, {
      userId: users.guest!.id,
    });
    await post('manager', `/rooms/${external.id}/grants`, {
      userId: users.guest!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const sourcePermissions = [
      'file.read',
      'file.download',
      'file.upload',
      'project.document.manage',
      'project.document.review',
      'contract.read',
      'contract.create',
      'contract.update',
      'receivable.read',
      'receivable.create',
      'receivable.payment.record',
      'installation.read',
      'installation.manage',
      'installation.execute',
      'inventory.adjustment.create',
      'inventory.adjustment.approve',
      'inventory.adjustment.post',
      'inventory.issue.create',
      'inventory.issue.approve',
      'inventory.issue.post',
      'quotation.update',
      'quotation.approve',
    ];
    const sourceRole = await db.role.create({
      data: {
        organizationId: org.id,
        code: `source-${run}`,
        name: 'Nguồn fixture',
        administrationTier: 0,
        permissions: {
          create: sourcePermissions.map((code) => ({
            permission: { connect: { code } },
          })),
        },
      },
    });
    const projectReaderRole = await db.role.create({
      data: {
        organizationId: org.id,
        code: `project-reader-${run}`,
        name: 'Đọc Project thuộc phạm vi fixture',
        permissions: {
          create: { permission: { connect: { code: 'project.read' } } },
        },
      },
    });
    for (const actor of ['sender', 'publisher']) {
      await db.userRole.create({
        data: {
          organizationId: org.id,
          userId: users[actor]!.id,
          roleId: projectReaderRole.id,
          scopeType: 'SELF',
        },
      });
      await db.userRole.create({
        data: {
          organizationId: org.id,
          userId: users[actor]!.id,
          roleId: sourceRole.id,
          scopeType: 'ORGANIZATION',
        },
      });
      await post('manager', `/rooms/${external.id}/grants`, {
        userId: users[actor]!.id,
        actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
      });
    }
    await post('authority', `/projects/${project.id}/authorities`, {
      userId: users.publisher!.id,
      actions: ['PUBLISH'],
      roomCeiling: [],
    });
    async function domain<T = { id: string }>(
      actor: string,
      path: string,
      body: unknown,
    ) {
      const response = await fetch(`${api}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: users[actor]!.cookie,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(`Fixture source ${path}: ${response.status}`);
      return response.json() as Promise<T>;
    }
    const form = new FormData();
    form.append('entityType', 'Project');
    form.append('entityId', project.id);
    form.append('category', 'PROJECT_DOCUMENT');
    form.append(
      'file',
      new Blob(['Phương án browser đã duyệt cho khách'], {
        type: 'text/plain',
      }),
      'phuong-an-browser.txt',
    );
    const uploaded = await fetch(`${api}/files`, {
      method: 'POST',
      headers: { Cookie: users.sender!.cookie },
      body: form,
    });
    if (!uploaded.ok)
      throw new Error(`Fixture source upload ${uploaded.status}`);
    const file = (await uploaded.json()) as { id: string };
    const document = await domain(
      'sender',
      `/projects/${project.id}/required-documents`,
      {
        stageKey: 'STAGE_1',
        workstreamKey: 'PROPOSAL',
        documentType: 'PROPOSAL',
        documentName: 'Phương án browser',
      },
    );
    await domain(
      'sender',
      `/projects/${project.id}/required-documents/${document.id}/file`,
      { fileAssetId: file.id },
    );
    await domain(
      'sender',
      `/projects/${project.id}/required-documents/${document.id}/submit`,
      {},
    );
    await domain(
      'publisher',
      `/projects/${project.id}/required-documents/${document.id}/decision`,
      { decision: 'APPROVED' },
    );
    const quotation = await db.quotation.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        customerId: customer.id,
        number: `CONTRACT-${run}`,
        currency: 'VND',
        grandTotal: '120000',
        createdBy: users.sender!.id,
        updatedBy: users.sender!.id,
        versions: {
          create: {
            version: 1,
            createdBy: users.sender!.id,
            grandTotal: '120000',
          },
        },
      },
    });
    for (const action of ['submit', 'approve', 'mark-sent', 'mark-accepted'])
      await domain(
        action === 'approve' ? 'publisher' : 'sender',
        `/projects/${project.id}/quotations/${quotation.id}/${action}`,
        {},
      );
    const contract = await domain(
      'sender',
      `/projects/${project.id}/contracts`,
      {
        quotationId: quotation.id,
        contractNumber: `C-${run}`,
        sellerLegalEntity: 'Galaxy fixture',
        buyerLegalEntity: 'Khách fixture',
      },
    );
    const contractFilename = 'hop-dong-browser.txt';
    const contractFileText =
      'Hợp đồng browser gửi khách xem xét; chưa xác nhận chữ ký';
    async function uploadProjectFile(filename: string, text: string) {
      const form = new FormData();
      form.append('entityType', 'Project');
      form.append('entityId', project.id);
      form.append('category', 'PROJECT_DOCUMENT');
      form.append('file', new Blob([text], { type: 'text/plain' }), filename);
      const response = await fetch(`${api}/files`, {
        method: 'POST',
        headers: { Cookie: users.sender!.cookie },
        body: form,
      });
      if (!response.ok)
        throw new Error(`Fixture file upload ${response.status}`);
      return response.json() as Promise<{ id: string }>;
    }
    const contractFile = await uploadProjectFile(
      contractFilename,
      contractFileText,
    );
    for (const status of ['INTERNAL_REVIEW', 'SIGNED'])
      await domain(
        'sender',
        `/projects/${project.id}/contracts/${contract.id}/transition`,
        { status },
      );
    const recordedSignedFilename = 'ban-luu-ho-so-da-ky.txt';
    const recordedSignedFileText =
      'Bản lưu theo hồ sơ đã ký; trạng thái do người có quyền ghi nhận, không xác minh chữ ký.';
    const recordedSignedFile = await uploadProjectFile(
      recordedSignedFilename,
      recordedSignedFileText,
    );
    const schedules = await domain<{ id: string }[]>(
      'sender',
      `/projects/${project.id}/contracts/${contract.id}/payment-schedules`,
      {
        items: [
          {
            milestoneName: 'Khoản thu fixture',
            dueDate: '2027-01-01T00:00:00.000Z',
            amount: '120000',
            condition: 'Theo hợp đồng fixture',
          },
        ],
      },
    );
    const payment = await domain('sender', `/projects/${project.id}/payments`, {
      paymentDate: '2027-01-03T00:00:00.000Z',
      amount: '60000',
      currency: 'VND',
      paymentMethod: 'BANK_TRANSFER',
      idempotencyKey: randomUUID(),
      allocations: [{ scheduleId: schedules[0]!.id, amount: '60000' }],
    });
    const paymentFilename = 'chung-tu-khoan-thu-browser.txt';
    const paymentFileText =
      'Chứng từ khoản thu do nhân viên cung cấp; chưa xác nhận đối soát ngân hàng';
    const paymentFile = await uploadProjectFile(
      paymentFilename,
      paymentFileText,
    );
    const brand = await db.brand.create({
      data: { organizationId: org.id, name: `Site delivery ${run}` },
    });
    const product = await db.product.create({
      data: {
        organizationId: org.id,
        brandId: brand.id,
        productCode: `SITE-${run}`,
        name: 'Hàng giao fixture',
        unit: 'm',
      },
    });
    const item = await db.inventoryItem.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        productId: product.id,
        itemCode: `SITE-${run}`,
        unit: 'm',
      },
    });
    const warehouse = await db.warehouse.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        code: `SITE-${run}`,
        name: 'Kho fixture giao hàng',
        type: 'PROJECT',
        createdBy: users.sender!.id,
      },
    });
    const adjustment = await domain('sender', '/inventory/adjustments', {
      adjustmentNumber: `OPEN-${run}`,
      projectId: project.id,
      warehouseId: warehouse.id,
      reason: 'FOUND',
      explanation: 'Tồn đầu fixture tách biệt',
      lines: [
        {
          inventoryItemId: item.id,
          expectedQuantity: '0',
          actualQuantity: '2.125',
        },
      ],
    });
    await domain(
      'publisher',
      `/inventory/adjustments/${adjustment.id}/approve`,
      {},
    );
    await domain('sender', `/inventory/adjustments/${adjustment.id}/post`, {});
    const issue = await domain<{ id: string; lines: { id: string }[] }>(
      'sender',
      '/inventory/issues',
      {
        issueNumber: `SITE-${run}`,
        projectId: project.id,
        warehouseId: warehouse.id,
        reason: 'PROJECT_SITE',
        recipient: 'Nhân viên giao fixture',
        lines: [{ inventoryItemId: item.id, quantity: '2.125' }],
      },
    );
    await domain('publisher', `/inventory/issues/${issue.id}/approve`, {});
    await domain('sender', `/inventory/issues/${issue.id}/post`, {});
    const plan = await domain('sender', '/installation/plans', {
      projectId: project.id,
      planNumber: `SITE-${run}`,
      name: 'Ghi nhận giao tại công trường',
      siteReady: false,
      customerCoordination: false,
    });
    const workOrder = await domain(
      'sender',
      `/installation/plans/${plan.id}/work-orders`,
      {
        workOrderNumber: `SITE-${run}`,
        title: 'Giao hàng fixture, chưa lắp đặt',
        requiredInventory: true,
        approvedDrawing: false,
        checklist: [{ title: 'Kiểm tra công trường', required: true }],
      },
    );
    const deliveryFilename = 'giao-tai-cong-truong-browser.txt';
    const deliveryFileText =
      'Nhân viên ghi nhận giao tại công trường; không phải khách ký nghiệm thu';
    const deliveryFile = await uploadProjectFile(
      deliveryFilename,
      deliveryFileText,
    );
    const taskRole = await db.role.create({
      data: {
        organizationId: org.id,
        code: `task-${run}`,
        name: 'Task fixture reader',
        permissions: {
          create: { permission: { connect: { code: 'task.read' } } },
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: org.id,
        userId: users.manager!.id,
        roleId: taskRole.id,
        scopeType: 'SELF',
      },
    });
    await db.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: 'Task fixture nguồn chung',
        createdBy: users.manager!.id,
        updatedBy: users.manager!.id,
      },
    });
    return {
      revokeManagerTask: async () => {
        try {
          const [identity] = await db.$queryRaw<
            { database: string }[]
          >`SELECT current_database() AS database`;
          if (identity?.database !== target.databaseName)
            throw new Error('Fixture target mismatch');
          await db.userRole.updateMany({
            where: { userId: users.manager!.id, roleId: taskRole.id },
            data: { status: 'archived' },
          });
        } finally {
          await db.$disconnect();
        }
      },
      managerAuthorityId: managerAuthority.id!,
      revokePublisherSource: async () => {
        try {
          const [identity] = await db.$queryRaw<
            { database: string }[]
          >`SELECT current_database() AS database`;
          if (
            identity?.database !==
            `galaxy_os_g00_${process.env.G00_TEST_RUN_ID}`
          )
            throw new Error('Fixture target mismatch');
          await db.userRole.updateMany({
            where: { userId: users.publisher!.id, roleId: sourceRole.id },
            data: { status: 'archived' },
          });
        } finally {
          await db.$disconnect();
        }
      },
      sourceId: document.id,
      contractId: contract.id,
      contractFileId: contractFile.id,
      contractFilename,
      contractFileText,
      recordedSignedFileId: recordedSignedFile.id,
      recordedSignedFilename,
      recordedSignedFileText,
      paymentId: payment.id,
      paymentFileId: paymentFile.id,
      paymentFilename,
      paymentFileText,
      deliveryWorkOrderId: workOrder.id,
      deliveryStockIssueLineId: issue.lines[0]!.id,
      deliveryFileId: deliveryFile.id,
      deliveryFilename,
      deliveryFileText,
      projectId: project.id,
      roomId: internal.id!,
      guestRoomId: external.id!,
      senderGrantId: sender.id!,
      users,
      password,
    };
  } finally {
    await db.$disconnect();
  }
}
