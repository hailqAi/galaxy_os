'use client';
import { createCommandKey } from '../../app/lib/create-command-key';

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Actor, api, ApiError, apiUrl } from '../../app/lib/api';
import { ChatManagement, ReleasePanel, ReleaseList } from './chat-controls';
import { projectDomainLabel } from '../projects/project-domain-labels';
import { AiMount, useAiSurfaces } from './project-ai-surfaces';
import { ChatComposerInput } from './chat-composer-input';
import {
  ProjectWorkspaceHeader,
  projectGroups as groups,
} from '../projects/project-workspace-header';

type Attachment = {
  id: string;
  originalFilename: string;
  origin: string;
  version: number;
};
type Message = {
  id: string;
  sequence: number;
  body: string;
  authorId: string;
  createdAt: string;
  attachments: Attachment[];
};
type Room = {
  id: string;
  title: string;
  group: string;
  audience: string;
  locked: boolean;
  grantId: string;
  actions: string[];
};
type RoomPage = {
  project: { id: string; name: string };
  rooms: Room[];
  authorityActions: string[];
  aiEnabled?: boolean;
};
type History = {
  locked: boolean;
  links: {
    task: {
      id: string;
      title: string;
      status: string;
      dueDate: string | null;
      assignees: { user: { displayName: string } }[];
    } | null;
    productLine: {
      id: string;
      code: string;
      lifecycleStatus: string;
      blocker: string | null;
      nextAction: string | null;
    } | null;
  };
  items: Message[];
  nextBefore: number | null;
  nextAfter: number | null;
  hasMore: boolean;
  viewerId: string;
  grantId: string;
  scopeToken: string;
};
// (History carries a digest of effective intervals; it is not an authorization token.)
const denied = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404, 412].includes(error.status);
export const mergeMessages = (before: Message[], incoming: Message[]) =>
  [...new Map([...before, ...incoming].map((m) => [m.id, m])).values()].sort(
    (a, b) => a.sequence - b.sequence,
  );

export function ChatComposer({
  value,
  disabled,
  reason,
  sending,
  onChange,
  onSubmit,
}: {
  value: string;
  disabled: boolean;
  reason: string;
  sending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="chat-composer grid gap-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Tin nhắn
        <ChatComposerInput
          aria-label="Tin nhắn"
          value={value}
          disabled={disabled || sending}
          onChange={onChange}
        />
      </label>
      {reason && <p role="status">{reason}</p>}
      <button
        className="chat-send"
        type="submit"
        disabled={disabled || sending || !value.trim()}
      >
        {sending ? 'Đang gửi…' : 'Gửi tin'}
      </button>
    </form>
  );
}

export function ProjectChatIndex() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<{ id: string; name: string }[]>('/project-chat/projects', {
      signal: controller.signal,
    })
      .then(setProjects)
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel grid gap-4">
      <h1 className="text-2xl">Làm việc trong dự án</h1>
      {error && <p role="alert">{error}</p>}
      {!projects && !error && <p>Đang kiểm tra quyền…</p>}
      {projects?.length === 0 && <p>Chưa có cuộc trao đổi được cấp quyền.</p>}
      {projects?.map((p) => (
        <Link className="underline" key={p.id} href={`/projects/${p.id}/work`}>
          {p.name}
        </Link>
      ))}
    </section>
  );
}

export function ProjectChat({ projectId }: { projectId: string }) {
  const ai = useAiSurfaces();
  const [snapshot, setData] = useState<RoomPage>();
  const data = snapshot?.project.id === projectId ? snapshot : undefined;
  const [revision, setRevision] = useState(0);
  const [actor, setActor] = useState<Actor>();
  const [selected, setSelected] = useState('');
  const [group, setGroup] = useState('CONSULTING');
  const [roomSearch, setRoomSearch] = useState('');
  const [roomDrawerOpen, setRoomDrawerOpen] = useState(false);
  const draftWriterRef = useRef<((text: string) => void) | undefined>(
    undefined,
  );
  useEffect(() => {
    const restore = () => {
      const q = new URLSearchParams(location.search);
      const value = q.get('group');
      if (groups.some(([id]) => id === value)) setGroup(value!);
      setSelected(q.get('room') ?? '');
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [projectId]);
  const leaveGuardRef = useRef<(leave: () => void) => void>((leave) => leave());
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Actor>('/me', { signal: controller.signal }),
      api<RoomPage>(`/project-chat/projects/${projectId}/rooms`, {
        signal: controller.signal,
      }),
    ])
      .then(([me, rooms]) => {
        if (controller.signal.aborted) return;
        setActor(me);
        setData(rooms);
        setError('');
      })
      .catch((e: Error) => {
        if (controller.signal.aborted) return;
        setData(undefined);
        setActor(undefined);
        setSelected('');
        setError(e.message);
      });
    return () => controller.abort();
  }, [projectId, revision]);
  const revoked = useCallback(() => {
    setSelected('');
    setData(undefined);
    setActor(undefined);
    setRevision((value) => value + 1);
  }, []);
  const room = data?.rooms.find((r) => r.id === selected);
  const hasAi = Boolean(
    data?.aiEnabled && actor && data?.authorityActions.includes('INVOKE'),
  );
  function navigateRoom(nextGroup: string, nextRoom = '') {
    leaveGuardRef.current(() => {
      setGroup(nextGroup);
      setSelected(nextRoom);
      setRoomDrawerOpen(false);
      const url = new URL(location.href);
      url.searchParams.set('group', nextGroup);
      url.searchParams.delete('ai');
      if (nextRoom) url.searchParams.set('room', nextRoom);
      else url.searchParams.delete('room');
      window.history.pushState(window.history.state, '', url);
    });
  }
  return (
    <section className="project-chat-workspace grid gap-4">
      <ProjectWorkspaceHeader
        projectId={projectId}
        name={data?.project.name ?? 'Không gian dự án'}
        active="work"
        permissions={actor?.permissions ?? []}
        aiEnabled={hasAi}
      />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Đang kiểm tra phạm vi…</p>}
      {data && (
        <>
          {actor &&
            data.authorityActions.some((a) =>
              ['CREATE', 'ACCESS_ADMIN'].includes(a),
            ) && (
              <ChatManagement
                key={`${projectId}/${actor.userId}`}
                projectId={projectId}
                actor={actor}
                actions={data.authorityActions}
                onChanged={() => setRevision((v) => v + 1)}
              />
            )}
          <div className={`contextual-workspace ${hasAi ? 'with-ai' : ''}`}>
            <aside
              className={`room-sidebar panel ${room ? 'room-selected' : ''} ${roomDrawerOpen ? 'is-open' : ''}`}
              aria-label="Cuộc trao đổi"
            >
              <button
                className="room-rail-toggle"
                aria-expanded={roomDrawerOpen}
                aria-label={
                  roomDrawerOpen
                    ? 'Đóng danh sách cuộc trao đổi'
                    : 'Mở danh sách cuộc trao đổi'
                }
                onClick={() => setRoomDrawerOpen((value) => !value)}
              >
                ☰
              </button>
              <h2 className="font-semibold">Cuộc trao đổi</h2>
              <input
                aria-label="Tìm cuộc trao đổi"
                placeholder="Tìm chủ đề…"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
              />
              <nav aria-label="Nhóm chuyên môn" className="room-groups">
                {groups.map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={group === id}
                    onClick={() => navigateRoom(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="room-list">
                {data.rooms
                  .filter(
                    (r) =>
                      r.group === group &&
                      r.title
                        .toLocaleLowerCase('vi')
                        .includes(roomSearch.toLocaleLowerCase('vi')),
                  )
                  .map((r) => (
                    <button
                      className="room-choice"
                      aria-pressed={r.id === selected}
                      key={r.id}
                      onClick={() => {
                        if (r.id !== selected) navigateRoom(r.group, r.id);
                      }}
                    >
                      <strong>{r.title}</strong>
                      <small>
                        {r.audience === 'CUSTOMER'
                          ? 'Phòng khách/đối tác'
                          : 'Nội bộ Galaxy'}
                        {r.locked ? ' · Đã khóa' : ''}
                      </small>
                    </button>
                  ))}
              </div>
              {!data.rooms.some((r) => r.group === group) && (
                <p className="text-sm text-slate-500">
                  Chưa có phòng được cấp trong nhóm này.
                  {data.authorityActions.includes('CREATE')
                    ? ' Dùng Quản lý trao đổi để tạo chủ đề.'
                    : ''}
                </p>
              )}
              {roomSearch &&
                !data.rooms.some(
                  (r) =>
                    r.group === group &&
                    r.title
                      .toLocaleLowerCase('vi')
                      .includes(roomSearch.toLocaleLowerCase('vi')),
                ) && <p>Không có chủ đề phù hợp.</p>}
              {hasAi && (
                <button
                  className="ai-launch text-center"
                  onClick={() => ai?.open({ projectId, scope: 'ALL' })}
                >
                  Tra cứu AI toàn dự án →
                </button>
              )}
            </aside>
            {room && actor ? (
              <ChatRoomView
                key={`${actor.userId}/${room.id}/${room.grantId}`}
                room={room}
                projectId={projectId}
                actor={actor}
                authorityActions={data.authorityActions}
                onRevoked={revoked}
                leaveGuardRef={leaveGuardRef}
                draftWriterRef={draftWriterRef}
                onBack={() => navigateRoom(group)}
              />
            ) : (
              <div className="panel empty-state room-empty">
                <span className="text-3xl">▤</span>
                <h2 className="mt-4 font-semibold">
                  Chọn một cuộc trao đổi để làm việc.
                </h2>
                <p className="mt-2 text-sm">
                  Mỗi chủ đề có thành viên, công việc và hồ sơ riêng.
                </p>
              </div>
            )}
            {hasAi && actor && (
              <AiMount
                context={room ? { roomId: room.id } : undefined}
                roomLabels={Object.fromEntries(
                  (data?.rooms ?? []).map((r) => [r.id, r.title]),
                )}
                key={`${projectId}/${actor.userId}`}
                projectId={projectId}
                scope={group}
                conversationId={
                  typeof window === 'undefined'
                    ? undefined
                    : (new URLSearchParams(location.search).get('ai') ??
                      undefined)
                }
                onDraft={
                  room?.actions.includes('SEND') && !room.locked
                    ? (text) => draftWriterRef.current?.(text)
                    : undefined
                }
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ChatRoomView({
  projectId,
  room,
  actor,
  authorityActions,
  onRevoked,
  onBack,
  leaveGuardRef,
  draftWriterRef,
}: {
  projectId: string;
  room: Room;
  actor: Actor;
  authorityActions: string[];
  onRevoked: () => void;
  onBack: () => void;
  leaveGuardRef: React.RefObject<(leave: () => void) => void>;
  draftWriterRef: React.RefObject<((text: string) => void) | undefined>;
}) {
  const router = useRouter();
  const [leaveAction, setLeaveAction] = useState<(() => void) | undefined>();
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  const container = useRef<HTMLElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [releases, setReleases] = useState<ReleaseList>({
    published: [],
    pending: [],
  });
  const [draft, setDraft] = useState('');
  useEffect(() => {
    draftWriterRef.current = (text) =>
      leaveGuardRef.current(() => setDraft(text));
    return () => {
      draftWriterRef.current = undefined;
    };
  }, [draftWriterRef, leaveGuardRef]);
  const [locked, setLocked] = useState(room.locked);
  const [links, setLinks] = useState<History['links']>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<Date>();
  const [more, setMore] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>();
  const [failed, setFailed] = useState(false);
  const [hasUpload, setHasUpload] = useState(false);
  const alive = useRef(true),
    pane = useRef<HTMLDivElement>(null),
    cursor = useRef(0),
    before = useRef<number | null>(null);
  const pending = useRef<
    | {
        clientKey: string;
        body: string;
        attachmentIds: string[];
      }
    | undefined
  >(undefined);
  const upload = useRef<{ file: File; clientKey: string } | undefined>(
    undefined,
  );
  const aborts = useRef(new Set<AbortController>());
  const scopeToken = useRef<string | undefined>(undefined);
  const clear = useCallback(() => {
    alive.current = false;
    for (const a of aborts.current) a.abort();
    setMessages([]);
    setLinks(undefined);
    setReleases({ published: [], pending: [] });
    setDraft('');
    setLeaveAction(undefined);
    setAttachment(undefined);
    pending.current = undefined;
    upload.current = undefined;
    onRevoked();
  }, [onRevoked]);
  const accept = useCallback(
    (result: History) => {
      if (
        result.viewerId !== actor.userId ||
        result.grantId !== room.grantId ||
        (scopeToken.current && scopeToken.current !== result.scopeToken)
      ) {
        clear();
        return false;
      }
      scopeToken.current = result.scopeToken;
      if (alive.current) {
        setLinks(result.links);
        setLocked(result.locked);
      }
      return alive.current;
    },
    [actor.userId, room.grantId, clear],
  );
  useEffect(() => {
    alive.current = true;
    const activeAborts = aborts.current;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 1500;
    const controller = new AbortController();
    aborts.current.add(controller);
    async function poll() {
      if (!alive.current) return;
      try {
        if (!document.hidden && navigator.onLine) {
          let next = true;
          while (next && alive.current && !document.hidden) {
            const first = cursor.current === 0;
            const result = await api<History>(
              `/project-chat/rooms/${room.id}/messages${first ? '' : `?after=${cursor.current}`}`,
              {
                signal: controller.signal,
                headers: { 'X-Chat-Actor': actor.userId },
              },
            );
            if (!accept(result)) return;
            setLastVerifiedAt(new Date());
            setDisconnected(!navigator.onLine);
            const bottom =
              first ||
              Boolean(
                pane.current &&
                  pane.current.scrollHeight -
                    pane.current.scrollTop -
                    pane.current.clientHeight <
                    60,
              );
            setMessages((old) => mergeMessages(old, result.items));
            if (first) {
              before.current = result.nextBefore;
              setMore(result.hasMore);
              cursor.current = Math.max(
                0,
                ...result.items.map((m) => m.sequence),
              );
              next = false;
            } else {
              cursor.current = result.nextAfter ?? cursor.current;
              next = result.hasMore;
            }
            setReady(true);
            if (bottom)
              requestAnimationFrame(() => {
                if (alive.current && pane.current)
                  pane.current.scrollTop = pane.current.scrollHeight;
              });
          }
          delay = 1500;
          if (room.audience === 'CUSTOMER') {
            const value = await api<ReleaseList>(
              `/project-chat/rooms/${room.id}/releases`,
              {
                signal: controller.signal,
                headers: { 'X-Chat-Actor': actor.userId },
              },
            );
            if (alive.current) setReleases(value);
          }
          if (alive.current)
            setError((old) =>
              old === 'Không tải được tin mới. Đang thử lại…' ? '' : old,
            );
        } else if (!navigator.onLine) setDisconnected(true);
      } catch (e) {
        if (controller.signal.aborted) return;
        setDisconnected(true);
        if (denied(e)) {
          clear();
          return;
        }
        setError('Không tải được tin mới. Đang thử lại…');
        delay = Math.min(30000, delay * 2);
      }
      if (alive.current) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    const auth = () => clear();
    const offline = () => setDisconnected(true);
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('galaxy-auth');
    if (channel) channel.onmessage = auth;
    window.addEventListener('galaxy-auth-changed', auth);
    window.addEventListener('offline', offline);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      for (const a of activeAborts) a.abort();
      activeAborts.clear();
      window.removeEventListener('galaxy-auth-changed', auth);
      window.removeEventListener('offline', offline);
      channel?.close();
    };
    // Scope changes remount this component using actor/room/grant identity.
  }, [room.id, room.grantId, room.audience, actor.userId, clear, accept]);
  useEffect(() => {
    if (leaveAction) leaveDialog.current?.showModal();
    else leaveDialog.current?.close();
  }, [leaveAction]);
  useEffect(() => {
    const hide = () => {
      // The cached document must not paint old scoped data before reauthorization.
      if (container.current) container.current.style.visibility = 'hidden';
      clear();
    };
    const restore = (e: PageTransitionEvent) => {
      if (e.persisted) clear();
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', restore);
    };
  }, [clear]);
  useEffect(() => {
    const unsent = () =>
      !leaving.current &&
      Boolean(draft || attachment || upload.current || pending.current);
    const confirm = (leave: () => void) => {
      if (!unsent()) leave();
      else setLeaveAction((current) => current ?? leave);
    };
    leaveGuardRef.current = confirm;
    const warn = (e: BeforeUnloadEvent) => {
      if (unsent()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const navigate = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest('a') : null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const url = new URL(anchor.href, location.href);
      if (
        url.pathname.startsWith('/api/') ||
        (url.origin === location.origin &&
          url.pathname === location.pathname &&
          url.search === location.search)
      )
        return;
      if (unsent()) {
        e.preventDefault();
        e.stopPropagation();
        confirm(() => {
          if (url.origin === location.origin)
            router.push(`${url.pathname}${url.search}${url.hash}`);
          else location.assign(url.href);
        });
      }
    };
    // Next App Router has no beforePopState. Cancel native traversal before
    // popstate; replay the browser's exact entry only after confirmation.
    const navigation = Reflect.get(window, 'navigation') as
      | (EventTarget & {
          traverseTo: (key: string) => { finished: Promise<unknown> };
        })
      | undefined;
    const traverse = (event: Event) => {
      const e = event as Event & {
        navigationType: string;
        destination: { key: string; sameDocument: boolean; url: string };
      };
      if (
        e.navigationType !== 'traverse' ||
        !e.destination.sameDocument ||
        !e.cancelable ||
        !unsent()
      )
        return;
      const destination = new URL(e.destination.url);
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        destination.search === location.search
      )
        return;
      e.preventDefault();
      confirm(() => {
        void navigation!
          .traverseTo(e.destination.key)
          .finished.catch(() => clear());
      });
    };
    if (unsent()) window.addEventListener('beforeunload', warn);
    navigation?.addEventListener('navigate', traverse);
    document.addEventListener('click', navigate, true);
    return () => {
      leaveGuardRef.current = (leave) => leave();
      window.removeEventListener('beforeunload', warn);
      navigation?.removeEventListener('navigate', traverse);
      document.removeEventListener('click', navigate, true);
    };
  }, [draft, attachment, hasUpload, leaveGuardRef, router, clear]);
  async function older() {
    if (busy || !before.current) return;
    setBusy(true);
    const controller = new AbortController();
    aborts.current.add(controller);
    const height = pane.current?.scrollHeight ?? 0,
      top = pane.current?.scrollTop ?? 0;
    try {
      const result = await api<History>(
        `/project-chat/rooms/${room.id}/messages?before=${before.current}`,
        { signal: controller.signal },
      );
      if (!accept(result)) return;
      before.current = result.nextBefore;
      setMore(result.hasMore);
      setMessages((old) => mergeMessages(old, result.items));
      requestAnimationFrame(() => {
        if (alive.current && pane.current)
          pane.current.scrollTop = top + pane.current.scrollHeight - height;
      });
    } catch (e) {
      if (denied(e)) clear();
      else if (alive.current) setError('Không tải được lịch sử.');
    } finally {
      aborts.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }
  async function attach() {
    if (!upload.current || busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    aborts.current.add(controller);
    const form = new FormData();
    form.append('clientKey', upload.current.clientKey);
    form.append('file', upload.current.file);
    try {
      const saved = await api<Attachment>(
        `/project-chat/rooms/${room.id}/files`,
        {
          method: 'POST',
          body: form,
          signal: controller.signal,
          headers: { 'X-Chat-Actor': actor.userId },
        },
      );
      if (alive.current) {
        setAttachment(saved);
        upload.current = undefined;
        setHasUpload(false);
      }
    } catch (e) {
      if (denied(e)) clear();
      else if (alive.current)
        setError('Upload chưa được xác nhận. Chọn Gửi file để thử lại.');
    } finally {
      aborts.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }
  async function send() {
    if (busy || !ready || locked || !room.actions.includes('SEND')) return;
    pending.current ??= {
      clientKey: createCommandKey(),
      body: draft,
      attachmentIds: attachment ? [attachment.id] : [],
    };
    setBusy(true);
    setError('');
    const controller = new AbortController();
    aborts.current.add(controller);
    try {
      const sent = await api<Message>(
        `/project-chat/rooms/${room.id}/messages`,
        {
          method: 'POST',
          headers: { 'X-Chat-Actor': actor.userId },
          body: JSON.stringify(pending.current),
          signal: controller.signal,
        },
      );
      if (!alive.current) return;
      if (sent.authorId !== actor.userId) {
        clear();
        return;
      }
      setMessages((old) =>
        mergeMessages(old, [
          { ...sent, attachments: attachment ? [attachment] : [] },
        ]),
      );
      setDraft('');
      setAttachment(undefined);
      pending.current = undefined;
      setFailed(false);
    } catch (e) {
      if (denied(e)) clear();
      else if (alive.current) {
        setFailed(true);
        setError(
          'Chưa xác nhận gửi. Gửi lại giữ nguyên mã yêu cầu và nội dung.',
        );
      }
    } finally {
      aborts.current.delete(controller);
      if (alive.current) setBusy(false);
    }
  }
  const reason = locked
    ? 'Cuộc trao đổi đã khóa gửi'
    : !room.actions.includes('SEND')
      ? 'Bạn chỉ có quyền xem'
      : !ready
        ? 'Đang xác minh quyền và lịch sử'
        : '';
  return (
    <article ref={container} className="panel chat-room min-w-0 grid gap-3">
      <dialog
        ref={leaveDialog}
        aria-labelledby="discard-draft-title"
        onCancel={(e) => {
          e.preventDefault();
          setLeaveAction(undefined);
        }}
        className="rounded p-6 backdrop:bg-black/40"
      >
        <h3 id="discard-draft-title">Bỏ nháp chưa gửi?</h3>
        <p>Nội dung và file chưa gửi chỉ được giữ trong tab này.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button autoFocus onClick={() => setLeaveAction(undefined)}>
            Ở lại
          </button>
          <button
            onClick={() => {
              leaving.current = true;
              setDraft('');
              setAttachment(undefined);
              upload.current = undefined;
              pending.current = undefined;
              for (const a of aborts.current) a.abort();
              setLeaveAction(undefined);
              leaveAction?.();
            }}
          >
            Rời và bỏ nháp
          </button>
        </div>
      </dialog>
      <button className="md:hidden" onClick={onBack}>
        ← Danh sách phòng
      </button>
      <h2 className="text-xl">{room.title}</h2>
      {actor.membershipKind !== 'EXTERNAL' && room.actions.includes('LOCK') && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const saved = await api<{ locked: boolean }>(
                `/project-chat/rooms/${room.id}/lock`,
                {
                  method: 'POST',
                  headers: { 'X-Chat-Actor': actor.userId },
                  body: JSON.stringify({ locked: !locked }),
                },
              );
              if (alive.current) setLocked(saved.locked);
            } catch (e) {
              if (denied(e)) clear();
              else if (alive.current) setError((e as Error).message);
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        >
          {locked ? 'Mở lại gửi tin' : 'Khóa gửi tin'}
        </button>
      )}
      {(links?.task || links?.productLine) && (
        <details open className="pinned-task">
          <summary>Công việc & hạng mục liên quan</summary>
          {links.task && (
            <div>
              <Link href={`/tasks/${links.task.id}`}>{links.task.title}</Link>
              <p>
                {projectDomainLabel('status', links.task.status)} ·{' '}
                {links.task.assignees
                  .map((a) => a.user.displayName)
                  .join(', ') || 'Chưa phân công'}{' '}
                ·{' '}
                {links.task.dueDate
                  ? new Date(links.task.dueDate).toLocaleDateString('vi-VN')
                  : 'Chưa có hạn'}
              </p>
            </div>
          )}
          {links.productLine && (
            <div>
              <Link
                href={`/projects/${projectId}/products/${links.productLine.id}`}
              >
                {links.productLine.code}
              </Link>
              <p>
                {links.productLine.lifecycleStatus} ·{' '}
                {links.productLine.blocker} · {links.productLine.nextAction}
              </p>
            </div>
          )}
        </details>
      )}
      <p>
        {room.audience === 'CUSTOMER'
          ? 'Phòng khách/đối tác — tin nhắn không thay phê duyệt nghiệp vụ'
          : 'Nội bộ Galaxy'}
      </p>
      {error && <p role="alert">{error}</p>}
      {disconnected && (
        <p role="status">Mất kết nối. Đang chờ xác minh lại tin nhắn.</p>
      )}
      <p>
        Xác minh lần cuối:{' '}
        {lastVerifiedAt ? (
          <time dateTime={lastVerifiedAt.toISOString()}>
            {lastVerifiedAt.toLocaleString('vi-VN')}
          </time>
        ) : (
          'Chưa xác minh'
        )}
      </p>
      {room.audience === 'CUSTOMER' && (
        <ReleasePanel
          roomId={room.id}
          actor={actor}
          canPrepare={
            actor.membershipKind !== 'EXTERNAL' &&
            room.actions.includes('UPLOAD')
          }
          canPublish={authorityActions.includes('PUBLISH')}
          canDownload={room.actions.includes('DOWNLOAD')}
          locked={locked}
          list={releases}
          onRevoked={clear}
        />
      )}
      <div
        ref={pane}
        className="max-h-[55vh] min-h-40 overflow-y-auto"
        aria-label="Lịch sử tin nhắn"
      >
        {more && (
          <button disabled={busy} onClick={() => void older()}>
            Tải tin cũ hơn
          </button>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-message ${m.authorId === actor.userId ? 'own' : ''}`}
          >
            <small>
              {m.authorId === actor.userId
                ? 'Bạn'
                : `Thành viên ${m.authorId.slice(0, 8)}`}{' '}
              · {new Date(m.createdAt).toLocaleString('vi-VN')}
            </small>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            {m.attachments.map((f) => (
              <p key={f.id}>
                {room.actions.includes('DOWNLOAD') ? (
                  <a
                    className="underline"
                    href={`${apiUrl}/project-chat/rooms/${room.id}/files/${f.id}/download`}
                  >
                    {f.originalFilename}
                  </a>
                ) : (
                  <span>{f.originalFilename} — chưa được cấp tải</span>
                )}
                {f.origin === 'EXTERNAL_UNCONFIRMED' && (
                  <small> · Nguồn khách, chưa được Galaxy xác nhận</small>
                )}
              </p>
            ))}
          </div>
        ))}
      </div>
      {room.actions.includes('UPLOAD') && !locked && (
        <div className="grid gap-2">
          <label>
            File đính kèm
            <input
              type="file"
              accept=".png,.jpg,.pdf,.txt"
              disabled={
                busy ||
                failed ||
                (room.audience === 'CUSTOMER' &&
                  actor.membershipKind !== 'EXTERNAL')
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                upload.current = file
                  ? { file, clientKey: createCommandKey() }
                  : undefined;
                setHasUpload(Boolean(file));
                setAttachment(undefined);
              }}
            />
          </label>
          <button
            disabled={busy || failed || !hasUpload}
            onClick={() => void attach()}
          >
            Gửi file
          </button>
          {room.audience === 'CUSTOMER' &&
            actor.membershipKind !== 'EXTERNAL' && (
              <p>Hồ sơ nội bộ đi qua phần phát hành hai người ở trên.</p>
            )}
          {attachment && (
            <p>
              Đã lưu file: {attachment.originalFilename}; chưa gửi vào tin nhắn.
            </p>
          )}
        </div>
      )}
      <ChatComposer
        value={draft}
        disabled={Boolean(reason) || failed}
        reason={reason}
        sending={busy}
        onChange={setDraft}
        onSubmit={() => void send()}
      />
      {failed && (
        <button disabled={busy} onClick={() => void send()}>
          Gửi lại tin chưa xác nhận
        </button>
      )}
      {(draft || attachment) && (
        <small>Nháp chỉ giữ trong tab này, không còn sau tải lại trang.</small>
      )}
    </article>
  );
}
