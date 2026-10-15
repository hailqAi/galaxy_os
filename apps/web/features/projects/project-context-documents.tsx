'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api, type Actor } from '../../app/lib/api';
import type { UploadConstraints } from '../../app/projects/[projectId]/documents/document-upload';
import {
  mergeProjectDocumentQueue,
  ProjectDocumentUploadQueue,
  projectDocumentPendingBatchItems,
  projectDocumentQueueBlocksClose,
  projectDocumentQueueKey,
  readProjectDocumentPendingBatch,
  reconcileProjectDocumentPendingBatch,
  recoverProjectDocumentQueues,
  retryProjectDocumentPendingBatch,
  type ProjectDocumentQueueItem,
  type ProjectDocumentStageKey,
} from './project-document-upload-queue';

type RequiredDocumentTarget = {
  id: string;
  documentName: string;
  stageKey: ProjectDocumentStageKey;
  workstreamKey: string;
};

type ProjectContextDocumentsProps = {
  actorPermissions: readonly string[];
  document: RequiredDocumentTarget;
  onClose: () => void;
  onCloseBlockedChange?: (blocked: boolean) => void;
  onComplete: () => void | Promise<void>;
  onMessage: (message: string) => void;
  projectId: string;
};

const canUpload = (permissions: readonly string[]) =>
  permissions.includes('file.upload') &&
  permissions.includes('project.document.manage');

const contextKey = (projectId: string, document: RequiredDocumentTarget) =>
  projectDocumentQueueKey(
    projectId,
    document.stageKey,
    document.workstreamKey,
    document.id,
    'STAGE_MATRIX_DOCUMENT',
    'REQUIRED_DOCUMENT',
  );

export const mergeRecoveredProjectContextQueue = (
  current: ProjectDocumentQueueItem[],
  recovered: ProjectDocumentQueueItem[],
  pending: ProjectDocumentQueueItem[] = [],
) =>
  mergeProjectDocumentQueue(
    mergeProjectDocumentQueue(current, recovered),
    pending,
  );

export function ProjectContextDocuments(props: ProjectContextDocumentsProps) {
  const key = contextKey(props.projectId, props.document);
  if (!canUpload(props.actorPermissions)) return null;
  return (
    <ProjectContextDocumentsContext key={key} {...props} contextKey={key} />
  );
}

function ProjectContextDocumentsContext({
  contextKey: key,
  document,
  onClose,
  onCloseBlockedChange,
  onComplete,
  onMessage,
  projectId,
}: ProjectContextDocumentsProps & { contextKey: string }) {
  const [actor, setActor] = useState<Actor>();
  const [constraints, setConstraints] = useState<UploadConstraints>();
  const [queue, setQueue] = useState<ProjectDocumentQueueItem[]>([]);
  const [abortPending, setAbortPending] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onMessageRef = useRef(onMessage);
  const closeBlocked = projectDocumentQueueBlocksClose(queue, abortPending);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onMessageRef.current = onMessage;
  }, [onComplete, onMessage]);

  useEffect(() => {
    onCloseBlockedChange?.(closeBlocked);
  }, [closeBlocked, onCloseBlockedChange]);

  useEffect(() => () => onCloseBlockedChange?.(false), [onCloseBlockedChange]);

  useEffect(() => {
    let current = true;
    void Promise.all([
      api<Actor>('/me'),
      api<UploadConstraints>('/uploads/constraints'),
    ])
      .then(([nextActor, nextConstraints]) => {
        if (!current) return;
        setActor(nextActor);
        setConstraints(nextConstraints);
      })
      .catch(() => {
        if (current)
          onMessageRef.current('Không thể chuẩn bị khu vực tải hồ sơ.');
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!actor || !canUpload(actor.permissions)) return;
    let current = true;
    const target = {
      projectId,
      definitions: [
        {
          id: document.id,
          name: document.documentName,
          stageKey: document.stageKey,
          workstreamKey: document.workstreamKey,
          submittedOfficerId: actor.userId,
          contextType: 'STAGE_MATRIX_DOCUMENT' as const,
          targetType: 'REQUIRED_DOCUMENT' as const,
        },
      ],
    };
    const batchContext = {
      projectId,
      stageKey: document.stageKey,
      workstreamKey: document.workstreamKey,
      definitionId: document.id,
      contextType: 'STAGE_MATRIX_DOCUMENT' as const,
      targetType: 'REQUIRED_DOCUMENT' as const,
      actorUserId: actor.userId,
      organizationId: actor.organization.id,
    };
    const pending = readProjectDocumentPendingBatch(
      sessionStorage,
      batchContext,
    );
    void recoverProjectDocumentQueues(target)
      .then(async (recovered) => {
        if (!current) return;
        const recoveredItems = recovered[key] ?? [];
        if (!pending) {
          setQueue((currentQueue) =>
            mergeRecoveredProjectContextQueue(currentQueue, recoveredItems),
          );
          return;
        }
        const reconciled = await reconcileProjectDocumentPendingBatch(
          sessionStorage,
          pending,
          recoveredItems.flatMap(({ sessionId }) =>
            sessionId ? [sessionId] : [],
          ),
        );
        if (!current) return;
        if (!reconciled.batch) {
          setQueue((currentQueue) =>
            mergeRecoveredProjectContextQueue(currentQueue, recoveredItems),
          );
          return;
        }
        setQueue((currentQueue) =>
          mergeRecoveredProjectContextQueue(
            currentQueue,
            recoveredItems,
            projectDocumentPendingBatchItems(reconciled.batch, 'SUBMITTING'),
          ),
        );
        try {
          await retryProjectDocumentPendingBatch(
            sessionStorage,
            reconciled.batch,
            api,
            onCompleteRef.current,
          );
          if (current) setQueue([]);
        } catch {
          if (current) {
            setQueue((currentQueue) =>
              mergeRecoveredProjectContextQueue(
                currentQueue,
                recoveredItems,
                projectDocumentPendingBatchItems(reconciled.batch),
              ),
            );
            onMessageRef.current(
              'Không thể nộp lại bản tải tạm. Vui lòng thử lại.',
            );
          }
        }
      })
      .catch(() => {
        if (!current) return;
        if (pending)
          setQueue((currentQueue) =>
            mergeRecoveredProjectContextQueue(
              currentQueue,
              projectDocumentPendingBatchItems(pending),
            ),
          );
        onMessageRef.current('Không thể khôi phục các tệp tải tạm.');
      });
    return () => {
      current = false;
    };
  }, [
    actor,
    document.documentName,
    document.id,
    document.stageKey,
    document.workstreamKey,
    key,
    projectId,
  ]);

  return (
    <section data-project-context-documents={key}>
      {!actor || !constraints ? (
        <p role="status">Đang chuẩn bị khu vực tải hồ sơ…</p>
      ) : canUpload(actor.permissions) ? (
        <ProjectDocumentUploadQueue
          actor={{
            id: actor.userId,
            displayName: actor.displayName,
            organizationId: actor.organization.id,
          }}
          constraints={constraints}
          contextType="STAGE_MATRIX_DOCUMENT"
          definition={{ id: document.id, name: document.documentName }}
          officerOptions={[
            { id: actor.userId, displayName: actor.displayName },
          ]}
          onAbortPendingChange={setAbortPending}
          onClose={onClose}
          onQueueChange={setQueue}
          onUploaded={onComplete}
          projectId={projectId}
          queue={queue}
          stageKey={document.stageKey}
          targetType="REQUIRED_DOCUMENT"
          workstreamKey={document.workstreamKey}
        />
      ) : null}
    </section>
  );
}
