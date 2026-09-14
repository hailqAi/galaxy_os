import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../src/access-control/business-entity.policy';
import { CurrentActor } from '../src/access-control/current-actor';
import { AuditService } from '../src/audit/audit.service';
import { FileStorage } from '../src/files/file-storage';
import { FilesService } from '../src/files/files.service';
import { ProjectApproverResolver } from '../src/projects/project-approver-resolver.service';
import { ProjectProductsService } from '../src/projects/project-products.service';
import { ProjectStageOneService } from '../src/projects/project-stage-one.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

const isolated = assertG00Isolation();

describe.sequential(
  'Project required document resumable upload integration',
  () => {
    const prisma = new PrismaClient();
    const run = `${Date.now()}-${process.pid}`;
    const projectIds: string[] = [];
    const requirementIds: string[] = [];
    const userIds: string[] = [];
    const fileAssetIds: string[] = [];
    let runtimePath = '';
    let organizationId = '';
    let customerId = '';
    let actor: CurrentActor;
    let otherActor: CurrentActor;
    let officerActor: CurrentActor;
    let uploads: UploadsService;
    let storage: FileStorage;
    let products: ProjectProductsService;
    let stageOne: ProjectStageOneService;
    let files: FilesService;
    let primaryProjectId = '';
    let otherProjectId = '';
    let officerId = '';
    let initiationSequence = 0;

    const checksum = (bytes: Buffer) =>
      createHash('sha256').update(bytes).digest('hex');
    const readStored = async (storageKey: string) => {
      const chunks: Buffer[] = [];
      for await (const chunk of await storage.stream(storageKey))
        chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    };
    const createPreviousAsset = async (suffix: string) => {
      const asset = await prisma.fileAsset.create({
        data: {
          organizationId,
          originalFilename: `upload-integration-${run}-${suffix}.pdf`,
          storedFilename: `${suffix}-${run}`,
          mimeType: 'application/pdf',
          sizeBytes: 8,
          storageKey: `integration/${run}/${suffix}`,
          checksum: '0'.repeat(64),
          category: 'PROJECT_DOCUMENT',
          uploadedById: actor.userId,
        },
      });
      fileAssetIds.push(asset.id);
      await prisma.entityAttachment.create({
        data: {
          fileAssetId: asset.id,
          entityType: 'Project',
          entityId: primaryProjectId,
          projectId: primaryProjectId,
          createdBy: actor.userId,
        },
      });
      return asset;
    };
    const gatedCompletion = () => {
      let signalEntered!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => (signalEntered = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      const gatedStorage = {
        putStream: async (
          organization: string,
          body: Readable,
          storageKey?: string,
          claimId?: string,
        ): Promise<string> => {
          signalEntered();
          await released;
          return storage.putStream(organization, body, storageKey, claimId);
        },
        publishPending: (storageKey: string, claimId: string) =>
          storage.publishPending(storageKey, claimId),
        removePending: (storageKey: string, claimId?: string) =>
          storage.removePending(storageKey, claimId),
        remove: (storageKey: string) => storage.remove(storageKey),
      } as FileStorage;
      return {
        entered,
        release,
        uploads: new UploadsService(prisma as never, gatedStorage, products),
      };
    };
    const createRequirement = async (
      projectId: string,
      suffix: string,
      data: {
        currentFileAssetId?: string;
        currentVersion?: number;
        notes?: string;
      } = {},
    ) => {
      const document = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId,
          stageKey: `INTEGRATION_${run}_${suffix}`,
          workstreamKey: 'UPLOAD',
          documentType: `UPLOAD_${suffix}`,
          documentName: `Upload integration ${suffix}`,
          status: data.currentFileAssetId ? 'DRAFT' : 'MISSING',
          currentFileAssetId: data.currentFileAssetId,
          currentVersion: data.currentVersion ?? 0,
          notes: data.notes,
        },
      });
      requirementIds.push(document.id);
      return document;
    };
    const initiateAndPart = async (
      requirementId: string,
      bytes: Buffer,
      projectId = primaryProjectId,
      uploadActor = actor,
    ) => {
      const session = await uploads.initiate(uploadActor, {
        projectId,
        requiredDocumentId: requirementId,
        idempotencyKey: `integration-required-${++initiationSequence}`,
        originalFilename: `${requirementId}.pdf`,
        declaredSize: bytes.length,
        mimeType: 'application/pdf',
      });
      await uploads.part(
        uploadActor,
        session.id as string,
        1,
        checksum(bytes),
        Readable.from(bytes),
      );
      return session.id as string;
    };

    beforeAll(async () => {
      await prisma.$connect();
      runtimePath = await mkdtemp(
        join(isolated.testRoot, 'upload-integration-'),
      );
      vi.stubEnv('LOCAL_UPLOAD_PATH', join(runtimePath, 'parts'));
      vi.stubEnv('FILE_STORAGE_PATH', join(runtimePath, 'files'));
      const organization = await prisma.organization.findUniqueOrThrow({
        where: { slug: 'galaxy-centre' },
      });
      organizationId = organization.id;
      const createUser = async (label: string) => {
        const email = `upload-${label}-${run}@example.test`;
        const user = await prisma.user.create({
          data: {
            email,
            normalizedEmail: email,
            displayName: `Upload ${label}`,
            status: 'active',
          },
        });
        userIds.push(user.id);
        const membership = await prisma.organizationMembership.create({
          data: { organizationId, userId: user.id, status: 'active' },
        });
        return { ...user, membershipId: membership.id };
      };
      const [owner, other, officer] = await Promise.all([
        createUser('owner'),
        createUser('other'),
        createUser('officer'),
      ]);
      officerId = officer.id;
      const permissions = [
        'file.read',
        'file.download',
        'file.upload',
        'project.document.manage',
        'project.key_dossier.manage',
        'project.manage_members',
      ];
      const currentActor = (user: typeof owner): CurrentActor => ({
        userId: user.id,
        organizationId,
        organizationMembershipId: user.membershipId,
        email: user.email,
        displayName: user.displayName,
        mustChangePassword: false,
        permissions,
        administrationScope: 'SELF',
        managedDepartmentIds: [],
        administrationTier: 0,
      });
      actor = currentActor(owner);
      otherActor = currentActor(other);
      officerActor = currentActor(officer);
      const customer = await prisma.customer.create({
        data: {
          organizationId,
          type: 'COMPANY',
          displayName: `Upload integration ${run}`,
          createdBy: owner.id,
          updatedBy: owner.id,
        },
      });
      customerId = customer.id;
      const createProject = async (suffix: string, memberId: string) => {
        const project = await prisma.project.create({
          data: {
            organizationId,
            code: `UPLOAD-${run}-${suffix}`,
            name: `Upload integration ${suffix}`,
            customerId,
            createdBy: owner.id,
            updatedBy: owner.id,
          },
        });
        projectIds.push(project.id);
        await prisma.projectMember.create({
          data: {
            organizationId,
            projectId: project.id,
            userId: memberId,
            createdBy: owner.id,
          },
        });
        return project.id;
      };
      primaryProjectId = await createProject('primary', owner.id);
      otherProjectId = await createProject('other', other.id);
      await prisma.projectMember.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          userId: officer.id,
          createdBy: owner.id,
        },
      });
      const policy = new BusinessEntityPolicy(prisma as never);
      const audit = new AuditService(prisma as never);
      const approvers = new ProjectApproverResolver(prisma as never);
      products = new ProjectProductsService(
        prisma as never,
        policy,
        approvers,
        audit,
      );
      stageOne = new ProjectStageOneService(
        prisma as never,
        policy,
        approvers,
        audit,
      );
      storage = new FileStorage();
      files = new FilesService(prisma as never, policy, storage);
      uploads = new UploadsService(
        prisma as never,
        storage,
        products,
        stageOne,
      );
    });

    afterAll(async () => {
      let firstCleanupError: unknown;
      const attempt = async (cleanup: () => unknown | Promise<unknown>) => {
        try {
          await cleanup();
        } catch (error) {
          firstCleanupError ??= error;
        }
      };
      try {
        if (projectIds.length) {
          await attempt(async () => {
            fileAssetIds.push(
              ...(
                await prisma.uploadSession.findMany({
                  where: { projectId: { in: projectIds } },
                  select: { fileAssetId: true },
                })
              ).flatMap(({ fileAssetId }) =>
                fileAssetId ? [fileAssetId] : [],
              ),
            );
          });
          await attempt(() =>
            prisma.uploadSession.deleteMany({
              where: { projectId: { in: projectIds } },
            }),
          );
          const logicalIds = (
            await prisma.projectStageOneDocument.findMany({
              where: { projectId: { in: projectIds } },
              select: { id: true },
            })
          ).map(({ id }) => id);
          await attempt(() =>
            prisma.activity.deleteMany({
              where: {
                entityType: 'ProjectStageOneDocument',
                entityId: { in: logicalIds },
              },
            }),
          );
          await attempt(() =>
            prisma.auditLog.deleteMany({
              where: {
                entityType: 'ProjectStageOneDocument',
                entityId: { in: logicalIds },
              },
            }),
          );
          await attempt(() =>
            prisma.projectStageOneDocumentVersion.deleteMany({
              where: { documentId: { in: logicalIds } },
            }),
          );
          await attempt(() =>
            prisma.activity.deleteMany({
              where: {
                entityType: 'ProjectRequiredDocument',
                entityId: { in: requirementIds },
              },
            }),
          );
          await attempt(() =>
            prisma.activity.deleteMany({
              where: {
                entityType: 'Project',
                entityId: { in: projectIds },
              },
            }),
          );
          await attempt(() =>
            prisma.auditLog.deleteMany({
              where: {
                entityType: 'ProjectRequiredDocument',
                entityId: { in: requirementIds },
              },
            }),
          );
          await attempt(() =>
            prisma.projectRequiredDocumentVersion.deleteMany({
              where: { requirementId: { in: requirementIds } },
            }),
          );
          await attempt(() =>
            prisma.entityAttachment.deleteMany({
              where: { projectId: { in: projectIds } },
            }),
          );
          await attempt(() =>
            prisma.projectRequiredDocument.deleteMany({
              where: { projectId: { in: projectIds } },
            }),
          );
          await attempt(() =>
            prisma.projectStageOneDocument.deleteMany({
              where: { projectId: { in: projectIds } },
            }),
          );
          await attempt(() =>
            prisma.fileAsset.deleteMany({
              where: { id: { in: fileAssetIds } },
            }),
          );
          await attempt(() =>
            prisma.projectMember.deleteMany({
              where: { projectId: { in: projectIds } },
            }),
          );
          await attempt(() =>
            prisma.project.deleteMany({
              where: { id: { in: projectIds } },
            }),
          );
        }
        if (customerId)
          await attempt(() =>
            prisma.customer.deleteMany({ where: { id: customerId } }),
          );
        if (userIds.length) {
          await attempt(() =>
            prisma.organizationMembership.deleteMany({
              where: { userId: { in: userIds } },
            }),
          );
          await attempt(() =>
            prisma.user.deleteMany({ where: { id: { in: userIds } } }),
          );
        }
      } finally {
        await attempt(() => prisma.$disconnect());
        if (runtimePath)
          await attempt(() =>
            rm(runtimePath, { recursive: true, force: true }),
          );
        try {
          vi.unstubAllEnvs();
        } catch (error) {
          firstCleanupError ??= error;
        }
      }
      if (firstCleanupError) throw firstCleanupError;
    });

    it('denies another actor, a cross-project target, and every command after access is revoked', async () => {
      const getRequirement = await createRequirement(
        primaryProjectId,
        'access-get',
      );
      const getSession = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        requiredDocumentId: getRequirement.id,
        idempotencyKey: 'access-get',
        originalFilename: 'access.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      });
      const partRequirement = await createRequirement(
        primaryProjectId,
        'access-part',
      );
      const partSession = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        requiredDocumentId: partRequirement.id,
        idempotencyKey: 'access-part',
        originalFilename: 'access-part.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      });
      const completeRequirement = await createRequirement(
        primaryProjectId,
        'access-complete',
      );
      const completeBytes = Buffer.from('%PDF-access-complete');
      const completeSessionId = await initiateAndPart(
        completeRequirement.id,
        completeBytes,
      );
      const abortRequirement = await createRequirement(
        primaryProjectId,
        'access-abort',
      );
      const abortSession = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        requiredDocumentId: abortRequirement.id,
        idempotencyKey: 'access-abort',
        originalFilename: 'access-abort.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      });
      const refreshRequirement = await createRequirement(
        primaryProjectId,
        'access-refresh',
      );
      const refreshSession = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        requiredDocumentId: refreshRequirement.id,
        idempotencyKey: 'access-refresh',
        originalFilename: 'access-refresh.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      });

      await expect(
        uploads.get(otherActor, getSession.id as string),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        uploads.initiate(otherActor, {
          projectId: primaryProjectId,
          requiredDocumentId: getRequirement.id,
          idempotencyKey: 'access-non-member',
          originalFilename: 'non-member.pdf',
          declaredSize: 8,
          mimeType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        uploads.initiate(actor, {
          projectId: otherProjectId,
          requiredDocumentId: getRequirement.id,
          idempotencyKey: 'access-cross-project',
          originalFilename: 'cross-project.pdf',
          declaredSize: 8,
          mimeType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.projectMember.deleteMany({
        where: { projectId: primaryProjectId, userId: actor.userId },
      });
      try {
        await expect(
          uploads.get(actor, getSession.id as string),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          uploads.part(
            actor,
            partSession.id as string,
            1,
            checksum(Buffer.from('%PDF-ok')),
            Readable.from('%PDF-ok'),
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          uploads.complete(actor, completeSessionId, checksum(completeBytes)),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          uploads.abort(actor, abortSession.id as string),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          uploads.refresh(actor, refreshSession.id as string),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.projectMember.create({
          data: {
            organizationId,
            projectId: primaryProjectId,
            userId: actor.userId,
            createdBy: actor.userId,
          },
        });
      }
    });

    it('returns sanitized status with committed uploaded-part checksums', async () => {
      const requirement = await createRequirement(primaryProjectId, 'status');
      const bytes = Buffer.from('%PDF-status');
      const sessionId = await initiateAndPart(requirement.id, bytes);

      const status = await uploads.get(actor, sessionId);
      expect(status.uploadedParts).toEqual([
        { partNumber: 1, size: bytes.length, checksum: checksum(bytes) },
      ]);
      expect(JSON.stringify(status)).not.toMatch(
        /storageKey|providerUploadId|storagePath/,
      );
    });

    it('expires an elapsed AVAILABLE draft on authorized read and refuses submission', async () => {
      const requirement = await createRequirement(
        primaryProjectId,
        'elapsed-available',
      );
      const sessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-elapsed-available'),
      );
      const completed = await uploads.complete(actor, sessionId);
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(0) },
      });

      await expect(
        uploads.submit(actor, {
          projectId: primaryProjectId,
          sessionIds: [sessionId],
          idempotencyKey: `elapsed-available-${run}`,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await prisma.entityAttachment.count({
          where: { fileAssetId: completed.fileAssetId! },
        }),
      ).toBe(0);
      await expect(uploads.get(actor, sessionId)).resolves.toMatchObject({
        id: sessionId,
        status: 'EXPIRED',
      });
      expect(
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { status: true },
        }),
      ).toEqual({ status: 'EXPIRED' });
    });

    it('keeps completion temporary, idempotent, recoverable, and truthful about expiry', async () => {
      const requirement = await createRequirement(
        primaryProjectId,
        'temporary',
      );
      const bytes = Buffer.from('%PDF-temporary');
      const sessionId = await initiateAndPart(requirement.id, bytes);

      const completed = await uploads.complete(actor, sessionId);
      const retry = await uploads.complete(actor, sessionId);

      expect(completed).toEqual({
        status: 'AVAILABLE',
        fileAssetId: expect.any(String),
        uploadedBytes: String(bytes.length),
      });
      expect(retry).toEqual({
        status: 'AVAILABLE',
        fileAssetId: completed.fileAssetId,
        uploadedBytes: String(bytes.length),
      });
      expect(
        await prisma.fileAsset.findMany({
          where: { uploadSession: { id: sessionId } },
        }),
      ).toEqual([
        expect.objectContaining({
          id: completed.fileAssetId,
          uploadedById: actor.userId,
        }),
      ]);
      expect(
        await prisma.entityAttachment.count({
          where: { fileAssetId: completed.fileAssetId as string },
        }),
      ).toBe(0);
      expect(
        await prisma.projectRequiredDocumentVersion.count({
          where: { requirementId: requirement.id },
        }),
      ).toBe(0);
      expect(
        await prisma.projectRequiredDocument.findUniqueOrThrow({
          where: { id: requirement.id },
          select: { currentFileAssetId: true, currentVersion: true },
        }),
      ).toEqual({ currentFileAssetId: null, currentVersion: 0 });
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
          },
        }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
          },
        }),
      ).toBe(0);
      await expect(
        uploads.recover(officerActor, {
          projectId: primaryProjectId,
          requiredDocumentId: requirement.id,
        }),
      ).resolves.toEqual({ items: [] });
      await expect(
        uploads.recover(actor, {
          projectId: otherProjectId,
          requiredDocumentId: requirement.id,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        uploads.recover(actor, {
          projectId: primaryProjectId,
          requiredDocumentId: requirement.id,
        }),
      ).resolves.toMatchObject({
        items: [
          expect.objectContaining({
            id: sessionId,
          }),
        ],
      });
      const attached = await prisma.entityAttachment.create({
        data: {
          fileAssetId: completed.fileAssetId as string,
          entityType: 'ProjectRequiredDocument',
          entityId: requirement.id,
          projectId: primaryProjectId,
          createdBy: actor.userId,
        },
      });
      await expect(
        uploads.recover(actor, {
          projectId: primaryProjectId,
          requiredDocumentId: requirement.id,
        }),
      ).resolves.toEqual({ items: [] });
      await prisma.entityAttachment.delete({ where: { id: attached.id } });
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      await expect(
        uploads.recover(actor, {
          projectId: primaryProjectId,
          requiredDocumentId: requirement.id,
        }),
      ).resolves.toEqual({ items: [] });
      expect(
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { status: true },
        }),
      ).toEqual({ status: 'EXPIRED' });
    });

    it('discovers Project drafts without crossing actor, Project, or revoked target access', async () => {
      const ownRequirement = await createRequirement(
        primaryProjectId,
        'project-recovery-own',
      );
      const otherRequirement = await createRequirement(
        otherProjectId,
        'project-recovery-other',
      );
      const ownSessionId = await initiateAndPart(
        ownRequirement.id,
        Buffer.from('%PDF-project-recovery-own'),
      );
      const otherSessionId = await initiateAndPart(
        otherRequirement.id,
        Buffer.from('%PDF-project-recovery-other'),
        otherProjectId,
        otherActor,
      );
      await Promise.all([
        uploads.complete(actor, ownSessionId),
        uploads.complete(otherActor, otherSessionId),
      ]);

      await expect(
        uploads.recover(actor, { projectId: primaryProjectId }),
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ id: ownSessionId })],
      });
      await expect(
        uploads.recover(officerActor, { projectId: primaryProjectId }),
      ).resolves.toEqual({ items: [] });
      await expect(
        uploads.recover(actor, { projectId: otherProjectId }),
      ).resolves.toEqual({ items: [] });

      await prisma.projectMember.deleteMany({
        where: { projectId: primaryProjectId, userId: actor.userId },
      });
      try {
        await expect(
          uploads.recover(actor, { projectId: primaryProjectId }),
        ).resolves.toEqual({ items: [] });
      } finally {
        await prisma.projectMember.create({
          data: {
            organizationId,
            projectId: primaryProjectId,
            userId: actor.userId,
            createdBy: actor.userId,
          },
        });
      }
      expect(
        JSON.stringify(
          await uploads.recover(actor, { projectId: primaryProjectId }),
        ),
      ).not.toMatch(
        /storageKey|checksum|providerUploadId|organizationId|actorId|fileAssetId/,
      );
    });

    it('submits an AVAILABLE Required Document session once and replays its result after expiry', async () => {
      const requirement = await createRequirement(
        primaryProjectId,
        'explicit-submit',
      );
      const bytes = Buffer.from('%PDF-explicit-submit');
      const sessionId = await initiateAndPart(requirement.id, bytes);
      const completed = await uploads.complete(actor, sessionId);
      const putStream = vi.spyOn(storage, 'putStream');
      const stream = vi.spyOn(storage, 'stream');
      const command = {
        projectId: primaryProjectId,
        sessionIds: [sessionId],
        idempotencyKey: 'submit-required-document',
      };

      await expect(uploads.submit(otherActor, command)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        uploads.submit(actor, { ...command, projectId: otherProjectId }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED' },
      });
      await expect(uploads.submit(actor, command)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { status: 'AVAILABLE' },
      });

      const [submitted, retry] = await Promise.all([
        uploads.submit(actor, command),
        uploads.submit(actor, command),
      ]);
      expect(retry).toEqual(submitted);
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        uploads.submit(actor, {
          ...command,
          sessionIds: [sessionId.toUpperCase()],
        }),
      ).resolves.toEqual(submitted);
      expect(submitted.items[0]).toMatchObject({
        sessionId,
        fileAssetId: completed.fileAssetId,
        document: {
          id: requirement.id,
          currentFileAssetId: completed.fileAssetId,
          currentVersion: 1,
        },
      });
      expect(putStream).not.toHaveBeenCalled();
      expect(stream).not.toHaveBeenCalled();
      expect(
        await prisma.entityAttachment.count({
          where: {
            fileAssetId: completed.fileAssetId!,
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.projectRequiredDocumentVersion.count({
          where: { requirementId: requirement.id },
        }),
      ).toBe(1);
      expect(
        await prisma.activity.findFirstOrThrow({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
            event: 'PROJECT_DOCUMENT_FILE_LINKED',
          },
          select: { actorId: true },
        }),
      ).toEqual({ actorId: actor.userId });
      expect(
        await prisma.activity.findFirstOrThrow({
          where: {
            entityType: 'Project',
            entityId: primaryProjectId,
            event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
            metadata: {
              path: ['idempotencyKey'],
              equals: command.idempotencyKey,
            },
          },
          select: { actorId: true, metadata: true },
        }),
      ).toMatchObject({
        actorId: actor.userId,
        metadata: {
          idempotencyKey: command.idempotencyKey,
          sessionIds: [sessionId],
          result: {
            items: [
              {
                sessionId,
                fileAssetId: completed.fileAssetId,
                document: { id: requirement.id },
              },
            ],
          },
        },
      });
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
            action: 'PROJECT_DOCUMENT_FILE_LINKED',
          },
        }),
      ).toBe(1);
      expect(
        await prisma.projectRequiredDocument.findUniqueOrThrow({
          where: { id: requirement.id },
          select: {
            currentFileAssetId: true,
            currentVersion: true,
            status: true,
          },
        }),
      ).toEqual({
        currentFileAssetId: completed.fileAssetId,
        currentVersion: 1,
        status: 'DRAFT',
      });
      putStream.mockRestore();
      stream.mockRestore();
    });

    it('tombstones an unattached AVAILABLE draft, removes its bytes, and preserves attached files', async () => {
      const draftRequirement = await createRequirement(
        primaryProjectId,
        'abort-available-draft',
      );
      const draftBytes = Buffer.from('%PDF-abort-available-draft');
      const draftSessionId = await initiateAndPart(
        draftRequirement.id,
        draftBytes,
      );
      const draft = await uploads.complete(actor, draftSessionId);
      const draftAsset = await prisma.fileAsset.findUniqueOrThrow({
        where: { id: draft.fileAssetId! },
      });

      await expect(uploads.abort(actor, draftSessionId)).resolves.toMatchObject(
        {
          status: 'ABORTED',
          fileAssetId: draft.fileAssetId,
        },
      );
      expect(
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: draftSessionId },
          select: { status: true, fileAssetId: true },
        }),
      ).toEqual({ status: 'ABORTED', fileAssetId: draft.fileAssetId });
      await expect(readStored(draftAsset.storageKey)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        prisma.fileAsset.findUniqueOrThrow({
          where: { id: draft.fileAssetId! },
        }),
      ).resolves.toMatchObject({ deletedAt: expect.any(Date) });

      const attachedRequirement = await createRequirement(
        primaryProjectId,
        'abort-available-attached',
      );
      const attachedSessionId = await initiateAndPart(
        attachedRequirement.id,
        Buffer.from('%PDF-abort-available-attached'),
      );
      const attached = await uploads.complete(actor, attachedSessionId);
      await prisma.entityAttachment.create({
        data: {
          fileAssetId: attached.fileAssetId!,
          entityType: 'ProjectRequiredDocument',
          entityId: attachedRequirement.id,
          projectId: primaryProjectId,
          createdBy: actor.userId,
        },
      });

      await expect(
        uploads.abort(actor, attachedSessionId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: attachedSessionId },
          select: { status: true },
        }),
      ).toEqual({ status: 'AVAILABLE' });
      expect(
        await prisma.entityAttachment.count({
          where: { fileAssetId: attached.fileAssetId! },
        }),
      ).toBe(1);
    });

    it('scopes one batch key to the Project across different session owners', async () => {
      const otherMembership = await prisma.projectMember.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          userId: otherActor.userId,
          createdBy: actor.userId,
        },
      });
      try {
        const firstRequirement = await createRequirement(
          primaryProjectId,
          'project-key-owner',
        );
        const firstSessionId = await initiateAndPart(
          firstRequirement.id,
          Buffer.from('%PDF-project-key-owner'),
        );
        await uploads.complete(actor, firstSessionId);
        const firstCommand = {
          projectId: primaryProjectId,
          sessionIds: [firstSessionId],
          idempotencyKey: 'project-actor-key',
        };
        const original = await uploads.submit(actor, firstCommand);

        await expect(
          uploads.submit(otherActor, firstCommand),
        ).rejects.toBeInstanceOf(NotFoundException);

        const secondRequirement = await createRequirement(
          primaryProjectId,
          'project-key-other',
        );
        const secondSessionId = await initiateAndPart(
          secondRequirement.id,
          Buffer.from('%PDF-project-key-other'),
          primaryProjectId,
          otherActor,
        );
        await uploads.complete(otherActor, secondSessionId);

        await expect(
          uploads.submit(otherActor, {
            projectId: primaryProjectId,
            sessionIds: [secondSessionId],
            idempotencyKey: firstCommand.idempotencyKey,
          }),
        ).rejects.toMatchObject({
          response: { category: 'IDEMPOTENCY_CONFLICT' },
        });
        await expect(uploads.submit(actor, firstCommand)).resolves.toEqual(
          original,
        );
        expect(
          await prisma.activity.findMany({
            where: {
              entityType: 'Project',
              entityId: primaryProjectId,
              event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
              metadata: {
                path: ['idempotencyKey'],
                equals: firstCommand.idempotencyKey,
              },
            },
            select: { actorId: true },
          }),
        ).toEqual([{ actorId: actor.userId }]);
      } finally {
        await prisma.projectMember.delete({
          where: { id: otherMembership.id },
        });
      }
    });

    it('reserves a batch key even when the same FileAsset linkage is already current', async () => {
      const requirement = await createRequirement(
        primaryProjectId,
        'batch-ledger-early-return',
      );
      const firstSessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-ledger-first'),
      );
      await uploads.complete(actor, firstSessionId);
      await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [firstSessionId],
        idempotencyKey: 'ledger-key-1',
      });
      await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [firstSessionId],
        idempotencyKey: 'ledger-key-2',
      });

      const secondSessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-ledger-second'),
      );
      await uploads.complete(actor, secondSessionId);

      await expect(
        uploads.submit(actor, {
          projectId: primaryProjectId,
          sessionIds: [secondSessionId],
          idempotencyKey: 'ledger-key-2',
        }),
      ).rejects.toMatchObject({
        response: { category: 'IDEMPOTENCY_CONFLICT' },
      });
    });

    it('returns the original batch projection after a later document version is linked', async () => {
      const requirement = await createRequirement(
        primaryProjectId,
        'stable-batch-result',
      );
      const firstSessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-stable-first'),
      );
      await uploads.complete(actor, firstSessionId);
      const firstCommand = {
        projectId: primaryProjectId,
        sessionIds: [firstSessionId],
        idempotencyKey: 'stable-result-1',
      };
      const original = await uploads.submit(actor, firstCommand);

      const secondSessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-stable-second'),
      );
      await uploads.complete(actor, secondSessionId);
      await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [secondSessionId],
        idempotencyKey: 'stable-result-2',
      });

      await expect(uploads.submit(actor, firstCommand)).resolves.toEqual(
        original,
      );
      expect(original.items[0]!.document).toMatchObject({
        currentVersion: 1,
        currentFileAssetId: original.items[0]!.fileAssetId,
      });
    });

    it('keeps two sessions for one target paired with their ordered version results', async () => {
      const requirement = await createRequirement(
        primaryProjectId,
        'repeated-batch-target',
      );
      const firstSessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-repeated-first'),
      );
      const secondSessionId = await initiateAndPart(
        requirement.id,
        Buffer.from('%PDF-repeated-second'),
      );
      const [firstCompleted, secondCompleted] = await Promise.all([
        uploads.complete(actor, firstSessionId),
        uploads.complete(actor, secondSessionId),
      ]);

      const submitted = await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [firstSessionId, secondSessionId],
        idempotencyKey: 'repeated-target-batch',
      });

      expect(submitted.items).toMatchObject([
        {
          sessionId: firstSessionId,
          fileAssetId: firstCompleted.fileAssetId,
          document: {
            currentVersion: 1,
            currentFileAssetId: firstCompleted.fileAssetId,
          },
        },
        {
          sessionId: secondSessionId,
          fileAssetId: secondCompleted.fileAssetId,
          document: {
            currentVersion: 2,
            currentFileAssetId: secondCompleted.fileAssetId,
          },
        },
      ]);
    });

    it('retries failed logical linkage with one finalized inaccessible FileAsset and no retransmission', async () => {
      const documentType = 'Hồ sơ retry liên kết';
      const definition = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          documentType,
          documentName: documentType,
          status: 'MISSING',
        },
      });
      requirementIds.push(definition.id);
      const bytes = Buffer.from('%PDF-link-retry');
      const session = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        stageOneDocument: {
          definitionId: definition.id,
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: actor.userId,
          idempotencyKey: 'integration-link-retry',
        },
        originalFilename: 'link-retry.pdf',
        declaredSize: bytes.length,
        mimeType: 'application/pdf',
      });
      await uploads.part(
        actor,
        session.id as string,
        1,
        checksum(bytes),
        Readable.from(bytes),
      );
      const putStream = vi.spyOn(storage, 'putStream');
      const failedLink = new UploadsService(
        prisma as never,
        storage,
        products,
        {
          assertUploadTarget: stageOne.assertUploadTarget.bind(stageOne),
          linkUploadFileInTransaction: vi
            .fn()
            .mockRejectedValue(new Error('link failed')),
        } as never,
      );

      const completed = await failedLink.complete(actor, session.id as string);
      await expect(
        failedLink.submit(actor, {
          projectId: primaryProjectId,
          sessionIds: [session.id as string],
          idempotencyKey: 'submit-link-retry-failed',
        }),
      ).rejects.toThrow('link failed');
      const recoverable = await prisma.uploadSession.findUniqueOrThrow({
        where: { id: session.id as string },
      });
      expect(recoverable).toMatchObject({
        status: 'AVAILABLE',
        fileAssetId: completed.fileAssetId,
      });
      await expect(
        files.download(actor, recoverable.fileAssetId!),
      ).rejects.toBeInstanceOf(NotFoundException);

      const submitted = await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [session.id as string],
        idempotencyKey: 'submit-link-retry-success',
      });
      expect(submitted.items[0]).toMatchObject({
        sessionId: session.id,
        fileAssetId: recoverable.fileAssetId,
      });
      expect(putStream).toHaveBeenCalledOnce();
      expect(
        await prisma.fileAsset.count({
          where: { uploadSession: { id: session.id as string } },
        }),
      ).toBe(1);
      expect(
        await prisma.entityAttachment.count({
          where: { fileAssetId: recoverable.fileAssetId! },
        }),
      ).toBe(1);
      const documentId = submitted.items[0]!.document.id;
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: documentId,
            event: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
          },
        }),
      ).toBe(1);
      putStream.mockRestore();
    });

    it('keeps Matrix and Workflow uploads disjoint without duplicating physical files or actor identity', async () => {
      const createDefinition = async (
        projectId: string,
        documentType: string,
        initialMatrix: boolean,
      ) => {
        const definition = await prisma.projectRequiredDocument.create({
          data: {
            organizationId,
            projectId,
            stageKey: 'STAGE_1',
            workstreamKey: 'ASSIGNMENT',
            documentType,
            documentName: documentType,
            initialMatrix,
            status: 'MISSING',
          },
        });
        requirementIds.push(definition.id);
        return definition;
      };
      const matrixDefinition = await createDefinition(
        primaryProjectId,
        `Matrix ${run}`,
        true,
      );
      const workflowDefinition = await createDefinition(
        primaryProjectId,
        `Workflow ${run}`,
        false,
      );
      const crossProjectDefinition = await createDefinition(
        otherProjectId,
        `Cross Project ${run}`,
        false,
      );
      const request = (
        definitionId: string,
        contextType: 'STAGE_MATRIX_DOCUMENT' | 'STAGE_WORKFLOW_STEP_DOCUMENT',
        idempotencyKey: string,
      ) => ({
        projectId: primaryProjectId,
        stageOneDocument: {
          definitionId,
          stageKey: 'STAGE_1' as const,
          workstreamKey: 'ASSIGNMENT',
          contextType,
          submittedOfficerId: officerId,
          idempotencyKey,
        },
        originalFilename: `${idempotencyKey}.pdf`,
        declaredSize: 8,
        mimeType: 'application/pdf',
      });
      const rejected = await Promise.all([
        uploads
          .initiate(
            actor,
            request(
              workflowDefinition.id,
              'STAGE_MATRIX_DOCUMENT',
              'context-mismatch',
            ),
          )
          .catch((error: unknown) => error),
        uploads
          .initiate(
            actor,
            request(
              crossProjectDefinition.id,
              'STAGE_WORKFLOW_STEP_DOCUMENT',
              'cross-project-definition',
            ),
          )
          .catch((error: unknown) => error),
        uploads
          .initiate(
            otherActor,
            request(
              workflowDefinition.id,
              'STAGE_WORKFLOW_STEP_DOCUMENT',
              'non-member',
            ),
          )
          .catch((error: unknown) => error),
      ]);
      expect(rejected).toEqual(
        rejected.map(() => expect.any(NotFoundException)),
      );
      expect(JSON.stringify(rejected)).not.toMatch(
        /context-mismatch\.pdf|cross-project-definition\.pdf|non-member\.pdf/,
      );

      const upload = async (
        definitionId: string,
        contextType: 'STAGE_MATRIX_DOCUMENT' | 'STAGE_WORKFLOW_STEP_DOCUMENT',
        idempotencyKey: string,
        bytes: Buffer,
      ) => {
        const session = await uploads.initiate(actor, {
          ...request(definitionId, contextType, idempotencyKey),
          declaredSize: bytes.length,
        });
        await uploads.part(
          actor,
          session.id as string,
          1,
          checksum(bytes),
          Readable.from(bytes),
        );
        const completed = await uploads.complete(actor, session.id as string);
        await uploads.submit(actor, {
          projectId: primaryProjectId,
          sessionIds: [session.id as string],
          idempotencyKey: `submit-${idempotencyKey}`,
        });
        return { session, completed };
      };
      const matrix = await upload(
        matrixDefinition.id,
        'STAGE_MATRIX_DOCUMENT',
        'matrix-context',
        Buffer.from('%PDF-matrix'),
      );
      const workflow = await upload(
        workflowDefinition.id,
        'STAGE_WORKFLOW_STEP_DOCUMENT',
        'workflow-context',
        Buffer.from('%PDF-workflow'),
      );
      const [matrixDocument, workflowDocument] = await Promise.all([
        prisma.projectStageOneDocument.findUniqueOrThrow({
          where: { id: matrix.session.stageOneDocumentId! },
        }),
        prisma.projectStageOneDocument.findUniqueOrThrow({
          where: { id: workflow.session.stageOneDocumentId! },
        }),
      ]);
      const fileIds = [
        matrix.completed.fileAssetId as string,
        workflow.completed.fileAssetId as string,
      ];

      expect(matrixDocument.currentFileAssetId).toBe(
        matrix.completed.fileAssetId,
      );
      expect(workflowDocument.currentFileAssetId).toBe(
        workflow.completed.fileAssetId,
      );
      expect(
        await prisma.fileAsset.count({ where: { id: { in: fileIds } } }),
      ).toBe(2);
      expect(new Set(fileIds).size).toBe(2);
      expect(workflowDocument.actualActorId).toBe(actor.userId);
      expect(workflowDocument.submittedOfficerId).toBe(officerId);

      await expect(
        stageOne.deleteDocument(
          actor,
          primaryProjectId,
          matrixDocument.id,
          'STAGE_MATRIX_DOCUMENT',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const deleter = {
        ...actor,
        permissions: [...actor.permissions, 'file.delete'],
      };
      await expect(
        stageOne.deleteDocument(
          deleter,
          primaryProjectId,
          matrixDocument.id,
          'STAGE_WORKFLOW_STEP_DOCUMENT',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        stageOne.deleteDocument(
          deleter,
          otherProjectId,
          matrixDocument.id,
          'STAGE_MATRIX_DOCUMENT',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      await stageOne.deleteDocument(
        deleter,
        primaryProjectId,
        matrixDocument.id,
        'STAGE_MATRIX_DOCUMENT',
      );
      expect(
        await prisma.projectStageOneDocument.findUniqueOrThrow({
          where: { id: matrixDocument.id },
          select: { status: true },
        }),
      ).toEqual({ status: 'SUPERSEDED' });
      expect(
        await prisma.projectStageOneDocument.findUniqueOrThrow({
          where: { id: workflowDocument.id },
          select: { status: true },
        }),
      ).toEqual({ status: 'UPLOADED' });

      await stageOne.deleteDocument(
        deleter,
        primaryProjectId,
        workflowDocument.id,
        'STAGE_WORKFLOW_STEP_DOCUMENT',
      );
      expect(
        await prisma.projectStageOneDocument.count({
          where: {
            id: { in: [matrixDocument.id, workflowDocument.id] },
            status: 'SUPERSEDED',
          },
        }),
      ).toBe(2);
      expect(
        await prisma.fileAsset.count({ where: { id: { in: fileIds } } }),
      ).toBe(2);
      expect(
        await prisma.projectStageOneDocumentVersion.count({
          where: {
            documentId: { in: [matrixDocument.id, workflowDocument.id] },
          },
        }),
      ).toBe(2);
      expect(
        await prisma.entityAttachment.count({
          where: { fileAssetId: { in: fileIds } },
        }),
      ).toBe(2);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: { in: [matrixDocument.id, workflowDocument.id] },
            event: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
          },
        }),
      ).toBe(2);
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: { in: [matrixDocument.id, workflowDocument.id] },
            action: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
          },
        }),
      ).toBe(2);
    });

    it('links independent logical Stage 1 files with audited actor metadata, history, and scoped bytes', async () => {
      const documentType = 'Văn bản chủ trương đầu tư';
      const configured = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          documentType,
          documentName: documentType,
          status: 'MISSING',
        },
      });
      requirementIds.push(configured.id);
      const customDefinition = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          documentType: 'Hồ sơ khác',
          documentName: 'Hồ sơ khác',
          status: 'MISSING',
        },
      });
      requirementIds.push(customDefinition.id);
      const uploadRequest = (
        submittedOfficerId: string,
        idempotencyKey: string,
      ) => ({
        projectId: primaryProjectId,
        stageOneDocument: {
          definitionId: configured.id,
          stageKey: 'STAGE_1' as const,
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
          submittedOfficerId,
          idempotencyKey,
        },
        originalFilename: `${idempotencyKey}.pdf`,
        declaredSize: 8,
        mimeType: 'application/pdf',
      });
      await expect(
        uploads.initiate(
          {
            ...actor,
            permissions: actor.permissions.filter(
              (permission) => permission !== 'project.manage_members',
            ),
          },
          uploadRequest(officerId, 'unauthorized-on-behalf'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        uploads.initiate(
          actor,
          uploadRequest(otherActor.userId, 'outsider-officer'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.projectMember.deleteMany({
        where: { projectId: primaryProjectId, userId: officerId },
      });
      try {
        await expect(
          uploads.initiate(actor, uploadRequest(officerId, 'revoked-officer')),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.projectMember.create({
          data: {
            organizationId,
            projectId: primaryProjectId,
            userId: officerId,
            createdBy: actor.userId,
          },
        });
      }
      const initiateLogical = async (
        idempotencyKey: string,
        bytes: Buffer,
        displayName?: string,
        definitionId = configured.id,
      ) => {
        const request = {
          projectId: primaryProjectId,
          stageOneDocument: {
            definitionId,
            stageKey: 'STAGE_1' as const,
            workstreamKey: 'ASSIGNMENT',
            contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
            displayName,
            submittedOfficerId: officerId,
            idempotencyKey,
          },
          originalFilename: `${idempotencyKey}.pdf`,
          declaredSize: bytes.length,
          mimeType: 'application/pdf',
        };
        const session = await uploads.initiate(actor, request);
        return { request, session };
      };
      const firstBytes = Buffer.from('%PDF-logical-first');
      const [first, firstConcurrentRetry] = await Promise.all([
        initiateLogical('logical-file-1', firstBytes),
        initiateLogical('logical-file-1', firstBytes),
      ]);
      expect(firstConcurrentRetry.session.id).toBe(first.session.id);
      await uploads.part(
        actor,
        first.session.id as string,
        1,
        checksum(firstBytes),
        Readable.from(firstBytes),
      );
      const firstCompleted = await uploads.complete(
        actor,
        first.session.id as string,
      );
      await uploads.complete(actor, first.session.id as string);
      const firstSubmission = {
        projectId: primaryProjectId,
        sessionIds: [first.session.id as string],
        idempotencyKey: 'submit-logical-file-1',
      };
      const [firstSubmitted, firstSubmitRetry] = await Promise.all([
        uploads.submit(actor, firstSubmission),
        uploads.submit(actor, firstSubmission),
      ]);
      expect(firstSubmitRetry).toEqual(firstSubmitted);

      const secondBytes = Buffer.from('%PDF-logical-second');
      const second = await initiateLogical('logical-file-2', secondBytes);
      await uploads.part(
        actor,
        second.session.id as string,
        1,
        checksum(secondBytes),
        Readable.from(secondBytes),
      );
      const secondCompleted = await uploads.complete(
        actor,
        second.session.id as string,
      );
      await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [second.session.id as string],
        idempotencyKey: 'submit-logical-file-2',
      });

      const customBytes = Buffer.from('%PDF-logical-custom');
      const custom = await initiateLogical(
        'logical-file-custom',
        customBytes,
        'Hồ sơ pháp lý bổ sung',
        customDefinition.id,
      );
      await uploads.part(
        actor,
        custom.session.id as string,
        1,
        checksum(customBytes),
        Readable.from(customBytes),
      );
      const customCompleted = await uploads.complete(
        actor,
        custom.session.id as string,
      );
      await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [custom.session.id as string],
        idempotencyKey: 'submit-logical-file-custom',
      });

      const versionedTarget = {
        definitionId: configured.id,
        stageKey: 'STAGE_1' as const,
        workstreamKey: 'ASSIGNMENT',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
        submittedOfficerId: officerId,
        idempotencyKey: 'logical-versioned',
      };
      const versionedDocument = await stageOne.createUploadTarget(
        actor,
        primaryProjectId,
        versionedTarget,
      );
      const priorBytes = Buffer.from('%PDF-logical-prior');
      const priorStorageKey = await storage.put(organizationId, priorBytes);
      const priorAsset = await prisma.fileAsset.create({
        data: {
          organizationId,
          originalFilename: 'logical-prior.pdf',
          storedFilename: `logical-prior-${run}`,
          mimeType: 'application/pdf',
          sizeBytes: priorBytes.length,
          storageKey: priorStorageKey,
          checksum: checksum(priorBytes),
          category: 'PROJECT_DOCUMENT',
          uploadedById: actor.userId,
        },
      });
      fileAssetIds.push(priorAsset.id);
      await prisma.$transaction([
        prisma.entityAttachment.create({
          data: {
            fileAssetId: priorAsset.id,
            entityType: 'ProjectStageOneDocument',
            entityId: versionedDocument.id,
            projectId: primaryProjectId,
            createdBy: actor.userId,
          },
        }),
        prisma.projectStageOneDocumentVersion.create({
          data: {
            documentId: versionedDocument.id,
            version: 1,
            fileAssetId: priorAsset.id,
            status: 'UPLOADED',
            submittedOfficerId: officerId,
            actualActorId: actor.userId,
          },
        }),
        prisma.projectStageOneDocument.update({
          where: { id: versionedDocument.id },
          data: {
            currentFileAssetId: priorAsset.id,
            currentVersion: 1,
            status: 'UPLOADED',
          },
        }),
      ]);
      const currentBytes = Buffer.from('%PDF-logical-current');
      const versioned = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        stageOneDocument: versionedTarget,
        originalFilename: 'logical-current.pdf',
        declaredSize: currentBytes.length,
        mimeType: 'application/pdf',
      });
      await uploads.part(
        actor,
        versioned.id as string,
        1,
        checksum(currentBytes),
        Readable.from(currentBytes),
      );
      const versionedCompleted = await uploads.complete(
        actor,
        versioned.id as string,
      );
      await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [versioned.id as string],
        idempotencyKey: 'submit-logical-versioned',
      });

      const reloaded = await stageOne.getSimple(
        {
          ...actor,
          permissions: [...actor.permissions, 'project.read', 'estimate.read'],
        },
        primaryProjectId,
      );
      const reloadedFiles = reloaded.workflow.definitions.find(
        ({ id }) => id === configured.id,
      )?.files;
      expect(reloadedFiles).toHaveLength(3);
      expect(reloadedFiles).toEqual(
        expect.arrayContaining(
          [
            firstCompleted.fileAssetId,
            secondCompleted.fileAssetId,
            versionedCompleted.fileAssetId,
          ].map((currentFileAssetId) =>
            expect.objectContaining({ currentFileAssetId }),
          ),
        ),
      );
      expect(
        reloaded.workflow.definitions.find(
          ({ id }) => id === customDefinition.id,
        )?.files,
      ).toEqual([
        expect.objectContaining({
          currentFileAssetId: customCompleted.fileAssetId,
          displayName: 'Hồ sơ pháp lý bổ sung',
        }),
      ]);

      const documents = await prisma.projectStageOneDocument.findMany({
        where: { projectId: primaryProjectId },
        orderBy: { idempotencyKey: 'asc' },
      });
      expect(documents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            idempotencyKey: 'logical-file-1',
            documentType,
            displayName: 'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án',
            requiredDocumentId: configured.id,
            submittedOfficerId: officerId,
            actualActorId: actor.userId,
            currentFileAssetId: firstCompleted.fileAssetId,
            currentVersion: 1,
          }),
          expect.objectContaining({
            idempotencyKey: 'logical-file-2',
            documentType,
            currentFileAssetId: secondCompleted.fileAssetId,
          }),
          expect.objectContaining({
            idempotencyKey: 'logical-file-custom',
            documentType: 'Hồ sơ khác',
            displayName: 'Hồ sơ pháp lý bổ sung',
          }),
        ]),
      );
      expect(
        await prisma.projectStageOneDocument.count({
          where: { projectId: primaryProjectId, documentType },
        }),
      ).toBe(3);
      const firstDocument = documents.find(
        ({ idempotencyKey }) => idempotencyKey === 'logical-file-1',
      )!;
      expect(
        await prisma.uploadSession.count({
          where: { stageOneDocumentId: firstDocument.id },
        }),
      ).toBe(1);
      expect(
        await prisma.fileAsset.count({
          where: { uploadSession: { id: first.session.id as string } },
        }),
      ).toBe(1);
      expect(
        await prisma.entityAttachment.count({
          where: {
            fileAssetId: firstCompleted.fileAssetId as string,
            entityType: 'ProjectStageOneDocument',
            entityId: firstDocument.id,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.projectStageOneDocumentVersion.count({
          where: { documentId: firstDocument.id },
        }),
      ).toBe(1);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: firstDocument.id,
            event: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
          },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: firstDocument.id,
            action: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
          },
        }),
      ).toBe(1);
      expect(
        await prisma.activity.findFirstOrThrow({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: firstDocument.id,
            event: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
          },
          select: { actorId: true, metadata: true },
        }),
      ).toMatchObject({
        actorId: actor.userId,
        metadata: {
          submittedOfficerId: officerId,
        },
      });
      expect(
        await prisma.activity.findFirstOrThrow({
          where: {
            entityType: 'Project',
            entityId: primaryProjectId,
            event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
            metadata: {
              path: ['idempotencyKey'],
              equals: 'submit-logical-file-1',
            },
          },
          select: { actorId: true, metadata: true },
        }),
      ).toMatchObject({
        actorId: actor.userId,
        metadata: {
          sessionIds: [first.session.id],
          result: {
            items: [
              {
                sessionId: first.session.id,
                fileAssetId: firstCompleted.fileAssetId,
                document: { id: firstDocument.id },
              },
            ],
          },
        },
      });
      const history = await stageOne.documentHistory(
        { ...actor, permissions: [...actor.permissions, 'project.read'] },
        primaryProjectId,
        firstDocument.id,
      );
      expect(history).toMatchObject({
        currentVersion: 1,
        versions: [
          {
            version: 1,
            downloadId: firstCompleted.fileAssetId,
            submittedOfficer: { id: officerId },
            actualActor: { id: actor.userId },
          },
        ],
      });
      expect(JSON.stringify(history)).not.toMatch(
        /storageKey|checksum|storedFilename|idempotencyKey/,
      );
      const versionedHistory = await stageOne.documentHistory(
        { ...actor, permissions: [...actor.permissions, 'project.read'] },
        primaryProjectId,
        versionedDocument.id,
      );
      expect(versionedHistory).toMatchObject({
        currentVersion: 2,
        versions: [
          { version: 2, downloadId: versionedCompleted.fileAssetId },
          { version: 1, downloadId: priorAsset.id },
        ],
      });
      const priorDownload = await files.download(actor, priorAsset.id);
      const priorChunks: Buffer[] = [];
      for await (const chunk of priorDownload.data)
        priorChunks.push(Buffer.from(chunk));
      expect(Buffer.concat(priorChunks)).toEqual(priorBytes);
      const authorized = await files.download(
        actor,
        firstCompleted.fileAssetId as string,
      );
      const authorizedChunks: Buffer[] = [];
      for await (const chunk of authorized.data)
        authorizedChunks.push(Buffer.from(chunk));
      expect(Buffer.concat(authorizedChunks)).toEqual(firstBytes);
      await expect(
        files.download(otherActor, firstCompleted.fileAssetId as string),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        uploads.initiate(actor, {
          ...first.request,
          projectId: otherProjectId,
          stageOneDocument: {
            ...first.request.stageOneDocument,
            idempotencyKey: 'cross-project',
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await prisma.projectMember.deleteMany({
        where: { projectId: primaryProjectId, userId: actor.userId },
      });
      try {
        await expect(
          uploads.get(actor, first.session.id as string),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          files.download(actor, firstCompleted.fileAssetId as string),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.projectMember.create({
          data: {
            organizationId,
            projectId: primaryProjectId,
            userId: actor.userId,
            createdBy: actor.userId,
          },
        });
      }
    });

    it('links a Stage 2 definition through the same logical upload and download path', async () => {
      const definition = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          stageKey: 'STAGE_2',
          workstreamKey: 'PLAN',
          documentType: 'Kế hoạch triển khai',
          documentName: 'Kế hoạch triển khai',
          initialMatrix: true,
          status: 'MISSING',
        },
      });
      requirementIds.push(definition.id);
      const bytes = Buffer.from('%PDF-stage-two');
      const session = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        stageOneDocument: {
          definitionId: definition.id,
          stageKey: 'STAGE_2',
          workstreamKey: 'PLAN',
          contextType: 'STAGE_MATRIX_DOCUMENT',
          submittedOfficerId: actor.userId,
          idempotencyKey: 'stage-two-file',
        },
        originalFilename: 'ke-hoach-trien-khai.pdf',
        declaredSize: bytes.length,
        mimeType: 'application/pdf',
      });
      await uploads.part(
        actor,
        session.id as string,
        1,
        checksum(bytes),
        Readable.from(bytes),
      );
      const completed = await uploads.complete(actor, session.id as string);
      const submitted = await uploads.submit(actor, {
        projectId: primaryProjectId,
        sessionIds: [session.id as string],
        idempotencyKey: 'submit-stage-two-file',
      });
      const document = await prisma.projectStageOneDocument.findUniqueOrThrow({
        where: { id: submitted.items[0]!.document.id },
      });

      expect(document).toMatchObject({
        requiredDocumentId: definition.id,
        stageKey: 'STAGE_2',
        workstreamKey: 'PLAN',
        step: null,
        currentFileAssetId: completed.fileAssetId,
      });
      const downloaded = await files.download(
        actor,
        completed.fileAssetId as string,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.data)
        chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(bytes);
    });

    it('reauthorizes logical financial evidence and omits its metadata from unpermitted lists', async () => {
      const definition = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          stageKey: 'STAGE_1',
          workstreamKey: 'FINANCIAL_PLANNING',
          documentType: 'PRELIMINARY_FINANCIAL_PLAN',
          documentName: 'Kế hoạch tài chính sơ bộ',
          status: 'MISSING',
        },
      });
      requirementIds.push(definition.id);
      const financialActor = {
        ...actor,
        permissions: [
          ...actor.permissions,
          'project.stage1.finance.manage',
          'project.stage1.finance.read',
        ],
      };
      const bytes = Buffer.from('%PDF-financial');
      const session = await uploads.initiate(financialActor, {
        projectId: primaryProjectId,
        stageOneDocument: {
          definitionId: definition.id,
          stageKey: 'STAGE_1',
          workstreamKey: 'FINANCIAL_PLANNING',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: actor.userId,
          idempotencyKey: 'financial-file',
        },
        originalFilename: 'ke-hoach-tai-chinh.pdf',
        declaredSize: bytes.length,
        mimeType: 'application/pdf',
      });
      await uploads.part(
        financialActor,
        session.id as string,
        1,
        checksum(bytes),
        Readable.from(bytes),
      );

      await expect(
        uploads.complete(actor, session.id as string),
      ).rejects.toBeInstanceOf(NotFoundException);
      const completed = await uploads.complete(
        financialActor,
        session.id as string,
      );
      await expect(
        uploads.submit(actor, {
          projectId: primaryProjectId,
          sessionIds: [session.id as string],
          idempotencyKey: 'submit-financial-file',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const submitted = await uploads.submit(financialActor, {
        projectId: primaryProjectId,
        sessionIds: [session.id as string],
        idempotencyKey: 'submit-financial-file',
      });
      const listed = await files.list(actor, {
        page: 1,
        pageSize: 100,
        projectId: primaryProjectId,
      });
      expect(listed.items).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: completed.fileAssetId }),
        ]),
      );
      const reader = {
        ...actor,
        permissions: [...actor.permissions, 'project.read', 'estimate.read'],
      };
      const simple = await stageOne.getSimple(reader, primaryProjectId);
      expect(simple.workflow.definitions).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: definition.id }),
        ]),
      );
      expect(simple.workflow.documents).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            currentFileAssetId: completed.fileAssetId,
          }),
        ]),
      );
      await expect(
        stageOne.documentHistory(
          reader,
          primaryProjectId,
          submitted.items[0]!.document.id,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('appends an explicit new version to a reloaded logical document exactly once', async () => {
      const documentType = 'Biên bản khảo sát';
      const configured = await prisma.projectRequiredDocument.create({
        data: {
          organizationId,
          projectId: primaryProjectId,
          stageKey: 'STAGE_1',
          workstreamKey: 'SURVEY',
          documentType,
          documentName: documentType,
          status: 'MISSING',
        },
      });
      requirementIds.push(configured.id);
      const upload = async (
        stageOneDocument: {
          definitionId: string;
          stageKey: 'STAGE_1';
          workstreamKey: string;
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT';
          submittedOfficerId: string;
          documentId?: string;
          idempotencyKey: string;
        },
        filename: string,
        bytes: Buffer,
      ) => {
        const session = await uploads.initiate(actor, {
          projectId: primaryProjectId,
          stageOneDocument,
          originalFilename: filename,
          declaredSize: bytes.length,
          mimeType: 'application/pdf',
        } as never);
        await uploads.part(
          actor,
          session.id as string,
          1,
          checksum(bytes),
          Readable.from(bytes),
        );
        const completed = await uploads.complete(actor, session.id as string);
        const submitted = await uploads.submit(actor, {
          projectId: primaryProjectId,
          sessionIds: [session.id as string],
          idempotencyKey: `submit-${stageOneDocument.idempotencyKey}`,
        });
        return { ...completed, document: submitted.items[0]!.document };
      };
      const firstBytes = Buffer.from('%PDF-explicit-version-1');
      const first = await upload(
        {
          definitionId: configured.id,
          stageKey: 'STAGE_1',
          workstreamKey: 'SURVEY',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: officerId,
          idempotencyKey: 'explicit-version-1',
        },
        'explicit-version-1.pdf',
        firstBytes,
      );
      const documentId = first.document.id;
      const versionTwoRequest = {
        projectId: primaryProjectId,
        stageOneDocument: {
          definitionId: configured.id,
          stageKey: 'STAGE_1' as const,
          workstreamKey: 'SURVEY',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
          submittedOfficerId: officerId,
          documentId,
          idempotencyKey: 'explicit-version-2',
        },
        originalFilename: 'explicit-version-2.pdf',
        declaredSize: Buffer.byteLength('%PDF-explicit-version-2'),
        mimeType: 'application/pdf',
      };

      const [versionTwoSession, concurrentRetry] = await Promise.all([
        uploads.initiate(actor, versionTwoRequest),
        uploads.initiate(actor, versionTwoRequest),
      ]);
      expect(concurrentRetry.id).toBe(versionTwoSession.id);
      const secondBytes = Buffer.from('%PDF-explicit-version-2');
      await uploads.part(
        actor,
        versionTwoSession.id as string,
        1,
        checksum(secondBytes),
        Readable.from(secondBytes),
      );
      const second = await uploads.complete(
        actor,
        versionTwoSession.id as string,
      );
      await uploads.complete(actor, versionTwoSession.id as string);
      const versionTwoSubmission = {
        projectId: primaryProjectId,
        sessionIds: [versionTwoSession.id as string],
        idempotencyKey: 'submit-explicit-version-2',
      };
      const [submittedSecond, submittedSecondRetry] = await Promise.all([
        uploads.submit(actor, versionTwoSubmission),
        uploads.submit(actor, versionTwoSubmission),
      ]);
      expect(submittedSecondRetry).toEqual(submittedSecond);
      await expect(
        uploads.initiate(actor, versionTwoRequest),
      ).resolves.toMatchObject({ id: versionTwoSession.id });
      await expect(
        uploads.initiate(officerActor, versionTwoRequest),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(JSON.stringify(second)).not.toMatch(
        /idempotencyKey|storageKey|providerUploadId|actualActorId|submittedOfficerId/,
      );
      const history = await stageOne.documentHistory(
        { ...actor, permissions: [...actor.permissions, 'project.read'] },
        primaryProjectId,
        documentId,
      );
      expect(history).toMatchObject({
        currentVersion: 2,
        versions: [
          {
            version: 2,
            downloadId: second.fileAssetId,
            submittedOfficer: { id: officerId },
            actualActor: { id: actor.userId },
          },
          {
            version: 1,
            downloadId: first.fileAssetId,
            submittedOfficer: { id: officerId },
            actualActor: { id: actor.userId },
          },
        ],
      });
      expect(
        await prisma.projectStageOneDocumentVersion.count({
          where: { documentId },
        }),
      ).toBe(2);
      expect(
        await prisma.uploadSession.count({
          where: { stageOneDocumentId: documentId },
        }),
      ).toBe(2);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: documentId,
            event: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
          },
        }),
      ).toBe(2);
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'ProjectStageOneDocument',
            entityId: documentId,
            action: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
          },
        }),
      ).toBe(2);
      for (const { fileAssetId, bytes } of [
        { fileAssetId: first.fileAssetId as string, bytes: firstBytes },
        { fileAssetId: second.fileAssetId as string, bytes: secondBytes },
      ]) {
        const download = await files.download(actor, fileAssetId);
        const chunks: Buffer[] = [];
        for await (const chunk of download.data)
          chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks)).toEqual(bytes);
      }

      await expect(
        uploads.initiate(actor, {
          ...versionTwoRequest,
          projectId: otherProjectId,
          stageOneDocument: {
            ...versionTwoRequest.stageOneDocument,
            documentId,
            idempotencyKey: 'cross-project-version',
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        uploads.initiate(otherActor, {
          ...versionTwoRequest,
          stageOneDocument: {
            ...versionTwoRequest.stageOneDocument,
            documentId,
            idempotencyKey: 'outsider-version',
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        uploads.initiate(actor, {
          ...versionTwoRequest,
          stageOneDocument: {
            ...versionTwoRequest.stageOneDocument,
            documentId: '00000000-0000-4000-8000-000000000099',
            idempotencyKey: 'missing-version-target',
          },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.projectStageOneDocument.update({
        where: { id: documentId },
        data: { status: 'SUPERSEDED' },
      });
      try {
        await expect(
          uploads.initiate(actor, {
            ...versionTwoRequest,
            stageOneDocument: {
              ...versionTwoRequest.stageOneDocument,
              documentId,
              idempotencyKey: 'superseded-version',
            },
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.projectStageOneDocument.update({
          where: { id: documentId },
          data: { status: 'UPLOADED' },
        });
      }
      await prisma.projectMember.deleteMany({
        where: { projectId: primaryProjectId, userId: actor.userId },
      });
      try {
        await expect(
          uploads.initiate(actor, {
            ...versionTwoRequest,
            stageOneDocument: {
              ...versionTwoRequest.stageOneDocument,
              documentId,
              idempotencyKey: 'revoked-version',
            },
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      } finally {
        await prisma.projectMember.create({
          data: {
            organizationId,
            projectId: primaryProjectId,
            userId: actor.userId,
            createdBy: actor.userId,
          },
        });
      }
    });

    it('deterministically gives one completion the VERIFYING claim and preserves its bytes and prior version', async () => {
      const previous = await createPreviousAsset('complete-previous');
      const requirement = await createRequirement(
        primaryProjectId,
        'complete',
        {
          currentFileAssetId: previous.id,
          currentVersion: 1,
          notes: 'Prior version note',
        },
      );
      const bytes = Buffer.from('%PDF-complete');
      const sessionId = await initiateAndPart(requirement.id, bytes);
      const gate = gatedCompletion();
      const winner = gate.uploads.complete(actor, sessionId);
      await gate.entered;
      try {
        expect(
          await prisma.uploadSession.findUniqueOrThrow({
            where: { id: sessionId },
            select: { status: true },
          }),
        ).toEqual({ status: 'VERIFYING' });
        await expect(
          gate.uploads.complete(actor, sessionId),
        ).rejects.toBeInstanceOf(ConflictException);
      } finally {
        gate.release();
      }
      const completed = await winner;
      const retry = await uploads.complete(actor, sessionId);
      const finalized = await prisma.uploadSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(completed).toMatchObject({
        status: 'AVAILABLE',
        fileAssetId: finalized.fileAssetId,
      });
      expect(retry).toMatchObject({
        status: 'AVAILABLE',
        fileAssetId: finalized.fileAssetId,
      });
      expect(
        await prisma.fileAsset.count({
          where: { uploadSession: { id: sessionId } },
        }),
      ).toBe(1);
      expect(
        await prisma.entityAttachment.count({
          where: {
            fileAssetId: finalized.fileAssetId!,
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
          },
        }),
      ).toBe(0);
      const asset = await prisma.fileAsset.findUniqueOrThrow({
        where: { id: finalized.fileAssetId! },
      });
      expect(await readStored(asset.storageKey)).toEqual(bytes);
      expect(
        await prisma.projectRequiredDocument.findUniqueOrThrow({
          where: { id: requirement.id },
        }),
      ).toMatchObject({
        currentFileAssetId: previous.id,
        currentVersion: 1,
        notes: 'Prior version note',
      });
      expect(
        await prisma.projectRequiredDocumentVersion.findMany({
          where: { requirementId: requirement.id },
          orderBy: { version: 'asc' },
        }),
      ).toEqual([]);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
            event: 'PROJECT_DOCUMENT_FILE_LINKED',
          },
        }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: requirement.id,
            action: 'PROJECT_DOCUMENT_FILE_LINKED',
          },
        }),
      ).toBe(0);
    });

    it('does not let abort race with a delayed part or a claimed completion resurrect or delete a winner', async () => {
      const delayedRequirement = await createRequirement(
        primaryProjectId,
        'delayed',
      );
      const delayedSession = await uploads.initiate(actor, {
        projectId: primaryProjectId,
        requiredDocumentId: delayedRequirement.id,
        idempotencyKey: 'delayed-part-race',
        originalFilename: 'delayed.pdf',
        declaredSize: 10,
        mimeType: 'application/pdf',
      });
      let release!: () => void;
      let started!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const writing = new Promise<void>((resolve) => (started = resolve));
      let emitted = false;
      const body = new Readable({
        read() {
          if (emitted) return;
          emitted = true;
          this.push('%PDF-');
          started();
          void released.then(() => {
            this.push('delay');
            this.push(null);
          });
        },
      });
      const delayedPart = uploads.part(
        actor,
        delayedSession.id as string,
        1,
        checksum(Buffer.from('%PDF-delay')),
        body,
      );
      await writing;
      try {
        await uploads.abort(actor, delayedSession.id as string);
      } finally {
        release();
      }
      await expect(delayedPart).rejects.toBeDefined();
      expect(
        await prisma.uploadSession.findUniqueOrThrow({
          where: { id: delayedSession.id as string },
          select: { status: true, parts: true },
        }),
      ).toEqual({ status: 'ABORTED', parts: [] });

      const completingRequirement = await createRequirement(
        primaryProjectId,
        'abort-complete',
        {
          currentFileAssetId: (
            await createPreviousAsset('abort-complete-previous')
          ).id,
          currentVersion: 1,
        },
      );
      const completingBytes = Buffer.from('%PDF-abort-complete');
      const completingSessionId = await initiateAndPart(
        completingRequirement.id,
        completingBytes,
      );
      const gate = gatedCompletion();
      const completing = gate.uploads.complete(actor, completingSessionId);
      await gate.entered;
      try {
        expect(
          await prisma.uploadSession.findUniqueOrThrow({
            where: { id: completingSessionId },
            select: { status: true },
          }),
        ).toEqual({ status: 'VERIFYING' });
        await expect(
          gate.uploads.abort(actor, completingSessionId),
        ).rejects.toBeInstanceOf(ConflictException);
      } finally {
        gate.release();
      }
      await expect(completing).resolves.toMatchObject({ status: 'AVAILABLE' });
      const winner = await prisma.uploadSession.findUniqueOrThrow({
        where: { id: completingSessionId },
      });
      expect(winner).toMatchObject({ status: 'AVAILABLE' });
      expect(
        await prisma.fileAsset.count({
          where: { uploadSession: { id: completingSessionId } },
        }),
      ).toBe(1);
      expect(
        await prisma.entityAttachment.count({
          where: {
            fileAssetId: winner.fileAssetId!,
            entityType: 'ProjectRequiredDocument',
            entityId: completingRequirement.id,
          },
        }),
      ).toBe(0);
      expect(
        await prisma.projectRequiredDocumentVersion.count({
          where: { requirementId: completingRequirement.id },
        }),
      ).toBe(0);
      expect(
        await prisma.activity.count({
          where: {
            entityType: 'ProjectRequiredDocument',
            entityId: completingRequirement.id,
            event: 'PROJECT_DOCUMENT_FILE_LINKED',
          },
        }),
      ).toBe(0);
      const asset = await prisma.fileAsset.findUniqueOrThrow({
        where: { id: winner.fileAssetId! },
      });
      expect(await readStored(asset.storageKey)).toEqual(completingBytes);
    });
  },
);
