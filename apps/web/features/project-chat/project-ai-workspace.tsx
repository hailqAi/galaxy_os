'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../app/lib/api';
import Link from 'next/link';
import { AiContext } from './project-ai';
import { AiMount, useAiSurfaces } from './project-ai-surfaces';
import { useSearchParams } from 'next/navigation';

export function ProjectAiWorkspace({ projectId }: { projectId: string }) {
  const query = useSearchParams(),
    ai = useAiSurfaces();
  const conversationId = query.get('ai') ?? undefined;
  const [metadata, setMetadata] = useState<{
    projectId: string;
    conversationId: string;
    attempt: number;
    result?: { id: string; scope: string; context?: AiContext };
    error?: string;
  }>();
  const [error, setError] = useState('');
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [browse, setBrowse] = useState(false);
  const browseProjects = useCallback(() => setBrowse((value) => !value), []);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ id: string; name: string }[]>('/project-chat/projects', {
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) setProjects(items);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Chưa tải được danh sách dự án.');
      });
    return () => controller.abort();
  }, []);
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
      `/project-chat/projects/${projectId}/ai/conversations/${conversationId}/metadata`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setMetadata({
            projectId,
            conversationId,
            attempt: metadataAttempt,
            result,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMetadata({
            projectId,
            conversationId,
            attempt: metadataAttempt,
            error: 'Không mở được hội thoại hoặc quyền đã thay đổi.',
          });
      });
    return () => controller.abort();
  }, [projectId, conversationId, metadataAttempt]);
  const currentMetadata =
    metadata?.projectId === projectId &&
    metadata?.conversationId === conversationId &&
    metadata?.attempt === metadataAttempt
      ? metadata
      : undefined;
  const history =
    currentMetadata?.result?.id === conversationId
      ? currentMetadata?.result
      : undefined;
  const historyError = currentMetadata?.error;
  const scope = history?.scope ?? query.get('scope') ?? 'ALL';
  const context = history?.context ?? initialContext;
  return (
    <div className="ai-project-workspace p04-direct-workspace">
      <aside
        className={`ai-project-list ${browse ? 'is-open' : ''}`}
        aria-label="Chọn dự án cho AI"
      >
        <h1>Galaxy AI</h1>
        <h2>Dự án</h2>
        <input
          aria-label="Tìm dự án"
          placeholder="Tìm nhanh dự án…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <nav>
          {projects
            .filter((item) =>
              item.name
                .toLocaleLowerCase('vi')
                .includes(search.toLocaleLowerCase('vi')),
            )
            .map((item) => (
              <Link
                key={item.id}
                href={`/projects/${item.id}/ai`}
                aria-current={item.id === projectId ? 'page' : undefined}
              >
                {item.name}
              </Link>
            ))}
        </nav>
        <p>Ngữ cảnh: {ai?.access?.name ?? 'Dự án'} · Chỉ dự án này</p>
      </aside>
      {(error || ai?.access?.error) && (
        <p role="alert">{error || ai?.access?.error}</p>
      )}
      {historyError && (
        <div role="alert">
          <p>{historyError}</p>
          <button
            type="button"
            onClick={() => setMetadataAttempt((value) => value + 1)}
          >
            Thử tải lại hội thoại
          </button>
        </div>
      )}
      {(!conversationId || history) && (
        <AiMount
          projectId={projectId}
          scope={scope}
          context={context}
          conversationId={conversationId}
          kind="page"
          onBrowse={browseProjects}
        />
      )}
    </div>
  );
}
