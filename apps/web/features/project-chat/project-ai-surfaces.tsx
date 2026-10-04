'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Actor, api } from '../../app/lib/api';
import { AiContext, ProjectAi, aiSessionKey } from './project-ai';

type Spec = {
  projectId: string;
  scope: string;
  context?: AiContext;
  conversationId?: string;
};
type Mount = Spec & {
  target: HTMLElement;
  kind: 'docked' | 'page';
  onDraft?: (text: string) => void;
  roomLabels?: Record<string, string>;
};
type Session = Spec & {
  key: string;
  name: string;
  canConfigure: boolean;
  mount?: Mount;
};
type Access = {
  projectId: string;
  name: string;
  allowed: boolean;
  canConfigure: boolean;
  permissions: string[];
  error?: string;
};
const AiSurfaces = createContext<{
  access?: Access;
  open: (spec: Spec) => void;
  mount: (value: Mount) => () => void;
} | null>(null);
export const useAiSurfaces = () => useContext(AiSurfaces);

export function AiSurfaceProvider({
  actor,
  enabled,
  children,
}: {
  actor: Actor;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const projectId = /^\/projects\/([\da-f-]{36})(?:\/|$)/i.exec(pathname)?.[1];
  const [access, setAccess] = useState<Access>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [floating, setFloating] = useState<{
    key: string;
    expanded: boolean;
  }>();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const currentAccess = access?.projectId === projectId ? access : undefined;
  const accessRef = useRef(currentAccess);
  useLayoutEffect(() => {
    accessRef.current = currentAccess;
  }, [currentAccess]);
  const [visibleProject, setVisibleProject] = useState(projectId);
  if (visibleProject !== projectId) {
    setVisibleProject(projectId);
    setFloating(undefined);
  }
  useEffect(() => {
    if (!enabled || !projectId) return;
    const controller = new AbortController();
    void api<{
      project: { name: string };
      aiEnabled: boolean;
      authorityActions: string[];
    }>(`/project-chat/projects/${projectId}/rooms`, {
      signal: controller.signal,
      headers: { 'X-Chat-Actor': actor.userId },
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setAccess({
            projectId,
            name: data.project.name,
            allowed: data.aiEnabled && data.authorityActions.includes('INVOKE'),
            canConfigure: data.authorityActions.includes('ACCESS_ADMIN'),
            permissions: actor.permissions,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setAccess({
            projectId,
            name: 'Dự án',
            allowed: false,
            canConfigure: false,
            permissions: actor.permissions,
            error: 'Chưa được cấp quyền AI trong dự án này.',
          });
      });
    return () => controller.abort();
  }, [projectId, actor.userId, actor.permissions, enabled]);
  useEffect(() => {
    const query = matchMedia('(max-width: 639px)'),
      update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    const viewport = window.visualViewport;
    const resize = () => {
      dialog?.style.setProperty(
        '--ai-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      dialog?.style.setProperty(
        '--ai-viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      query.removeEventListener('change', update);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, [dialog]);
  const open = useCallback((spec: Spec) => {
    const grant = accessRef.current;
    if (!grant?.allowed || grant.projectId !== spec.projectId) return;
    const key = aiSessionKey(spec.projectId, spec.scope, spec.context);
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSessions((items) =>
      items.some((s) => s.key === key)
        ? items
        : [
            ...items,
            {
              ...spec,
              key,
              name: grant.name,
              canConfigure: grant.canConfigure,
            },
          ],
    );
    setFloating({ key, expanded: false });
  }, []);
  const mount = useCallback((value: Mount) => {
    const grant = accessRef.current;
    if (!grant?.allowed || grant.projectId !== value.projectId) return () => {};
    const key = aiSessionKey(value.projectId, value.scope, value.context);
    setSessions((items) => {
      const found = items.find((s) => s.key === key);
      const updated = {
        ...(found ?? { ...value, key }),
        name: grant.name,
        canConfigure: grant.canConfigure,
        mount: value,
        conversationId: value.conversationId ?? found?.conversationId,
      };
      return found
        ? items.map((s) => (s.key === key ? updated : s))
        : [...items, updated];
    });
    if (value.kind === 'page') setFloating(undefined);
    return () =>
      setSessions((items) =>
        items.map((s) =>
          s.key === key && s.mount?.target === value.target
            ? { ...s, mount: undefined }
            : s,
        ),
      );
  }, []);
  const close = useCallback(() => {
    setFloating(undefined);
    if (opener.current?.isConnected) opener.current.focus();
  }, []);
  const selectedSession = sessions.find(
    (s) =>
      s.key === floating?.key &&
      s.projectId === projectId &&
      currentAccess?.allowed,
  );
  const dialogVisible = Boolean(selectedSession);
  useEffect(() => {
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (!dialogVisible) return;
    if (mobile) dialog.showModal();
    else dialog.show();
    const frame = requestAnimationFrame(() =>
      dialog.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [dialog, dialogVisible, mobile]);
  const revoked = useCallback((id: string) => {
    setSessions((items) => items.filter((s) => s.projectId !== id));
    setAccess((current) =>
      current?.projectId === id
        ? {
            ...current,
            allowed: false,
            error: 'Quyền AI đã thay đổi. Tải lại để kiểm tra quyền hiện tại.',
          }
        : current,
    );
    setFloating(undefined);
  }, []);
  const selectConversation = useCallback(
    (key: string, id: string) =>
      setSessions((items) =>
        items.map((s) =>
          s.key === key && s.conversationId !== id
            ? { ...s, conversationId: id }
            : s,
        ),
      ),
    [],
  );
  const page = useCallback(
    (session: Session) => {
      const query = new URLSearchParams({ scope: session.scope });
      for (const [key, value] of Object.entries(session.context ?? {}))
        query.set(key === 'fileVersion' ? 'version' : key, String(value));
      if (session.conversationId) query.set('ai', session.conversationId);
      router.push(`/projects/${session.projectId}/ai?${query}`);
    },
    [router],
  );
  return (
    <AiSurfaces.Provider
      value={useMemo(
        () => ({ access: currentAccess, open, mount }),
        [currentAccess, open, mount],
      )}
    >
      {children}
      {enabled && (
        <div className="ai-launcher-wrap">
          {currentAccess?.allowed ? (
            <button
              className="ai-launcher"
              aria-label="Mở Hỏi AI dự án"
              onClick={() =>
                open({ projectId: currentAccess.projectId, scope: 'ALL' })
              }
            >
              ✦ Hỏi AI
            </button>
          ) : !projectId ? (
            <button
              className="ai-launcher"
              onClick={() => router.push('/work')}
            >
              Chọn dự án để hỏi AI
            </button>
          ) : null}
        </div>
      )}
      <dialog
        ref={setDialog}
        className={`ai-floating ${floating?.expanded ? 'is-expanded' : ''}`}
        aria-label={`Galaxy AI — ${selectedSession?.name ?? 'Dự án'}`}
        aria-modal={mobile ? true : undefined}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      />
      {sessions.map((session) => (
        <PersistentSession
          key={session.key}
          session={session}
          actorId={actor.userId}
          active={
            session.projectId === projectId && Boolean(currentAccess?.allowed)
          }
          target={
            floating?.key === session.key
              ? dialog
              : (session.mount?.target ?? null)
          }
          presentation={
            floating?.key === session.key
              ? floating.expanded
                ? 'expanded'
                : 'floating'
              : (session.mount?.kind ?? 'docked')
          }
          open={open}
          close={close}
          expand={() =>
            setFloating((current) =>
              current
                ? { ...current, expanded: !current.expanded }
                : { key: session.key, expanded: true },
            )
          }
          revoked={revoked}
          onPage={page}
          onSelected={selectConversation}
        />
      ))}
    </AiSurfaces.Provider>
  );
}

function PersistentSession({
  session,
  actorId,
  active,
  target,
  presentation,
  open,
  close,
  expand,
  revoked,
  onPage,
  onSelected,
}: {
  session: Session;
  actorId: string;
  active: boolean;
  target: HTMLElement | null;
  presentation: 'docked' | 'page' | 'floating' | 'expanded';
  open: (spec: Spec) => void;
  close: () => void;
  expand: () => void;
  revoked: (id: string) => void;
  onPage: (session: Session) => void;
  onSelected: (key: string, id: string) => void;
}) {
  const revoke = useCallback(
    (status?: number) => {
      revoked(session.projectId);
      if (status === 401 || status === 412)
        window.dispatchEvent(new Event('galaxy-ai-actor-changed'));
    },
    [revoked, session.projectId],
  );
  const selected = useCallback(
    (id: string) => onSelected(session.key, id),
    [onSelected, session.key],
  );
  const floating = presentation === 'floating' || presentation === 'expanded';
  return (
    <ProjectAi
      projectId={session.projectId}
      projectName={session.name}
      actorId={actorId}
      group={session.scope}
      initialContext={session.context}
      initialConversationId={session.conversationId}
      onSelected={selected}
      active={active && Boolean(target)}
      portalTarget={target}
      presentation={presentation}
      canConfigure={session.canConfigure}
      onRevoked={revoke}
      onDraft={session.mount?.onDraft}
      roomLabels={session.mount?.roomLabels}
      onFloat={() => open(session)}
      onExpand={expand}
      onMinimize={floating ? close : undefined}
      onClose={floating ? close : undefined}
      onPage={() => onPage(session)}
      onScopeChange={
        session.context?.roomId
          ? undefined
          : (scope) => open({ ...session, scope, conversationId: undefined })
      }
    />
  );
}

export function AiMount({
  projectId,
  scope,
  context,
  conversationId,
  kind = 'docked',
  roomLabels,
  onDraft,
}: Spec & {
  kind?: 'docked' | 'page';
  roomLabels?: Record<string, string>;
  onDraft?: (text: string) => void;
}) {
  const surfaces = useAiSurfaces();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const contextJson = JSON.stringify(context ?? null);
  const stableContext = useMemo(
    () => JSON.parse(contextJson) ?? undefined,
    [contextJson],
  ) as AiContext | undefined;
  const latestDraft = useRef(onDraft);
  useLayoutEffect(() => {
    latestDraft.current = onDraft;
  }, [onDraft]);
  const draft = useCallback((text: string) => latestDraft.current?.(text), []);
  const mountSurface = surfaces?.mount,
    allowed = surfaces?.access?.allowed,
    canDraft = Boolean(onDraft);
  const labelsJson = JSON.stringify(roomLabels ?? null);
  const stableLabels = useMemo(
    () => JSON.parse(labelsJson) ?? undefined,
    [labelsJson],
  ) as Record<string, string> | undefined;
  useEffect(() => {
    if (target && allowed)
      return mountSurface?.({
        projectId,
        scope,
        context: stableContext,
        conversationId,
        target,
        kind,
        roomLabels: stableLabels,
        onDraft: canDraft ? draft : undefined,
      });
  }, [
    target,
    mountSurface,
    allowed,
    projectId,
    scope,
    stableContext,
    conversationId,
    kind,
    draft,
    canDraft,
    stableLabels,
  ]);
  return (
    <div className={`ai-mount ai-mount-${kind}`}>
      {kind === 'docked' && (
        <button
          className="ai-context-launch"
          onClick={() => surfaces?.open({ projectId, scope, context })}
        >
          Mở AI theo ngữ cảnh
        </button>
      )}
      {surfaces?.access?.error && <p role="alert">{surfaces.access.error}</p>}
      <div ref={setTarget} className="ai-mount-target" />
    </div>
  );
}
