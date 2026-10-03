'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { api, Actor } from '../../app/lib/api';
import { ProjectWorkspaceHeader } from '../projects/project-workspace-header';
import { ProjectAi, AiContext } from './project-ai';
import { useSearchParams } from 'next/navigation';

export function ProjectAiWorkspace({ projectId }: { projectId: string }) {
  const query = useSearchParams();
  const initialContext: AiContext | undefined = query.get('productLineId')
    ? { productLineId: query.get('productLineId')! }
    : query.get('fileAssetId')
      ? {
          fileAssetId: query.get('fileAssetId')!,
          fileVersion: Number(query.get('version')),
        }
      : undefined;
  const [data, setData] = useState<{
    actor: Actor;
    project: { name: string };
    actions: string[];
  }>();
  const [error, setError] = useState('');
  const revoked = useCallback(() => {
    setData(undefined);
    setError('Quyền AI đã thay đổi. Tải lại trang để kiểm tra quyền hiện tại.');
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      init = { signal: controller.signal };
    void Promise.all([
      api<Actor>('/me', init),
      api<{
        project: { name: string };
        aiEnabled: boolean;
        authorityActions: string[];
      }>(`/project-chat/projects/${projectId}/rooms`, init),
    ])
      .then(([actor, rooms]) => {
        if (!controller.signal.aborted) {
          if (!rooms.aiEnabled || !rooms.authorityActions.includes('INVOKE'))
            setError('Bạn chưa được cấp quyền AI trong dự án này.');
          else
            setData({
              actor,
              project: rooms.project,
              actions: rooms.authorityActions,
            });
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, [projectId]);
  return (
    <div className="ai-project-workspace grid gap-5">
      <ProjectWorkspaceHeader
        projectId={projectId}
        name={data?.project.name}
        active="ai"
        permissions={data?.actor.permissions ?? []}
      />
      <header>
        <h2 className="text-xl font-semibold">
          {initialContext
            ? 'Galaxy AI — Tra cứu nguồn đã chọn'
            : 'Galaxy AI — Tra cứu toàn dự án'}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Dùng cùng lịch sử riêng tư và nguồn của không gian làm việc. Mỗi câu
          trả lời được kiểm tra lại quyền khi mở.
        </p>
      </header>
      {error && (
        <p className="panel" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Đang kiểm tra quyền AI…</p>}
      {data && (
        <ProjectAi
          key={`${projectId}/${data.actor.userId}`}
          projectId={projectId}
          actorId={data.actor.userId}
          group="ALL"
          initialContext={initialContext}
          canConfigure={data.actions.includes('ACCESS_ADMIN')}
          onRevoked={revoked}
        />
      )}
    </div>
  );
}
