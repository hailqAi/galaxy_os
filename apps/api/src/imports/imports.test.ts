import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { AuditService } from '../audit/audit.service';
import { FileStorage } from '../files/file-storage';
import { PrismaService } from '../prisma.service';
import {
  STAGE_TWO_PLAN_ENTITY,
  STAGE_TWO_PLAN_HEADERS,
} from '../projects/project-stage-two.dto';
import { importUploadLimits } from './imports.controller';
import { ImportMappingDto } from './imports.dto';
import {
  ImportsService,
  parseStageTwoWorkbook,
  assertBoundedWorkbook,
} from './imports.service';

const actor = {
  organizationId: 'organization',
  userId: 'user',
  organizationMembershipId: 'membership',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

const imports = (prisma: PrismaService) =>
  new ImportsService(
    prisma,
    {} as BusinessEntityPolicy,
    {} as FileStorage,
    {} as AuditService,
  );

describe('ImportsService', () => {
  it('bounds multipart metadata before buffering an import', () => {
    expect(importUploadLimits).toEqual({
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 1,
      fieldSize: 4 * 1024,
      parts: 2,
      headerPairs: 50,
    });
  });

  it('rejects mapping payloads with more than 100 entries', async () => {
    const dto = plainToInstance(ImportMappingDto, {
      mapping: Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [
          `source-${index}`,
          `target-${index}`,
        ]),
      ),
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires validation before confirmation', async () => {
    const job = {
      id: 'job',
      entityType: 'Customer',
      status: 'MAPPED',
      rows: [],
    };
    const prisma = {
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
          importJob: { findFirst: vi.fn().mockResolvedValue(job) },
        }),
      ),
    } as unknown as PrismaService;
    await expect(
      imports(prisma).confirm(
        {
          ...actor,
          permissions: ['import.confirm', 'crm.customer.create'],
        },
        'job',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('makes repeated confirmation idempotent', async () => {
    const completed = {
      id: 'job',
      entityType: 'Customer',
      status: 'COMPLETED',
      rows: [],
    };
    const transaction = vi.fn((work) =>
      work({
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
        importJob: { findFirst: vi.fn().mockResolvedValue(completed) },
      }),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;
    await expect(
      imports(prisma).confirm(
        {
          ...actor,
          permissions: ['import.confirm', 'crm.customer.create'],
        },
        'job',
      ),
    ).resolves.toBe(completed);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('rejects jobs from another organization', async () => {
    const prisma = {
      importJob: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(imports(prisma).get(actor, 'outside')).rejects.toThrow(
      'Import job not found',
    );
    expect(prisma.importJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'outside',
          organizationId: actor.organizationId,
          projectId: null,
          fileAssetId: null,
          entityType: { in: ['Customer', 'Contact', 'Lead', 'Project'] },
        },
      }),
    );
  });

  it('keeps Project-owned jobs out of the generic import API', async () => {
    const prisma = {
      importJob: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    await imports(prisma).list(actor);
    expect(prisma.importJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: actor.organizationId,
          projectId: null,
          fileAssetId: null,
          entityType: { in: ['Customer', 'Contact', 'Lead', 'Project'] },
        },
      }),
    );
  });
});

const workbook = async (
  headers: readonly string[] = STAGE_TWO_PLAN_HEADERS,
  rows: unknown[][] = [],
) => {
  const value = new ExcelJS.Workbook();
  const sheet = value.addWorksheet('Ke hoach');
  sheet.addRow([...headers]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await value.xlsx.writeBuffer());
};

const departments = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'DESIGN',
    name: 'Thiết kế',
  },
];

describe('Stage 2 XLSX parser', () => {
  it('returns independently normalized rows, row errors, and exact counts', async () => {
    const parsed = await parseStageTwoWorkbook(
      await workbook(undefined, [
        [
          'cv-01',
          'Công việc 1',
          'DESIGN',
          '2026-08-14',
          '2026-08-15',
          '1000.5',
        ],
        ['CV-01', 'Trùng mã', 'DESIGN', '2026-08-14', '2026-08-15', '200'],
        ['CV-03', 'Sai phòng', 'INACTIVE', '2026-08-16', '2026-08-15', 'x'],
        [
          'CV-04',
          'Công việc 4',
          'DESIGN',
          '2026-08-14',
          '2026-08-15',
          '1000.5',
        ],
      ]),
      departments,
      true,
    );
    expect(parsed.summary).toEqual({
      totalRows: 4,
      validRows: 1,
      invalidRows: 3,
    });
    expect(parsed.rows[0]!).toMatchObject({
      rowNumber: 2,
      status: 'INVALID',
      data: {
        code: 'CV-01',
        departmentId: departments[0]!.id,
        startDate: '2026-08-14',
        finishDate: '2026-08-15',
        allocatedBudget: '1000.50',
      },
    });
    expect(parsed.rows[1]!.errors.join(' ')).toMatch(/duplicate/i);
    expect(parsed.rows[2]!.errors.join(' ')).toMatch(/department|date|budget/i);
    expect(parsed.rows[3]!).toMatchObject({
      status: 'VALID',
      data: { code: 'CV-04', allocatedBudget: '1000.50' },
    });
  });

  it('omits allocated budget from every non-finance preview shape', async () => {
    const parsed = await parseStageTwoWorkbook(
      await workbook(undefined, [
        ['CV-01', 'Công việc', 'DESIGN', '2026-08-14', '2026-08-15', null],
      ]),
      departments,
      false,
    );
    expect(JSON.stringify(parsed)).not.toContain('allocatedBudget');
  });

  it('rejects a non-finance workbook containing an allocated budget', async () => {
    await expect(
      parseStageTwoWorkbook(
        await workbook(undefined, [
          ['CV-01', 'Công việc', 'DESIGN', '2026-08-14', '2026-08-15', '1'],
        ]),
        departments,
        false,
      ),
    ).rejects.toThrow('Financial permission is required');
  });

  it.each([
    [['Sai tiêu đề', ...STAGE_TWO_PLAN_HEADERS.slice(1)], 'headers'],
    [
      [...STAGE_TWO_PLAN_HEADERS.slice(0, 5), STAGE_TWO_PLAN_HEADERS[0]],
      'headers',
    ],
  ])('rejects malformed or duplicate %s', async (headers) => {
    await expect(
      parseStageTwoWorkbook(await workbook(headers), departments, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects formulas without evaluating cached results', async () => {
    await expect(
      parseStageTwoWorkbook(
        await workbook(undefined, [
          [
            'CV-01',
            { formula: 'HYPERLINK("https://invalid")', result: 'Công việc' },
            'DESIGN',
            '2026-08-14',
            '2026-08-15',
            null,
          ],
        ]),
        departments,
        true,
      ),
    ).rejects.toThrow('Formulas are not allowed');
  });

  it('rejects formulas in populated cells beyond the six import columns', async () => {
    await expect(
      parseStageTwoWorkbook(
        await workbook(undefined, [
          [
            'CV-01',
            'Công việc',
            'DESIGN',
            '2026-08-14',
            '2026-08-15',
            null,
            { formula: 'HYPERLINK("https://invalid")', result: 'ignored' },
          ],
        ]),
        departments,
        true,
      ),
    ).rejects.toThrow('Formulas are not allowed');
  });

  it('rejects numeric budget cells that cannot preserve Decimal cents', async () => {
    await expect(
      parseStageTwoWorkbook(
        await workbook(undefined, [
          [
            'CV-01',
            'Công việc',
            'DESIGN',
            '2026-08-14',
            '2026-08-15',
            Number('123456789012345678'),
          ],
        ]),
        departments,
        true,
      ),
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({
          status: 'INVALID',
          errors: expect.arrayContaining([
            expect.stringMatching(/allocated budget/i),
          ]),
        }),
      ],
    });
  });

  it('rejects workbooks beyond the 1,000-row parser bound', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => [
      `CV-${index}`,
      `Công việc ${index}`,
      'DESIGN',
      '2026-08-14',
      '2026-08-15',
      null,
    ]);
    const bytes = await workbook(undefined, rows);
    const load = vi.spyOn(
      Object.getPrototypeOf(new ExcelJS.Workbook().xlsx),
      'load',
    );
    try {
      await expect(
        parseStageTwoWorkbook(bytes, departments, true),
      ).rejects.toThrow('at most 1000 rows');
      expect(load).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it('rejects a sparse worksheet whose declared row range exceeds the bound', async () => {
    const value = new ExcelJS.Workbook();
    const sheet = value.addWorksheet('Ke hoach');
    sheet.addRow([...STAGE_TWO_PLAN_HEADERS]);
    sheet.getRow(100_000).height = 20;

    await expect(
      parseStageTwoWorkbook(
        Buffer.from(await value.xlsx.writeBuffer()),
        departments,
        true,
      ),
    ).rejects.toThrow('at most 1000 rows');
  });

  it('rejects excessive declared expanded workbook content before ExcelJS loads it', async () => {
    const bytes = await workbook(undefined, [
      ['CV-01', 'Công việc', 'DESIGN', '2026-08-14', '2026-08-15', null],
    ]);
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThanOrEqual(0);
    bytes.writeUInt32LE(33 * 1024 * 1024, central + 24);
    await expect(
      parseStageTwoWorkbook(bytes, departments, true),
    ).rejects.toThrow('expanded data');
  });

  it('applies the expanded-size bound to generic imports before ExcelJS loads them', async () => {
    const bytes = await workbook(undefined, [
      ['CV-01', 'Công việc', 'DESIGN', '2026-08-14', '2026-08-15', null],
    ]);
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(33 * 1024 * 1024, central + 24);

    const prisma = {
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: actor.organizationId }]),
          importJob: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'attempt' }),
          },
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      imports(prisma).create(
        {
          ...actor,
          permissions: ['import.create', 'project.create'],
        },
        { entityType: 'Project' },
        {
          size: bytes.length,
          originalname: 'bounded.xlsx',
          buffer: bytes,
        } as Express.Multer.File,
      ),
    ).rejects.toThrow('expanded data');
  });

  it('rejects an oversized shared string before generic ExcelJS parsing', async () => {
    const bytes = await workbook(['x'.repeat(64 * 1024 + 1)]);
    const read = vi.spyOn(
      Object.getPrototypeOf(new ExcelJS.Workbook().xlsx),
      'read',
    );
    const prisma = {
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: actor.organizationId }]),
          importJob: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'attempt' }),
          },
        }),
      ),
    } as unknown as PrismaService;

    try {
      await expect(
        imports(prisma).create(
          {
            ...actor,
            permissions: ['import.create', 'crm.customer.create'],
          },
          { entityType: 'Customer' },
          {
            size: bytes.length,
            originalname: 'customers.xlsx',
            buffer: bytes,
          } as Express.Multer.File,
        ),
      ).rejects.toThrow('shared string');
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('rejects excessive shared-string count before ExcelJS loads it', async () => {
    const value = new ExcelJS.Workbook();
    const sheet = value.addWorksheet('Import');
    let sequence = 0;
    for (let row = 0; row < 101; row++)
      sheet.addRow(Array.from({ length: 100 }, () => `value-${sequence++}`));
    const bytes = Buffer.from(await value.xlsx.writeBuffer());
    const load = vi.spyOn(
      Object.getPrototypeOf(new ExcelJS.Workbook().xlsx),
      'load',
    );

    try {
      await expect(
        parseStageTwoWorkbook(bytes, departments, true),
      ).rejects.toThrow('shared strings');
      expect(load).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it.each([
    ['cell', [{ formula: 'x'.repeat(64 * 1024 + 1), result: 'x' }]],
    [
      'row',
      Array.from(
        { length: 6 },
        (_, index) => `${index}-${'x'.repeat(48 * 1024)}`,
      ),
    ],
  ])(
    'rejects oversized serialized %s data before ExcelJS loads it',
    async (kind, row) => {
      const bytes = await workbook(undefined, [row]);
      const load = vi.spyOn(
        Object.getPrototypeOf(new ExcelJS.Workbook().xlsx),
        'load',
      );

      try {
        await expect(
          parseStageTwoWorkbook(bytes, departments, true),
        ).rejects.toThrow(`${kind} data`);
        expect(load).not.toHaveBeenCalled();
      } finally {
        load.mockRestore();
      }
    },
  );

  it('rejects repeated shared-string expansion before generic ExcelJS parsing', async () => {
    const repeated = 'x'.repeat(60 * 1024);
    const bytes = await workbook(
      Array.from({ length: 100 }, (_, index) => `column-${index}`),
      Array.from({ length: 1000 }, () => Array(100).fill(repeated)),
    );
    const read = vi.spyOn(
      Object.getPrototypeOf(new ExcelJS.Workbook().xlsx),
      'read',
    );
    const update = vi.fn();
    const service = imports({
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: actor.organizationId }]),
          importJob: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'attempt' }),
          },
        }),
      ),
      importJob: { update },
    } as unknown as PrismaService);

    try {
      await expect(
        service.create(
          {
            ...actor,
            permissions: ['import.create', 'crm.customer.create'],
          },
          { entityType: 'Customer' },
          {
            size: bytes.length,
            originalname: 'customers.xlsx',
            buffer: bytes,
          } as Express.Multer.File,
        ),
      ).rejects.toThrow('row data');
      expect(read).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('rejects aggregate decoded generic rows before persistence', async () => {
    const repeated = 'x'.repeat(40 * 1024);
    const bytes = await workbook(
      ['displayName'],
      Array.from({ length: 1000 }, () => [repeated]),
    );
    const read = vi.spyOn(
      Object.getPrototypeOf(new ExcelJS.Workbook().xlsx),
      'read',
    );
    const update = vi.fn();
    const service = imports({
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: actor.organizationId }]),
          importJob: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'attempt' }),
          },
        }),
      ),
      importJob: { update },
    } as unknown as PrismaService);

    try {
      await expect(
        service.create(
          {
            ...actor,
            permissions: ['import.create', 'crm.customer.create'],
          },
          { entityType: 'Customer' },
          {
            size: bytes.length,
            originalname: 'customers.xlsx',
            buffer: bytes,
          } as Express.Multer.File,
        ),
      ).rejects.toThrow('persisted row data');
      expect(read).toHaveBeenCalledOnce();
      expect(update).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it.each([
    ['more than 1000 rows', { row: 1002 }],
    ['more than 100 columns', { headers: 101 }],
    ['duplicate headers', { duplicate: true }],
    ['a header longer than 100 characters', { long: true }],
  ] as [
    string,
    { row?: number; headers?: number; duplicate?: boolean; long?: boolean },
  ][])('rejects generic workbooks with %s', async (_name, shape) => {
    const value = new ExcelJS.Workbook();
    const sheet = value.addWorksheet('Import');
    const headers = shape.headers
      ? Array.from({ length: shape.headers }, (_, index) => `column-${index}`)
      : shape.duplicate
        ? ['displayName', 'displayName']
        : [shape.long ? 'x'.repeat(101) : 'displayName'];
    sheet.addRow(headers);
    if (shape.row) sheet.getRow(shape.row).getCell(1).value = 'Customer';
    const bytes = Buffer.from(await value.xlsx.writeBuffer());
    const update = vi.fn().mockResolvedValue({ id: 'attempt' });
    const service = imports({
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: actor.organizationId }]),
          importJob: {
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue({ id: 'attempt' }),
          },
        }),
      ),
      importJob: { update },
    } as unknown as PrismaService);

    await expect(
      service.create(
        {
          ...actor,
          permissions: ['import.create', 'crm.customer.create'],
        },
        { entityType: 'Customer' },
        {
          size: bytes.length,
          originalname: 'customers.xlsx',
          buffer: bytes,
        } as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('Import admission and domain authorization', () => {
  it('requires the exact domain create permission before parsing a generic workbook', async () => {
    const bytes = await workbook(['displayName'], [['Customer']]);

    await expect(
      imports({} as PrismaService).create(
        { ...actor, permissions: ['import.create'] },
        { entityType: 'Customer' },
        {
          size: bytes.length,
          originalname: 'customers.xlsx',
          buffer: bytes,
        } as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shares one actor concurrency admission across generic and Stage 2 parsing', async () => {
    let release!: () => void;
    const gate = new Promise<{ id: string }>((resolve) => {
      release = () => resolve({ id: 'attempt' });
    });
    const transaction = vi.fn(() => gate);
    const service = imports({
      $transaction: transaction,
      project: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);
    const sharedActor = {
      ...actor,
      permissions: [
        'import.create',
        'crm.customer.create',
        'project.read',
        'file.read',
        'file.download',
      ],
    };
    const file = {
      size: 8,
      originalname: 'customers.xlsx',
      buffer: Buffer.from('not-xlsx'),
    } as Express.Multer.File;
    const first = service
      .create(sharedActor, { entityType: 'Customer' }, file)
      .catch((error) => error);
    const second = service
      .create(sharedActor, { entityType: 'Customer' }, file)
      .catch((error) => error);
    await vi.waitFor(() => expect(transaction).toHaveBeenCalledTimes(2));

    const third = service.previewStageTwoPlan(sharedActor, 'project', 'file');
    release();

    await expect(third).rejects.toMatchObject({ status: 429 });
    await Promise.all([first, second]);
  });

  it.each([
    [
      'more than 100 entries',
      Object.fromEntries([
        ['Name', 'displayName'],
        ...Array.from({ length: 100 }, (_, index) => [`source-${index}`, '']),
      ]),
      Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [
          index === 0 ? 'Name' : `source-${index - 1}`,
          'value',
        ]),
      ),
      'at most 100',
    ],
    [
      'a source outside the workbook headers',
      { Name: 'displayName', Ghost: 'email' },
      { Name: 'Customer', Alias: 'customer@example.test' },
      'source',
    ],
    [
      'a target outside the entity allowlist',
      { Name: 'displayName', Alias: 'ownerId' },
      { Name: 'Customer', Alias: 'user' },
      'target',
    ],
    [
      'duplicate non-empty targets',
      { Name: 'displayName', Alias: 'displayName' },
      { Name: 'Customer', Alias: 'Customer alias' },
      'unique',
    ],
  ])(
    'rejects mapping with %s before persistence',
    async (_case, mapping, rawData, message) => {
      const update = vi.fn();
      const job = {
        id: 'job',
        entityType: 'Customer',
        status: 'UPLOADED',
        rows: [{ id: 'row', rawData }],
      };
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
        importJob: { findFirst: vi.fn().mockResolvedValue(job), update },
      };
      const service = imports({
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService);

      await expect(
        service.map(
          {
            ...actor,
            permissions: ['import.create', 'crm.customer.create'],
          },
          'job',
          { mapping },
        ),
      ).rejects.toThrow(message);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('admits at most two concurrent Stage 2 previews for one actor', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const project = { findFirst: vi.fn(() => gate.then(() => ({ id: 'p' }))) };
    const service = new ImportsService(
      { project } as never,
      { projectWhere: vi.fn().mockReturnValue({}) } as never,
      {} as never,
      {} as never,
    );
    const previewActor = {
      ...actor,
      permissions: [
        'project.read',
        'import.create',
        'file.read',
        'file.download',
      ],
    };
    const first = service
      .previewStageTwoPlan(previewActor, 'project', 'file-1')
      .catch((error) => error);
    const second = service
      .previewStageTwoPlan(previewActor, 'project', 'file-2')
      .catch((error) => error);
    await vi.waitFor(() => expect(project.findFirst).toHaveBeenCalledTimes(2));
    const third = service.previewStageTwoPlan(
      previewActor,
      'project',
      'file-3',
    );
    release();

    await expect(third).rejects.toMatchObject({ status: 429 });
    await Promise.all([first, second]);
  });

  it('rejects another recent Stage 2 preview once the per-actor Project cap is reached', async () => {
    const download = vi.fn();
    const count = vi.fn().mockResolvedValue(10);
    const service = new ImportsService(
      {
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
        importJob: { count },
      } as never,
      { projectWhere: vi.fn().mockReturnValue({}) } as never,
      { download } as never,
      {} as never,
    );

    await expect(
      service.previewStageTwoPlan(
        {
          ...actor,
          permissions: [
            'project.read',
            'import.create',
            'file.read',
            'file.download',
          ],
        },
        'project',
        'file',
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(download).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: actor.organizationId,
        uploadedById: actor.userId,
        entityType: STAGE_TWO_PLAN_ENTITY,
      }),
    });
    expect(count.mock.calls[0]?.[0]?.where).not.toHaveProperty('projectId');
  });

  it('counts failed Stage 2 parses and rejects the eleventh before reading bytes', async () => {
    let attempts = 0;
    const create = vi.fn(async () => ({ id: `attempt-${++attempts}` }));
    const count = vi.fn(async () => attempts);
    const stream = vi.fn(async () => Readable.from(Buffer.from('not-xlsx')));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      importJob: { count, create },
    };
    const service = new ImportsService(
      {
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
        importJob: { count, update: vi.fn() },
        department: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn((work) => work(tx)),
      } as never,
      { projectWhere: vi.fn().mockReturnValue({}) } as never,
      { stream } as never,
      {} as never,
    );
    vi.spyOn(service as never, 'stageTwoPlanFile').mockResolvedValue({
      id: 'file',
      originalFilename: 'plan.xlsx',
      sizeBytes: 8n,
      storageKey: 'organization/plan.xlsx',
    });
    const previewActor = {
      ...actor,
      permissions: [
        'project.read',
        'import.create',
        'file.read',
        'file.download',
      ],
    };

    for (let index = 0; index < 10; index++)
      await expect(
        service.previewStageTwoPlan(previewActor, 'project', 'file'),
      ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.previewStageTwoPlan(previewActor, 'project', 'file'),
    ).rejects.toMatchObject({ status: 429 });
    expect(create).toHaveBeenCalledTimes(10);
    expect(stream).toHaveBeenCalledTimes(10);
  });

  it('does not confirm a Stage 2 import after membership is removed while waiting for the Project lock', async () => {
    const requiredPermissions = [
      'project.read',
      'import.confirm',
      'task.create',
      'file.read',
      'file.download',
    ];
    const confirmingActor = {
      ...actor,
      permissions: requiredPermissions,
      administrationScope: 'SELF' as const,
      administrationTier: 0,
    };
    let membershipActive = true;
    const taskCreate = vi.fn().mockResolvedValue({ id: 'task' });
    const importUpdate = vi.fn();
    const tx = {
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'locked' }];
      }),
      importJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'job',
          status: 'VALIDATED',
          fileAssetId: 'file',
          importedRows: 0,
          skippedRows: 0,
          rows: [
            {
              id: 'row',
              status: 'VALID',
              normalizedData: {
                code: 'CV-01',
                description: 'Công việc',
                departmentId: departments[0]!.id,
                startDate: '2026-08-14',
                finishDate: '2026-08-15',
              },
            },
          ],
        }),
        update: importUpdate,
      },
      department: { count: vi.fn().mockResolvedValue(1) },
      task: {
        count: vi.fn().mockResolvedValue(0),
        create: taskCreate,
      },
      importRow: { update: vi.fn() },
      activity: { create: vi.fn() },
    };
    const projectWhere = vi.fn().mockReturnValue({
      members: { some: { userId: confirmingActor.userId } },
    });
    const service = new ImportsService(
      {
        project: {
          findFirst: vi.fn(async () =>
            membershipActive ? { id: 'project' } : null,
          ),
        },
        $transaction: vi.fn((run) => run(tx)),
      } as never,
      { projectWhere } as never,
      {} as never,
      { write: vi.fn() } as never,
    );
    vi.spyOn(service as never, 'stageTwoPlanFile').mockResolvedValue({
      id: 'file',
    });

    await expect(
      service.confirmStageTwoPlan(confirmingActor, 'project', 'job'),
    ).rejects.toThrow('Project not found');
    expect(taskCreate).not.toHaveBeenCalled();
    expect(importUpdate).not.toHaveBeenCalled();
    expect(projectWhere).toHaveBeenLastCalledWith(
      confirmingActor,
      requiredPermissions,
    );
  });

  it('does not persist aggregate invalid Stage 2 cell values', async () => {
    const repeated = 'x'.repeat(40 * 1024);
    const bytes = await workbook(
      undefined,
      Array.from({ length: 1000 }, (_, index) => [
        `CV-${index}`,
        repeated,
        'DESIGN',
        '2026-08-14',
        '2026-08-15',
        null,
      ]),
    );
    const update = vi.fn();
    const count = vi.fn().mockResolvedValue(0);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      importJob: {
        count,
        create: vi.fn().mockResolvedValue({ id: 'attempt' }),
      },
    };
    const service = new ImportsService(
      {
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
        importJob: { count, update },
        department: { findMany: vi.fn().mockResolvedValue(departments) },
        $transaction: vi.fn((work) => work(tx)),
      } as never,
      { projectWhere: vi.fn().mockReturnValue({}) } as never,
      { stream: vi.fn(async () => Readable.from(bytes)) } as never,
      {} as never,
    );
    vi.spyOn(service as never, 'stageTwoPlanFile').mockResolvedValue({
      id: 'file',
      originalFilename: 'plan.xlsx',
      sizeBytes: BigInt(bytes.length),
      storageKey: 'organization/plan.xlsx',
    });

    await expect(
      service.previewStageTwoPlan(
        {
          ...actor,
          permissions: [
            'project.read',
            'import.create',
            'file.read',
            'file.download',
          ],
        },
        'project',
        'file',
      ),
    ).rejects.toThrow('persisted row data');
    expect(update).not.toHaveBeenCalled();
  });

  it('counts failed generic parses and rejects the eleventh before parsing', async () => {
    let attempts = 0;
    const create = vi.fn(async () => ({ id: `attempt-${++attempts}` }));
    const count = vi.fn(async () => attempts);
    const service = imports({
      $transaction: vi.fn((work) =>
        work({
          $queryRaw: vi.fn().mockResolvedValue([{ id: actor.organizationId }]),
          importJob: { count, create },
        }),
      ),
    } as unknown as PrismaService);
    const importActor = {
      ...actor,
      permissions: ['import.create', 'project.create'],
    };
    const file = {
      size: 8,
      originalname: 'projects.xlsx',
      buffer: Buffer.from('not-xlsx'),
    } as Express.Multer.File;

    for (let index = 0; index < 10; index++)
      await expect(
        service.create(importActor, { entityType: 'Project' }, file),
      ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(importActor, { entityType: 'Project' }, file),
    ).rejects.toMatchObject({ status: 429 });
    expect(create).toHaveBeenCalledTimes(10);
  });

  it('rejects a Project import whose customer belongs to another organization', async () => {
    const job = {
      id: 'job',
      entityType: 'Project',
      status: 'VALIDATED',
      rows: [
        {
          id: 'row',
          status: 'VALID',
          normalizedData: {
            code: 'P-1',
            name: 'Project',
            customerId: 'outside-customer',
          },
        },
      ],
    };
    const projectCreate = vi.fn().mockResolvedValue({ id: 'project' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
      importJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        update: vi.fn(),
      },
      customer: { count: vi.fn().mockResolvedValue(0) },
      project: { create: projectCreate },
      importRow: { update: vi.fn() },
    };
    const service = imports({
      importJob: { findFirst: vi.fn().mockResolvedValue(job) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService);

    await expect(
      service.confirm(
        {
          ...actor,
          permissions: ['import.confirm', 'project.create'],
        },
        'job',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it('serializes concurrent generic confirmation and creates each row once', async () => {
    let status = 'VALIDATED';
    const job = () => ({
      id: 'job',
      entityType: 'Customer',
      status,
      rows: [
        {
          id: 'row',
          status: 'VALID',
          normalizedData: { displayName: 'Customer' },
        },
      ],
    });
    const customerCreate = vi.fn().mockResolvedValue({ id: 'customer' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
      importJob: {
        findFirst: vi.fn(() => Promise.resolve(job())),
        update: vi.fn(async () => {
          status = 'COMPLETED';
          return job();
        }),
      },
      customer: { create: customerCreate },
      importRow: { update: vi.fn() },
    };
    let queue = Promise.resolve();
    const transaction = vi.fn((work: (client: typeof tx) => unknown) => {
      const result = queue.then(() => work(tx));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    });
    const service = imports({
      importJob: { findFirst: vi.fn(() => Promise.resolve(job())) },
      $transaction: transaction,
    } as unknown as PrismaService);
    const confirmingActor = {
      ...actor,
      permissions: ['import.confirm', 'crm.customer.create'],
    };

    await Promise.all([
      service.confirm(confirmingActor, 'job'),
      service.confirm(confirmingActor, 'job'),
    ]);

    expect(customerCreate).toHaveBeenCalledOnce();
  });

  it('never moves a completed generic import back to MAPPED or VALIDATED', async () => {
    const completed = {
      id: 'job',
      entityType: 'Customer',
      status: 'COMPLETED',
      mapping: { Name: 'displayName' },
      rows: [
        {
          id: 'row',
          status: 'IMPORTED',
          rawData: { Name: 'Customer' },
          normalizedData: { displayName: 'Customer' },
        },
      ],
    };
    const update = vi.fn();
    const rowUpdate = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
      importJob: {
        findFirst: vi.fn().mockResolvedValue(completed),
        update,
      },
      importRow: { update: rowUpdate },
    };
    const service = imports({
      importJob: {
        findFirst: vi.fn().mockResolvedValue(completed),
        update,
      },
      importRow: { update: rowUpdate },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService);
    const importActor = {
      ...actor,
      permissions: ['import.create', 'crm.customer.create'],
    };

    await expect(
      service.map(importActor, 'job', {
        mapping: { Name: 'displayName' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.validate(importActor, 'job')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(update).not.toHaveBeenCalled();
    expect(rowUpdate).not.toHaveBeenCalled();
  });

  it('does not let mapping race a confirmation back out of COMPLETED', async () => {
    let status = 'VALIDATED';
    const job = () => ({
      id: 'job',
      entityType: 'Customer',
      status,
      mapping: { Name: 'displayName' },
      rows: [
        {
          id: 'row',
          status: status === 'COMPLETED' ? 'IMPORTED' : 'VALID',
          rawData: { Name: 'Customer' },
          normalizedData: { displayName: 'Customer' },
        },
      ],
    });
    const customerCreate = vi.fn().mockResolvedValue({ id: 'customer' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'job' }]),
      importJob: {
        findFirst: vi.fn(() => Promise.resolve(job())),
        update: vi.fn(async ({ data }) => {
          status = data.status;
          return job();
        }),
      },
      importRow: { update: vi.fn() },
      customer: { create: customerCreate },
    };
    let queue = Promise.resolve();
    const service = imports({
      importJob: {
        findFirst: vi.fn(() => Promise.resolve(job())),
        update: vi.fn(async ({ data }) => {
          status = data.status;
          return job();
        }),
      },
      $transaction: vi.fn((work: (client: typeof tx) => unknown) => {
        const result = queue.then(() => work(tx));
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      }),
    } as unknown as PrismaService);
    const importActor = {
      ...actor,
      permissions: ['import.create', 'import.confirm', 'crm.customer.create'],
    };

    const [confirm, remap] = await Promise.allSettled([
      service.confirm(importActor, 'job'),
      service.map(importActor, 'job', {
        mapping: { Name: 'displayName' },
      }),
    ]);

    expect(confirm.status).toBe('fulfilled');
    expect(remap.status).toBe('rejected');
    expect(status).toBe('COMPLETED');
    expect(customerCreate).toHaveBeenCalledOnce();
  });
});

describe('prefixed OOXML workbook bounds', () => {
  const original = () =>
    readFileSync(
      join(__dirname, '../../test/fixtures/e05-work-generated.xlsx'),
    );

  it('accepts the unchanged actual Work workbook with namespace-prefixed elements', () => {
    expect(assertBoundedWorkbook(original())).toBe(1);
  });

  it.each([
    [
      'row',
      '<x:row r="1002"><x:c r="A1002"><x:v>1</x:v></x:c></x:row>',
      'rows',
    ],
    [
      'column',
      '<x:row r="1"><x:c r="XFD1"><x:v>1</x:v></x:c></x:row>',
      'columns',
    ],
    [
      'cell',
      '<x:row r="1"><x:c r="A1"><x:f>' +
        'x'.repeat(65537) +
        '</x:f></x:c></x:row>',
      'cell data',
    ],
    [
      'string index',
      '<x:row r="1"><x:c r="A1" t="s"><x:v>9999</x:v></x:c></x:row>',
      'shared strings',
    ],
  ])('retains %s bounds for prefixed cells', async (_kind, rows, error) => {
    const zip = await JSZip.loadAsync(original());
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
        rows +
        '</x:sheetData></x:worksheet>',
    );
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    expect(() => assertBoundedWorkbook(bytes)).toThrow(error);
  });

  it('retains the row byte limit when valid prefixed shared-string references expand', async () => {
    const zip = await JSZip.loadAsync(original());
    zip.file(
      'xl/sharedStrings.xml',
      '<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>' +
        'x'.repeat(64000) +
        '</x:t></x:si></x:sst>',
    );
    const cells = ['A1', 'B1', 'C1', 'D1', 'E1']
      .map((address) => '<x:c r="' + address + '" t="s"><x:v>0</x:v></x:c>')
      .join('');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1">' +
        cells +
        '</x:row></x:sheetData></x:worksheet>',
    );
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    expect(() => assertBoundedWorkbook(bytes)).toThrow('row data');
  });

  it('retains the shared-string byte limit with prefixed strings', async () => {
    const zip = await JSZip.loadAsync(original());
    zip.file(
      'xl/sharedStrings.xml',
      '<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>' +
        'x'.repeat(65537) +
        '</x:t></x:si></x:sst>',
    );
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    expect(() => assertBoundedWorkbook(bytes)).toThrow('shared string data');
  });
});
