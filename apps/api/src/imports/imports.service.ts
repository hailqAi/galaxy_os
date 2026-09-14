import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { inflateRawSync } from 'node:zlib';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import {
  DECIMAL_20_2,
  ISO_DATE,
  STAGE_TWO_BASELINE_VERSION,
  STAGE_TWO_PLAN_ENTITY,
  STAGE_TWO_PLAN_HEADERS,
  STAGE_TWO_PLAN_MAX_BYTES,
  STAGE_TWO_PLAN_MAX_ROWS,
  type StageTwoPlanRowInput,
} from '../projects/project-stage-two.dto';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { FileStorage } from '../files/file-storage';
import {
  hiddenStageOneFinanceFileIds,
  type ProjectFileClient,
} from '../files/project-file';
import { AuditService } from '../audit/audit.service';
import {
  CreateImportDto,
  ImportMappingDto,
  MAX_IMPORT_MAPPING_ENTRIES,
} from './imports.dto';

type StageTwoDepartment = { id: string; code: string; name: string };
type StageTwoPreviewRow = {
  rowNumber: number;
  status: 'VALID' | 'INVALID';
  data: StageTwoPlanRowInput | Omit<StageTwoPlanRowInput, 'allocatedBudget'>;
  errors: string[];
};

const formula = (value: ExcelJS.CellValue) =>
  Boolean(value && typeof value === 'object' && 'formula' in value);

const text = (value: ExcelJS.CellValue) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text).trim();
    if ('richText' in value)
      return value.richText
        .map(({ text: part }) => part)
        .join('')
        .trim();
    return '';
  }
  return String(value).trim();
};

const date = (value: ExcelJS.CellValue) => {
  const candidate = text(value);
  if (!ISO_DATE.test(candidate)) return null;
  const [year, month, day] = candidate.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
};

const money = (value: ExcelJS.CellValue) => {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)
  )
    return null;
  const candidate = text(value);
  if (!candidate) return undefined;
  if (!DECIMAL_20_2.test(candidate)) return null;
  try {
    return new Prisma.Decimal(candidate).toFixed(2);
  } catch {
    return null;
  }
};

const maximumExpandedWorkbookBytes = 32 * 1024 * 1024;
const maximumWorkbookEntries = 2048;
const maximumGenericImportRows = 1000;
const maximumGenericImportColumns = MAX_IMPORT_MAPPING_ENTRIES;
const maximumGenericHeaderLength = 100;
const maximumSharedStrings = 10_000;
const maximumSharedStringBytes = 64 * 1024;
const maximumSerializedCellBytes = 64 * 1024;
const maximumSerializedRowBytes = 256 * 1024;
const maximumPersistedImportRowsBytes = maximumExpandedWorkbookBytes;
const maximumWorkbookCells =
  (maximumGenericImportRows + 1) * maximumGenericImportColumns;
const zipSignature = {
  central: 0x02014b50,
  end: 0x06054b50,
  local: 0x04034b50,
} as const;

const columnNumber = (letters: string) =>
  [...letters.toUpperCase()].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );

function addPersistedRowBytes(total: number, row: object) {
  const next = total + Buffer.byteLength(JSON.stringify(row));
  if (next > maximumPersistedImportRowsBytes)
    throw new BadRequestException('Workbook persisted row data is too large');
  return next;
}

function worksheetSize(
  xmlBytes: Buffer,
  maximumRows: number,
  sharedStringBytes: readonly number[],
) {
  const xml = xmlBytes.toString('utf8');
  let rows = 0;
  for (const match of xml.matchAll(/<row(?=[\s/>])[^>]*>/g)) {
    rows++;
    const reference = /\br="(\d+)"/.exec(match[0]);
    if (rows > maximumRows || Number(reference?.[1] ?? rows) > maximumRows)
      throw new BadRequestException(
        `Workbook accepts at most ${maximumRows - 1} rows`,
      );
  }
  for (const match of xml.matchAll(
    /<row(?=[\s/>])(?:[^>]*\/>|[\s\S]*?<\/row>)/g,
  )) {
    let rowBytes = Buffer.byteLength(match[0]);
    for (const cell of match[0].matchAll(
      /<c(?=[\s/>])(?:[^>]*\/>|[\s\S]*?<\/c>)/g,
    )) {
      const serializedCellBytes = Buffer.byteLength(cell[0]);
      const opening = /^<c(?=[\s/>])[^>]*>/.exec(cell[0])?.[0] ?? '';
      const shared = /\bt=(?:"s"|'s')/.test(opening);
      const index = shared
        ? Number(/<v>\s*(\d+)\s*<\/v>/.exec(cell[0])?.[1])
        : undefined;
      const valueBytes = shared ? sharedStringBytes[index!] : undefined;
      if (shared && (!Number.isSafeInteger(index) || valueBytes === undefined))
        throw new BadRequestException('Workbook shared strings are invalid');
      if ((valueBytes ?? serializedCellBytes) > maximumSerializedCellBytes)
        throw new BadRequestException('Workbook cell data is too large');
      rowBytes += valueBytes ?? 0;
    }
    if (rowBytes > maximumSerializedRowBytes)
      throw new BadRequestException('Workbook row data is too large');
  }
  let cells = 0;
  for (const match of xml.matchAll(/<c(?=[\s/>])[^>]*>/g)) {
    cells++;
    const reference = /\br="([A-Z]+)(\d+)"/i.exec(match[0]);
    if (reference && Number(reference[2]) > maximumRows)
      throw new BadRequestException(
        `Workbook accepts at most ${maximumRows - 1} rows`,
      );
    if (reference && columnNumber(reference[1]!) > maximumGenericImportColumns)
      throw new BadRequestException(
        `Workbook accepts at most ${maximumGenericImportColumns} columns`,
      );
  }
  return { rows, cells };
}

function sharedStringSizes(xmlBytes: Buffer) {
  const xml = xmlBytes.toString('utf8');
  const root = /<sst(?=[\s/>])[^>]*>/.exec(xml)?.[0];
  if (!root)
    throw new BadRequestException('Workbook shared strings are invalid');
  const count = /\bcount="(\d+)"/.exec(root)?.[1];
  const uniqueCount = /\buniqueCount="(\d+)"/.exec(root)?.[1];
  if (
    (count && Number(count) > maximumWorkbookCells) ||
    (uniqueCount && Number(uniqueCount) > maximumSharedStrings)
  )
    throw new BadRequestException('Workbook has too many shared strings');
  const sizes: number[] = [];
  for (const match of xml.matchAll(/<si(?=[\s/>])/g)) {
    if (sizes.length >= maximumSharedStrings)
      throw new BadRequestException('Workbook has too many shared strings');
    const end = xml.indexOf('</si>', match.index);
    if (end < 0)
      throw new BadRequestException('Workbook shared strings are invalid');
    const size = Buffer.byteLength(
      xml.slice(match.index, end + '</si>'.length),
    );
    if (size > maximumSharedStringBytes)
      throw new BadRequestException('Workbook shared string data is too large');
    sizes.push(size);
  }
  return sizes;
}

function assertBoundedWorkbook(bytes: Buffer) {
  if (bytes.length < 22)
    throw new BadRequestException('Invalid Excel workbook');
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65_557);
    offset--
  )
    if (
      bytes.readUInt32LE(offset) === zipSignature.end &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  if (end < 0) throw new BadRequestException('Invalid Excel workbook');
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  if (
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0 ||
    bytes.readUInt16LE(end + 8) !== entries ||
    !entries ||
    entries > maximumWorkbookEntries ||
    centralSize > 1024 * 1024 ||
    centralOffset + centralSize !== end
  )
    throw new BadRequestException('Invalid Excel workbook');
  let cursor = centralOffset;
  let expanded = 0;
  const sharedStringBytes: number[] = [];
  const worksheets: Buffer[] = [];
  for (let entry = 0; entry < entries; entry++) {
    if (
      cursor + 46 > end ||
      bytes.readUInt32LE(cursor) !== zipSignature.central
    )
      throw new BadRequestException('Invalid Excel workbook');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const declaredSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const entryLength = 46 + nameLength + extraLength + commentLength;
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8');
    if (
      cursor + entryLength > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      disk !== 0 ||
      compressedSize === 0xffffffff ||
      declaredSize === 0xffffffff ||
      declaredSize > maximumExpandedWorkbookBytes ||
      localOffset + 30 > centralOffset ||
      bytes.readUInt32LE(localOffset) !== zipSignature.local
    )
      throw new BadRequestException(
        'Workbook expanded data is invalid or too large',
      );
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > centralOffset)
      throw new BadRequestException('Invalid Excel workbook');
    try {
      const content =
        method === 0
          ? bytes.subarray(dataOffset, dataOffset + compressedSize)
          : inflateRawSync(
              bytes.subarray(dataOffset, dataOffset + compressedSize),
              {
                maxOutputLength: maximumExpandedWorkbookBytes - expanded,
              },
            );
      expanded += content.length;
      if (
        content.length !== declaredSize ||
        expanded > maximumExpandedWorkbookBytes
      )
        throw new Error('expanded workbook mismatch');
      if (/^xl\/sharedStrings\.xml$/i.test(name)) {
        sharedStringBytes.push(...sharedStringSizes(content));
        if (sharedStringBytes.length > maximumSharedStrings)
          throw new BadRequestException('Workbook has too many shared strings');
      } else if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
        worksheets.push(content);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Workbook expanded data is invalid or too large',
      );
    }
    cursor += entryLength;
  }
  if (cursor !== end) throw new BadRequestException('Invalid Excel workbook');
  let worksheetRows = 0;
  let worksheetCells = 0;
  for (const worksheet of worksheets) {
    const size = worksheetSize(
      worksheet,
      maximumGenericImportRows + 1,
      sharedStringBytes,
    );
    worksheetRows += size.rows;
    worksheetCells += size.cells;
    if (worksheetRows > maximumGenericImportRows + 1)
      throw new BadRequestException(
        `Workbook accepts at most ${maximumGenericImportRows} rows`,
      );
    if (worksheetCells > maximumWorkbookCells)
      throw new BadRequestException(
        `Workbook accepts at most ${maximumGenericImportColumns} columns`,
      );
  }
}

export async function parseStageTwoWorkbook(
  bytes: Buffer,
  departments: readonly StageTwoDepartment[],
  finance: boolean,
) {
  if (!bytes.length || bytes.length > STAGE_TWO_PLAN_MAX_BYTES)
    throw new BadRequestException('Workbook must be between 1 byte and 5 MB');
  assertBoundedWorkbook(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new BadRequestException('Invalid Excel workbook');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('Workbook is empty');
  if (sheet.rowCount > STAGE_TWO_PLAN_MAX_ROWS + 1)
    throw new BadRequestException('Workbook accepts at most 1000 rows');
  const headerRow = sheet.getRow(1);
  if (
    Array.from({ length: Math.max(headerRow.cellCount, 6) }, (_, index) =>
      formula(headerRow.getCell(index + 1).value),
    ).some(Boolean)
  )
    throw new BadRequestException('Formulas are not allowed');
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
    text(headerRow.getCell(index + 1).value),
  );
  if (
    headers.length !== STAGE_TWO_PLAN_HEADERS.length ||
    headers.some((header, index) => header !== STAGE_TWO_PLAN_HEADERS[index]) ||
    new Set(headers).size !== headers.length
  )
    throw new BadRequestException('Workbook headers are invalid');
  const populatedRows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;
    if (
      Array.from({ length: row.cellCount }, (_, index) =>
        formula(row.getCell(index + 1).value),
      ).some(Boolean)
    )
      throw new BadRequestException('Formulas are not allowed');
    populatedRows.push({ rowNumber, row });
  }
  if (populatedRows.length > STAGE_TWO_PLAN_MAX_ROWS)
    throw new BadRequestException('Workbook accepts at most 1000 rows');

  const departmentByValue = new Map<string, StageTwoDepartment>();
  for (const department of departments)
    for (const value of [department.id, department.code])
      departmentByValue.set(value.trim().toLocaleLowerCase('vi'), department);

  let persistedRowsBytes = 0;
  const rows: StageTwoPreviewRow[] = populatedRows.map(({ rowNumber, row }) => {
    const code = text(row.getCell(1).value).toUpperCase();
    const description = text(row.getCell(2).value);
    const department = departmentByValue.get(
      text(row.getCell(3).value).toLocaleLowerCase('vi'),
    );
    const startDate = date(row.getCell(4).value);
    const finishDate = date(row.getCell(5).value);
    const allocatedBudget = money(row.getCell(6).value);
    if (!finance && allocatedBudget !== undefined)
      throw new ForbiddenException('Financial permission is required');
    const errors: string[] = [];
    if (!code || code.length > 100 || !/^[\p{L}\p{N}._/-]+$/u.test(code))
      errors.push('code is invalid');
    if (!description || description.length > 300)
      errors.push('description is invalid');
    if (!department) errors.push('department is not active');
    if (!startDate) errors.push('start date is invalid');
    if (!finishDate) errors.push('finish date is invalid');
    if (startDate && finishDate && startDate > finishDate)
      errors.push('finish date must not precede start date');
    if (allocatedBudget === null) errors.push('allocated budget is invalid');
    const data = {
      code,
      description,
      departmentId: department?.id ?? '',
      startDate: startDate ?? '',
      finishDate: finishDate ?? '',
      ...(finance && allocatedBudget !== undefined && { allocatedBudget }),
    };
    const previewRow: StageTwoPreviewRow = {
      rowNumber,
      status: errors.length ? 'INVALID' : 'VALID',
      data,
      errors,
    };
    persistedRowsBytes = addPersistedRowBytes(persistedRowsBytes, {
      rowNumber,
      rawData: data,
      normalizedData: data,
      status: previewRow.status,
      errors,
    });
    return previewRow;
  });
  const counts = new Map<string, number>();
  for (const { data } of rows)
    if (data.code) counts.set(data.code, (counts.get(data.code) ?? 0) + 1);
  for (const row of rows)
    if ((counts.get(row.data.code) ?? 0) > 1) {
      row.errors.push('duplicate code in workbook');
      row.status = 'INVALID';
    }
  return {
    rows,
    summary: {
      totalRows: rows.length,
      validRows: rows.filter(({ status }) => status === 'VALID').length,
      invalidRows: rows.filter(({ status }) => status === 'INVALID').length,
    },
  };
}

const required: Record<string, string[]> = {
  Customer: ['displayName'],
  Contact: ['customerId', 'firstName'],
  Lead: ['name'],
  Project: ['code', 'name', 'customerId'],
};
const allowed: Record<string, readonly string[]> = {
  Customer: ['displayName', 'type', 'email', 'phone'],
  Contact: ['customerId', 'firstName', 'lastName', 'email', 'phone'],
  Lead: ['name', 'companyName', 'email', 'phone'],
  Project: ['code', 'name', 'customerId'],
};
const createPermission: Record<string, string> = {
  Customer: 'crm.customer.create',
  Contact: 'crm.contact.create',
  Lead: 'crm.lead.create',
  Project: 'project.create',
};
const maximumConcurrentWorkbookParses = 4;
const maximumActorWorkbookParses = 2;
const maximumRecentImportAttempts = 10;
const recentImportAttemptWindowMs = 60 * 60 * 1000;

@Injectable()
export class ImportsService {
  private activeWorkbookParses = 0;
  private readonly activeWorkbookParsesByActor = new Map<string, number>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly policy: BusinessEntityPolicy,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private require(actor: CurrentActor, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Insufficient permission');
  }

  private requireCreatePermission(actor: CurrentActor, entityType: string) {
    const permission = createPermission[entityType];
    if (!permission) throw new BadRequestException('Unsupported import type');
    this.require(actor, permission);
  }

  private hasProjectPermissions(
    actor: CurrentActor,
    projectId: string,
    permissions: string | readonly string[],
    db?: Pick<Prisma.TransactionClient, 'project'>,
  ) {
    const required = Array.isArray(permissions) ? permissions : [permissions];
    if (!required.every((permission) => actor.permissions.includes(permission)))
      return Promise.resolve(false);
    if (actor.permissionSources === undefined) return Promise.resolve(true);
    return this.policy.hasProjectPermissions(actor, projectId, required, db);
  }

  private async withWorkbookAdmission<T>(
    actor: CurrentActor,
    work: () => Promise<T>,
  ) {
    const actorActive = this.activeWorkbookParsesByActor.get(actor.userId) ?? 0;
    if (
      this.activeWorkbookParses >= maximumConcurrentWorkbookParses ||
      actorActive >= maximumActorWorkbookParses
    )
      throw new HttpException(
        'Too many concurrent workbook parses',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.activeWorkbookParses += 1;
    this.activeWorkbookParsesByActor.set(actor.userId, actorActive + 1);
    try {
      return await work();
    } finally {
      this.activeWorkbookParses -= 1;
      const remaining =
        (this.activeWorkbookParsesByActor.get(actor.userId) ?? 1) - 1;
      if (remaining)
        this.activeWorkbookParsesByActor.set(actor.userId, remaining);
      else this.activeWorkbookParsesByActor.delete(actor.userId);
    }
  }

  private async assertImportAttemptCapacity(
    client: Pick<Prisma.TransactionClient, 'importJob'>,
    actor: CurrentActor,
    projectId: string | null,
    entityType: string,
  ) {
    const stageTwo = entityType === STAGE_TWO_PLAN_ENTITY;
    const count = await client.importJob.count({
      where: {
        organizationId: actor.organizationId,
        uploadedById: actor.userId,
        ...(stageTwo
          ? { entityType: STAGE_TWO_PLAN_ENTITY }
          : {
              projectId,
              entityType: { in: Object.keys(required) },
            }),
        createdAt: {
          gte: new Date(Date.now() - recentImportAttemptWindowMs),
        },
      },
    });
    if (count >= maximumRecentImportAttempts)
      throw new HttpException(
        'Too many recent workbook import attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  private reserveImportAttempt(
    actor: CurrentActor,
    input: {
      entityType: string;
      fileAssetId?: string;
      filename: string;
      projectId?: string;
    },
  ) {
    const projectId = input.projectId ?? null;
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Organization"
        WHERE "id" = ${actor.organizationId}::uuid
        FOR UPDATE
      `);
      if (!organization.length)
        throw new NotFoundException('Organization not found');
      if (projectId) {
        const project = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "Project"
          WHERE "id" = ${projectId}::uuid
            AND "organizationId" = ${actor.organizationId}::uuid
            AND "deletedAt" IS NULL
          FOR UPDATE
        `);
        if (!project.length) throw new NotFoundException('Project not found');
      }
      await this.assertImportAttemptCapacity(
        tx,
        actor,
        projectId,
        input.entityType,
      );
      return tx.importJob.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          fileAssetId: input.fileAssetId,
          entityType: input.entityType,
          status: 'FAILED',
          filename: input.filename.replace(/[^\p{L}\p{N}._ -]/gu, '_'),
          uploadedById: actor.userId,
        },
        select: { id: true },
      });
    });
  }

  private async project(
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[],
  ) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async stageTwoPlanFile(
    client: ProjectFileClient,
    actor: CurrentActor,
    projectId: string,
    fileAssetId: string,
  ) {
    if (
      (await hiddenStageOneFinanceFileIds(client, actor, projectId)).includes(
        fileAssetId,
      )
    )
      throw new NotFoundException('Workbook not found');
    const file = await client.fileAsset.findFirst({
      where: {
        id: fileAssetId,
        organizationId: actor.organizationId,
        deletedAt: null,
        originalFilename: { endsWith: '.xlsx', mode: 'insensitive' },
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: { gt: 0 },
        uploadSession: {
          projectId,
          status: 'AVAILABLE',
          completedAt: { not: null },
          stageOneDocument: {
            is: {
              projectId,
              currentFileAssetId: fileAssetId,
              stageKey: 'STAGE_2',
              workstreamKey: 'PLAN',
              status: { not: 'SUPERSEDED' },
              requiredDocument: {
                is: {
                  stageKey: 'STAGE_2',
                  workstreamKey: 'PLAN',
                  supersededAt: null,
                },
              },
            },
          },
        },
        attachments: {
          some: { projectId, entityType: 'ProjectStageOneDocument' },
        },
      },
      select: {
        id: true,
        originalFilename: true,
        sizeBytes: true,
        storageKey: true,
        uploadSession: { select: { stageOneDocumentId: true } },
        attachments: {
          where: { projectId, entityType: 'ProjectStageOneDocument' },
          select: { entityId: true },
        },
      },
    });
    if (
      !file?.uploadSession?.stageOneDocumentId ||
      !file.attachments.some(
        ({ entityId }) => entityId === file.uploadSession!.stageOneDocumentId,
      )
    )
      throw new NotFoundException('Workbook not found');
    return file;
  }

  async previewStageTwoPlan(
    actor: CurrentActor,
    projectId: string,
    fileAssetId: string,
  ) {
    this.require(actor, 'project.read');
    this.require(actor, 'import.create');
    this.require(actor, 'file.read');
    this.require(actor, 'file.download');
    return this.withWorkbookAdmission(actor, () =>
      this.previewStageTwoPlanAdmitted(actor, projectId, fileAssetId),
    );
  }

  private async previewStageTwoPlanAdmitted(
    actor: CurrentActor,
    projectId: string,
    fileAssetId: string,
  ) {
    await this.project(actor, projectId, [
      'project.read',
      'import.create',
      'file.read',
      'file.download',
    ]);
    await this.assertImportAttemptCapacity(
      this.prisma,
      actor,
      projectId,
      STAGE_TWO_PLAN_ENTITY,
    );
    const file = await this.stageTwoPlanFile(
      this.prisma,
      actor,
      projectId,
      fileAssetId,
    );
    if (file.sizeBytes > BigInt(STAGE_TWO_PLAN_MAX_BYTES))
      throw new BadRequestException('Workbook must be no larger than 5 MB');
    const attempt = await this.reserveImportAttempt(actor, {
      projectId,
      fileAssetId,
      entityType: STAGE_TWO_PLAN_ENTITY,
      filename: file.originalFilename,
    });
    const finance = await this.hasProjectPermissions(
      actor,
      projectId,
      'estimate.read',
    );
    const departments = await this.prisma.department.findMany({
      where: { organizationId: actor.organizationId, status: 'active' },
      select: { id: true, code: true, name: true },
    });
    const chunks: Buffer[] = [];
    for await (const chunk of await this.storage.stream(file.storageKey))
      chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const preview = await parseStageTwoWorkbook(bytes, departments, finance);
    const existingCodes = new Set(
      (
        await this.prisma.task.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId,
            relatedEntityType: STAGE_TWO_PLAN_ENTITY,
            baselineVersion: STAGE_TWO_BASELINE_VERSION,
            deletedAt: null,
            code: {
              in: preview.rows.map(({ data }) => data.code).filter(Boolean),
            },
          },
          select: { code: true },
        })
      ).flatMap(({ code }) => (code ? [code] : [])),
    );
    for (const row of preview.rows)
      if (existingCodes.has(row.data.code)) {
        row.errors.push('duplicate code in active plan');
        row.status = 'INVALID';
      }
    preview.summary.validRows = preview.rows.filter(
      ({ status }) => status === 'VALID',
    ).length;
    preview.summary.invalidRows =
      preview.rows.length - preview.summary.validRows;
    const job = await this.prisma.importJob.update({
      where: { id: attempt.id },
      data: {
        status: 'VALIDATED',
        totalRows: preview.summary.totalRows,
        validRows: preview.summary.validRows,
        invalidRows: preview.summary.invalidRows,
        rows: {
          create: preview.rows.map(({ rowNumber, status, data, errors }) => ({
            rowNumber,
            rawData: data,
            normalizedData: data,
            status,
            errors,
          })),
        },
      },
      select: { id: true },
    });
    return { jobId: job.id, status: 'VALIDATED' as const, ...preview };
  }

  async confirmStageTwoPlan(
    actor: CurrentActor,
    projectId: string,
    jobId: string,
  ) {
    this.require(actor, 'project.read');
    this.require(actor, 'import.confirm');
    this.require(actor, 'task.create');
    this.require(actor, 'file.read');
    this.require(actor, 'file.download');
    const requiredPermissions = [
      'project.read',
      'import.confirm',
      'task.create',
      'file.read',
      'file.download',
    ];
    await this.project(actor, projectId, requiredPermissions);
    return this.prisma.$transaction(async (tx) => {
      const lockedProject = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Project"
        WHERE "id" = ${projectId}::uuid
          AND "organizationId" = ${actor.organizationId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (!lockedProject.length)
        throw new NotFoundException('Project not found');
      const scopedProject = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, requiredPermissions),
        },
        select: { id: true },
      });
      if (!scopedProject) throw new NotFoundException('Project not found');
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "ImportJob"
        WHERE "id" = ${jobId}::uuid
          AND "organizationId" = ${actor.organizationId}::uuid
          AND "projectId" = ${projectId}::uuid
          AND "entityType" = ${STAGE_TWO_PLAN_ENTITY}
        FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('Import job not found');
      const job = await tx.importJob.findFirst({
        where: {
          id: jobId,
          organizationId: actor.organizationId,
          projectId,
          entityType: STAGE_TWO_PLAN_ENTITY,
          fileAssetId: { not: null },
        },
        include: { rows: { orderBy: { rowNumber: 'asc' } } },
      });
      if (!job?.fileAssetId)
        throw new NotFoundException('Import job not found');
      await this.stageTwoPlanFile(tx, actor, projectId, job.fileAssetId);
      const result = {
        jobId,
        status: 'COMPLETED' as const,
        importedRows: job.importedRows,
        skippedRows: job.skippedRows,
      };
      if (job.status === 'COMPLETED') return result;
      if (job.status !== 'VALIDATED')
        throw new ConflictException('Import must be validated first');
      const valid = job.rows.filter(({ status }) => status === 'VALID');
      const data = valid.map(
        (row) => row.normalizedData as Record<string, unknown>,
      );
      const importsBudget = data.some((values) =>
        Object.prototype.hasOwnProperty.call(values, 'allocatedBudget'),
      );
      if (importsBudget) {
        if (
          !(await this.hasProjectPermissions(
            actor,
            projectId,
            ['estimate.read', 'estimate.update'],
            tx,
          ))
        )
          throw new ForbiddenException('Financial permission is required');
      }
      const departmentIds = [
        ...new Set(data.map(({ departmentId }) => String(departmentId))),
      ];
      if (
        departmentIds.length &&
        (await tx.department.count({
          where: {
            id: { in: departmentIds },
            organizationId: actor.organizationId,
            status: 'active',
          },
        })) !== departmentIds.length
      )
        throw new ConflictException('Department is no longer active');
      const codes = data.map(({ code }) => String(code));
      if (
        codes.length &&
        (await tx.task.count({
          where: {
            organizationId: actor.organizationId,
            projectId,
            relatedEntityType: STAGE_TWO_PLAN_ENTITY,
            baselineVersion: STAGE_TWO_BASELINE_VERSION,
            deletedAt: null,
            code: { in: codes },
          },
        }))
      )
        throw new ConflictException('Plan code already exists');
      let importedRows = 0;
      for (let index = 0; index < valid.length; index++) {
        const row = valid[index]!;
        const values = data[index]!;
        const task = await tx.task.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            relatedEntityType: STAGE_TWO_PLAN_ENTITY,
            relatedEntityId: projectId,
            baselineVersion: STAGE_TWO_BASELINE_VERSION,
            code: String(values.code),
            title: String(values.description),
            description: String(values.description),
            departmentId: String(values.departmentId),
            startDate: new Date(`${String(values.startDate)}T00:00:00.000Z`),
            dueDate: new Date(`${String(values.finishDate)}T00:00:00.000Z`),
            ...(importsBudget && values.allocatedBudget !== undefined
              ? {
                  allocatedBudget: new Prisma.Decimal(
                    String(values.allocatedBudget),
                  ),
                }
              : {}),
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED', createdEntityId: task.id },
        });
        importedRows++;
      }
      const skippedRows = job.rows.length - importedRows;
      await tx.importJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          importedRows,
          skippedRows,
          completedAt: new Date(),
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_TWO_PLAN_IMPORTED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { jobId, importedRows, skippedRows, codes },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_TWO_PLAN_IMPORTED',
        entityType: 'Project',
        entityId: projectId,
        afterData: { jobId, importedRows, skippedRows, codes },
      });
      return { jobId, status: 'COMPLETED' as const, importedRows, skippedRows };
    });
  }

  async create(
    actor: CurrentActor,
    dto: CreateImportDto,
    file?: Express.Multer.File,
  ) {
    this.require(actor, 'import.create');
    this.requireCreatePermission(actor, dto.entityType);
    if (!file) throw new BadRequestException('Excel file is required');
    if (
      file.size > 5 * 1024 * 1024 ||
      !file.originalname.toLowerCase().endsWith('.xlsx')
    )
      throw new BadRequestException('Only .xlsx files up to 5 MB are allowed');
    return this.withWorkbookAdmission(actor, () =>
      this.createAdmitted(actor, dto, file),
    );
  }

  private async createAdmitted(
    actor: CurrentActor,
    dto: CreateImportDto,
    file: Express.Multer.File,
  ) {
    const attempt = await this.reserveImportAttempt(actor, {
      entityType: dto.entityType,
      filename: file.originalname,
    });
    assertBoundedWorkbook(file.buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.read(Readable.from(file.buffer));
    } catch {
      throw new BadRequestException('Invalid Excel workbook');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 1)
      throw new BadRequestException('Workbook is empty');
    if (sheet.rowCount > maximumGenericImportRows + 1)
      throw new BadRequestException('Workbook accepts at most 1000 rows');
    if (sheet.getRow(1).cellCount > maximumGenericImportColumns)
      throw new BadRequestException('Workbook accepts at most 100 columns');
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      headers.push(String(this.cellValue(cell.value) ?? '').trim());
    });
    if (
      !headers.length ||
      headers.some(
        (header) => !header || header.length > maximumGenericHeaderLength,
      ) ||
      new Set(headers).size !== headers.length
    )
      throw new BadRequestException('Header row is invalid');
    const rows = [];
    let persistedRowsBytes = 0;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const rawData = Object.fromEntries(
        headers.map((header, index) => [
          header,
          this.cellValue(row.getCell(index + 1).value),
        ]),
      );
      const persistedRow = { rowNumber, rawData };
      persistedRowsBytes = addPersistedRowBytes(
        persistedRowsBytes,
        persistedRow,
      );
      rows.push(persistedRow);
    }
    return this.prisma.importJob.update({
      where: { id: attempt.id },
      data: {
        status: 'UPLOADED',
        totalRows: rows.length,
        rows: { create: rows },
      },
      include: { rows: { take: 20, orderBy: { rowNumber: 'asc' } } },
    });
  }

  list(actor: CurrentActor) {
    return this.prisma.importJob.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: null,
        fileAssetId: null,
        entityType: { in: Object.keys(required) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async get(actor: CurrentActor, id: string) {
    const job = await this.prisma.importJob.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        projectId: null,
        fileAssetId: null,
        entityType: { in: Object.keys(required) },
      },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  private async lockedGenericJob(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    id: string,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "ImportJob"
      WHERE "id" = ${id}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "projectId" IS NULL
        AND "fileAssetId" IS NULL
        AND "entityType" IN ('Customer', 'Contact', 'Lead', 'Project')
      FOR UPDATE
    `);
    if (!locked.length) throw new NotFoundException('Import job not found');
    const job = await tx.importJob.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        projectId: null,
        fileAssetId: null,
        entityType: { in: Object.keys(required) },
      },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Import job not found');
    this.requireCreatePermission(actor, job.entityType);
    return job;
  }

  async map(actor: CurrentActor, id: string, dto: ImportMappingDto) {
    this.require(actor, 'import.create');
    return this.prisma.$transaction(async (tx) => {
      const job = await this.lockedGenericJob(tx, actor, id);
      if (!['UPLOADED', 'MAPPED'].includes(job.status))
        throw new ConflictException('Import mapping can no longer be changed');
      const entries = Object.entries(dto.mapping);
      if (entries.length > MAX_IMPORT_MAPPING_ENTRIES)
        throw new BadRequestException('Mapping accepts at most 100 entries');
      const headers = new Set(
        job.rows.flatMap(({ rawData }) =>
          rawData && typeof rawData === 'object' && !Array.isArray(rawData)
            ? Object.keys(rawData)
            : [],
        ),
      );
      if (
        entries.length > headers.size ||
        entries.some(([source]) => !headers.has(source))
      )
        throw new BadRequestException(
          'Mapping source must match a workbook header',
        );
      const targets = entries.flatMap(([, target]) =>
        typeof target === 'string' && target ? [target] : [],
      );
      if (
        entries.some(
          ([, target]) =>
            typeof target !== 'string' ||
            (target !== '' && !allowed[job.entityType]?.includes(target)),
        )
      )
        throw new BadRequestException('Mapping target is not allowed');
      if (new Set(targets).size !== targets.length)
        throw new BadRequestException('Mapping targets must be unique');
      const missing = required[job.entityType]?.filter(
        (field) => !Object.values(dto.mapping).includes(field),
      );
      if (missing?.length)
        throw new BadRequestException(
          `Missing mappings: ${missing.join(', ')}`,
        );
      return tx.importJob.update({
        where: { id },
        data: { mapping: dto.mapping, status: 'MAPPED' },
      });
    });
  }

  async validate(actor: CurrentActor, id: string) {
    this.require(actor, 'import.create');
    return this.prisma.$transaction(async (tx) => {
      const job = await this.lockedGenericJob(tx, actor, id);
      if (job.status === 'VALIDATED') return job;
      if (job.status !== 'MAPPED')
        throw new ConflictException('Import must be mapped first');
      if (!job.mapping || typeof job.mapping !== 'object')
        throw new BadRequestException('Column mapping is required');
      const mapping = job.mapping as Record<string, string>;
      let validRows = 0;
      for (const row of job.rows) {
        const raw = row.rawData as Record<string, unknown>;
        const normalized = Object.fromEntries(
          Object.entries(mapping)
            .filter(([, field]) => field)
            .map(([column, field]) => [field, raw[column] ?? null]),
        );
        const errors = (required[job.entityType] ?? [])
          .filter((field) => !String(normalized[field] ?? '').trim())
          .map((field) => `${field} is required`);
        if (
          normalized.email &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(normalized.email))
        )
          errors.push('email is invalid');
        if (
          !errors.length &&
          (await this.duplicate(tx, actor, job.entityType, normalized))
        )
          errors.push('duplicate record');
        if (!errors.length) validRows++;
        await tx.importRow.update({
          where: { id: row.id },
          data: {
            normalizedData: normalized,
            errors,
            status: errors.length ? 'INVALID' : 'VALID',
          },
        });
      }
      return tx.importJob.update({
        where: { id },
        data: {
          status: 'VALIDATED',
          validRows,
          invalidRows: job.rows.length - validRows,
        },
      });
    });
  }

  async confirm(actor: CurrentActor, id: string) {
    this.require(actor, 'import.confirm');
    return this.prisma.$transaction(async (tx) => {
      const job = await this.lockedGenericJob(tx, actor, id);
      if (job.status === 'COMPLETED') return job;
      if (job.status !== 'VALIDATED')
        throw new ConflictException('Import must be validated first');
      if (['Project', 'Contact'].includes(job.entityType)) {
        const customerIds = [
          ...new Set(
            job.rows
              .filter(({ status }) => status === 'VALID')
              .map(({ normalizedData }) =>
                String((normalizedData as Record<string, unknown>).customerId),
              ),
          ),
        ];
        if (
          customerIds.length &&
          (await tx.customer.count({
            where: {
              id: { in: customerIds },
              organizationId: actor.organizationId,
              deletedAt: null,
            },
          })) !== customerIds.length
        )
          throw new ConflictException('Customer is not available');
      }
      let importedRows = 0;
      for (const row of job.rows.filter((item) => item.status === 'VALID')) {
        const data = row.normalizedData as Record<string, string | null>;
        let created: { id: string };
        if (job.entityType === 'Customer')
          created = await tx.customer.create({
            data: {
              organizationId: actor.organizationId,
              displayName: String(data.displayName),
              type: data.type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL',
              email: data.email,
              phone: data.phone,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        else if (job.entityType === 'Lead')
          created = await tx.lead.create({
            data: {
              organizationId: actor.organizationId,
              name: String(data.name),
              companyName: data.companyName,
              email: data.email,
              phone: data.phone,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        else if (job.entityType === 'Project')
          created = await tx.project.create({
            data: {
              organizationId: actor.organizationId,
              code: String(data.code),
              name: String(data.name),
              customerId: String(data.customerId),
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        else
          created = await tx.contact.create({
            data: {
              organizationId: actor.organizationId,
              customerId: String(data.customerId),
              firstName: String(data.firstName),
              lastName: data.lastName,
              displayName: `${data.firstName} ${data.lastName ?? ''}`.trim(),
              email: data.email,
              phone: data.phone,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED', createdEntityId: created.id },
        });
        importedRows++;
      }
      return tx.importJob.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          importedRows,
          completedAt: new Date(),
        },
      });
    });
  }

  errors(actor: CurrentActor, id: string) {
    return this.get(actor, id).then((job) =>
      job.rows.filter((row) => row.status === 'INVALID'),
    );
  }

  private cellValue(
    value: ExcelJS.CellValue,
  ): string | number | boolean | null {
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === 'object') {
      if ('formula' in value)
        return String(value.result ?? '').replace(/^[=+\-@]/, "'");
      if ('text' in value) return value.text;
      return JSON.stringify(value);
    }
    return value ?? null;
  }

  private duplicate(
    client: Pick<
      Prisma.TransactionClient,
      'customer' | 'project' | 'lead' | 'contact'
    >,
    actor: CurrentActor,
    entityType: string,
    data: Record<string, unknown>,
  ) {
    const alternatives = [
      data.email ? { email: String(data.email) } : undefined,
      data.phone ? { phone: String(data.phone) } : undefined,
    ].filter((value) => value !== undefined);
    if (entityType === 'Customer')
      return client.customer
        .count({
          where: {
            organizationId: actor.organizationId,
            deletedAt: null,
            OR: [
              ...alternatives,
              {
                displayName: {
                  equals: String(data.displayName),
                  mode: 'insensitive',
                },
              },
            ],
          },
        })
        .then(Boolean);
    if (entityType === 'Project')
      return client.project
        .count({
          where: {
            organizationId: actor.organizationId,
            code: String(data.code),
          },
        })
        .then(Boolean);
    if (entityType === 'Lead')
      return alternatives.length
        ? client.lead
            .count({
              where: {
                organizationId: actor.organizationId,
                deletedAt: null,
                status: { notIn: ['CONVERTED', 'ARCHIVED'] },
                OR: alternatives,
              },
            })
            .then(Boolean)
        : Promise.resolve(false);
    return alternatives.length
      ? client.contact
          .count({
            where: {
              organizationId: actor.organizationId,
              customerId: String(data.customerId),
              deletedAt: null,
              OR: alternatives,
            },
          })
          .then(Boolean)
      : Promise.resolve(false);
  }
}
