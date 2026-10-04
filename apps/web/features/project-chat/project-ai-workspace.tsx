'use client';
import React, { useEffect, useState } from 'react';
import { api } from '../../app/lib/api';
import { ProjectWorkspaceHeader } from '../projects/project-workspace-header';
import { AiContext } from './project-ai';
import { AiMount, useAiSurfaces } from './project-ai-surfaces';
import { useSearchParams } from 'next/navigation';

export function ProjectAiWorkspace({ projectId }: { projectId: string }) {
  const query = useSearchParams(),
    ai = useAiSurfaces();
  const conversationId = query.get('ai') ?? undefined;
  const [resolved, setResolved] = useState<{
    id: string;
    scope: string;
    context?: AiContext;
  }>();
  const [error, setError] = useState('');
  const initialContext: AiContext | undefined = query.get('roomId')
    ? { roomId: query.get('roomId')! }
    : query.get('productLineId')
      ? { productLineId: query.get('productLineId')! }
      : query.get('fileAssetId')
        ? {
            fileAssetId: query.get('fileAssetId')!,
            fileVersion: Number(query.get('version')),
          }
        : undefined;
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    void api<{ id: string; scope: string; context?: AiContext }>(
      `/project-chat/projects/${projectId}/ai/conversations/${conversationId}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setResolved(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Không mở được hội thoại hoặc quyền đã thay đổi.');
      });
    return () => controller.abort();
  }, [projectId, conversationId]);
  const history = resolved?.id === conversationId ? resolved : undefined;
  const scope = history?.scope ?? query.get('scope') ?? 'ALL';
  const context = history?.context ?? initialContext;
  return (
    <div className="ai-project-workspace grid gap-5">
      <ProjectWorkspaceHeader
        projectId={projectId}
        name={ai?.access?.name}
        active="ai"
        permissions={ai?.access?.permissions ?? []}
      />
      <header>
        <h2 className="text-xl font-semibold">
          {context
            ? 'Galaxy AI — Tra cứu nguồn đã chọn'
            : 'Galaxy AI — Tra cứu toàn dự án'}
        </h2>
        <p>Lịch sử riêng tư; nguồn được kiểm tra lại theo quyền của bạn.</p>
      </header>
      {(error || ai?.access?.error) && (
        <p role="alert">{error || ai?.access?.error}</p>
      )}
      {(!conversationId || history) && (
        <AiMount
          projectId={projectId}
          scope={scope}
          context={context}
          conversationId={conversationId}
          kind="page"
        />
      )}
    </div>
  );
}
