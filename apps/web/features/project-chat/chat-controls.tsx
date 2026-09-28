'use client';
import { useEffect, useRef, useState } from 'react';
import { Actor, api, apiUrl, ApiError } from '../../app/lib/api';

const labels: Record<string, string> = {
  READ: 'Xem',
  SEND: 'Gửi tin',
  UPLOAD: 'Đính kèm',
  DOWNLOAD: 'Tải file',
  LOCK: 'Khóa gửi',
  HISTORY: 'Cấp lịch sử',
};
type Grant = {
  id: string;
  userId: string;
  actions: string[];
  effectiveAt: string;
  expiresAt: string | null;
};
type Management = {
  ceiling: string[];
  expiresAt: string | null;
  candidates: { id: string; name: string; kind: string }[];
  rooms: {
    id: string;
    group: string;
    audience: string;
    locked: boolean;
    grants: Grant[];
  }[];
};

export function ChatManagement({
  projectId,
  actor,
  actions,
  onChanged,
}: {
  projectId: string;
  actor: Actor;
  actions: string[];
  onChanged: () => void;
}) {
  const [data, setData] = useState<Management>();
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [roomId, setRoomId] = useState(''),
    [userId, setUserId] = useState(''),
    [grantActions, setGrantActions] = useState(['READ']);
  const [expiry, setExpiry] = useState(''),
    [title, setTitle] = useState(''),
    [audience, setAudience] = useState('INTERNAL'),
    [group, setGroup] = useState('CONSULTING');
  const [historyFrom, setHistoryFrom] = useState(''),
    [historyTo, setHistoryTo] = useState('');
  const [links, setLinks] = useState<{
    tasks: { id: string; title: string }[];
    products: { id: string; code: string }[];
  }>();
  const [taskId, setTaskId] = useState(''),
    [productLineId, setProductLineId] = useState('');
  const active = useRef(true);
  function clearManagement() {
    setLinks(undefined);
    setTaskId('');
    setProductLineId('');
    setData(undefined);
    setRoomId('');
    setUserId('');
    setMessage('');
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      delay = 2000;
    async function poll() {
      if (
        controller.signal.aborted ||
        !actions.some((a) => ['CREATE', 'ACCESS_ADMIN'].includes(a))
      )
        return;
      if (document.hidden) {
        timer = setTimeout(() => void poll(), 2000);
        return;
      }
      try {
        const value = actions.includes('ACCESS_ADMIN')
          ? await api<Management>(
              `/project-chat/projects/${projectId}/management`,
              {
                signal: controller.signal,
                headers: { 'X-Chat-Actor': actor.userId },
              },
            )
          : undefined;
        const options = actions.includes('CREATE')
          ? await api<NonNullable<typeof links>>(
              `/project-chat/projects/${projectId}/link-options`,
              {
                signal: controller.signal,
                headers: { 'X-Chat-Actor': actor.userId },
              },
            )
          : undefined;
        if (controller.signal.aborted) return;
        setData(value);
        setLinks(options);
        setTaskId((id) => (options?.tasks.some((t) => t.id === id) ? id : ''));
        setProductLineId((id) =>
          options?.products.some((p) => p.id === id) ? id : '',
        );
        delay = 2000;
      } catch (e) {
        if (controller.signal.aborted) return;
        setError((e as Error).message);
        if (e instanceof ApiError && [401, 403, 404, 412].includes(e.status)) {
          clearManagement();
          return;
        }
        delay = Math.min(delay * 2, 30000);
      }
      timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => {
      active.current = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [projectId, actor.userId, actions, revision]);
  async function write(
    path: string,
    body: unknown,
    success = 'Đã lưu theo xác nhận server.',
  ) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(path, {
        method: 'POST',
        headers: { 'X-Chat-Actor': actor.userId },
        body: JSON.stringify(body),
      });
      if (!active.current) return;
      setMessage(success);
      setRevision((v) => v + 1);
      onChanged();
    } catch (e) {
      if (active.current) {
        setError((e as Error).message);
        if (e instanceof ApiError && [401, 403, 404, 412].includes(e.status))
          clearManagement();
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  const room = data?.rooms.find((r) => r.id === roomId),
    target = data?.candidates.find((u) => u.id === userId);
  const expiryValue = expiry ? new Date(expiry).toISOString() : undefined;
  return (
    <details className="panel">
      <summary>Quản trị cuộc trao đổi</summary>
      <p>Quản trị không tự mở nội dung. Mỗi lần cấp lại bắt đầu lịch sử mới.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {actions.includes('CREATE') && (
        <form
          className="grid gap-2 my-3"
          onSubmit={(e) => {
            e.preventDefault();
            void write(
              `/project-chat/projects/${projectId}/rooms`,
              {
                title,
                group,
                audience,
                taskId: taskId || undefined,
                productLineId: productLineId || undefined,
              },
              'Đã tạo phòng; chưa tự cấp quyền đọc.',
            );
          }}
        >
          <label>
            Tên cuộc trao đổi mới
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Nhóm
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="CONSULTING">Tư vấn & báo giá</option>
              <option value="COMMERCIAL">Hợp đồng & tài chính</option>
              <option value="SUPPLY">Cung ứng & giao hàng</option>
              <option value="AFTER_SALES">Thi công & hậu mãi</option>
            </select>
          </label>
          <label>
            Phạm vi
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="INTERNAL">Nội bộ</option>
              <option value="CUSTOMER">Khách/đối tác</option>
            </select>
          </label>
          {links && (
            <>
              <label>
                Công việc hiện có (tùy chọn)
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  <option value="">Không liên kết</option>
                  {links.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hạng mục hiện có (tùy chọn)
                <select
                  value={productLineId}
                  onChange={(e) => setProductLineId(e.target.value)}
                >
                  <option value="">Không liên kết</option>
                  {links.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Tối đa 100 lựa chọn đúng quyền. Liên kết không cấp quyền đọc
                công việc/hạng mục.
              </small>
            </>
          )}
          <button disabled={busy || !title.trim()}>Tạo cuộc trao đổi</button>
        </form>
      )}
      {data && (
        <div className="grid gap-2">
          <label>
            Phòng cần quản lý
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Chọn phòng</option>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.audience === 'CUSTOMER' ? 'Khách' : 'Nội bộ'} · {r.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Người được cấp
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Chọn danh tính hợp lệ</option>
              {data.candidates
                .filter(
                  (u) => room?.audience === 'CUSTOMER' || u.kind === 'INTERNAL',
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ·{' '}
                    {u.kind === 'EXTERNAL' ? 'Khách/đối tác' : 'Nhân viên'}
                  </option>
                ))}
            </select>
          </label>
          <fieldset>
            <legend>Quyền tách riêng</legend>
            {data.ceiling.map((a) => (
              <label className="mr-3 inline-flex gap-1" key={a}>
                <input
                  type="checkbox"
                  checked={grantActions.includes(a)}
                  onChange={(e) =>
                    setGrantActions((old) =>
                      e.target.checked
                        ? [...old, a]
                        : old.filter((v) => v !== a),
                    )
                  }
                />
                {labels[a]}
              </label>
            ))}
          </fieldset>
          <label>
            Hết hạn (khách: bắt buộc, tối đa 30 ngày)
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
          <button
            disabled={
              busy ||
              !room ||
              !target ||
              !grantActions.includes('READ') ||
              (target.kind === 'EXTERNAL' && !expiry)
            }
            onClick={() =>
              void write(`/project-chat/rooms/${roomId}/grants`, {
                userId,
                actions: grantActions,
                expiresAt: expiryValue,
              })
            }
          >
            Cấp lần mới
          </button>
          {room && actions.includes('LOCK') && (
            <button
              disabled={busy}
              onClick={() =>
                void write(`/project-chat/rooms/${roomId}/lock`, {
                  locked: !room.locked,
                })
              }
            >
              {room.locked ? 'Mở gửi' : 'Khóa gửi'}
            </button>
          )}
          {room?.grants.map((g) => (
            <div key={g.id} className="border rounded p-2">
              <p>
                {data.candidates.find((u) => u.id === g.userId)?.name ??
                  g.userId}
                : {g.actions.map((a) => labels[a]).join(', ')}; từ{' '}
                {new Date(g.effectiveAt).toLocaleString('vi-VN')}; hết hạn{' '}
                {g.expiresAt
                  ? new Date(g.expiresAt).toLocaleString('vi-VN')
                  : 'không đặt'}
              </p>
              {g.actions.every((a) => data.ceiling.includes(a)) && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void write(
                        `/project-chat/rooms/${roomId}/grants/${g.id}/revoke`,
                        {},
                      )
                    }
                  >
                    Thu hồi{' '}
                    {data.candidates.find((u) => u.id === g.userId)?.name ??
                      g.userId}
                  </button>
                  {expiry && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void write(
                          `/project-chat/rooms/${roomId}/grants/${g.id}/renew`,
                          { expiresAt: expiryValue },
                        )
                      }
                    >
                      Gia hạn theo mốc đã chọn
                    </button>
                  )}
                </>
              )}
              {actions.includes('HISTORY') && g.userId !== actor.userId && (
                <div>
                  <label>
                    Lịch sử từ
                    <input
                      type="datetime-local"
                      value={historyFrom}
                      onChange={(e) => setHistoryFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    Đến (không gồm mốc này)
                    <input
                      type="datetime-local"
                      value={historyTo}
                      onChange={(e) => setHistoryTo(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !historyFrom || !historyTo}
                    onClick={() =>
                      void write(
                        `/project-chat/rooms/${roomId}/grants/${g.id}/history`,
                        {
                          from: new Date(historyFrom).toISOString(),
                          to: new Date(historyTo).toISOString(),
                          actions: grantActions.filter((a) =>
                            ['READ', 'DOWNLOAD'].includes(a),
                          ),
                        },
                      )
                    }
                  >
                    Mở khoảng lịch sử tường minh
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export type ReleaseList = {
  published: {
    id: string;
    filename: string;
    version: number;
    publishedAt: string;
    preparedBy: string;
    publishedBy: string;
  }[];
  pending: {
    id: string;
    filename: string;
    version: number;
    preparedBy: string;
  }[];
};
type Source = {
  sourceId: string;
  fileId: string;
  version: number;
  name: string;
};
type Review = {
  id: string;
  filename: string;
  version: number;
  roomId: string;
  preparedBy: string;
  recipientHash: string;
  recipients: {
    userId: string;
    name: string;
    kind: string;
    actions: string[];
    expiresAt: string | null;
  }[];
};
export function ReleasePanel({
  roomId,
  actor,
  canPrepare,
  canPublish,
  canDownload,
  locked,
  list,
  onRevoked,
}: {
  roomId: string;
  actor: Actor;
  canPrepare: boolean;
  canPublish: boolean;
  canDownload: boolean;
  locked: boolean;
  list: ReleaseList;
  onRevoked: () => void;
}) {
  const [sources, setSources] = useState<Source[]>([]),
    [sourceId, setSourceId] = useState(''),
    [review, setReview] = useState<Review>();
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<{ url: string; text?: string }>();
  const active = useRef(true),
    blobUrl = useRef<string | undefined>(undefined);
  const currentList = useRef(list);
  if (review && !list.pending.some((r) => r.id === review.id)) {
    setReview(undefined);
    setPreview(undefined);
    setConfirmed(false);
  }
  useEffect(() => {
    currentList.current = list;
    if (!review) {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = undefined;
    }
  }, [list, review]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, [roomId, actor.userId]);
  useEffect(() => {
    const controller = new AbortController();
    if (canPrepare)
      api<Source[]>(`/project-chat/rooms/${roomId}/release-sources`, {
        signal: controller.signal,
        headers: { 'X-Chat-Actor': actor.userId },
      })
        .then((value) => {
          if (!controller.signal.aborted) setSources(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setSources([]);
            setSourceId('');
            setError((e as Error).message);
          }
        });
    return () => {
      controller.abort();
    };
  }, [roomId, actor.userId, canPrepare, list]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        headers: { 'X-Chat-Actor': actor.userId },
        body: JSON.stringify(body),
      });
      if (active.current) {
        setNotice(
          'Server đã xác nhận; danh sách sẽ cập nhật ở lần lấy tiếp theo.',
        );
        setReview(undefined);
        setConfirmed(false);
      }
    } catch (e) {
      if (active.current) {
        if (e instanceof ApiError && [401, 412].includes(e.status)) onRevoked();
        else setError((e as Error).message);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function inspect(id: string) {
    setBusy(true);
    setError('');
    setConfirmed(false);
    setReview(undefined);
    setPreview(undefined);
    try {
      const metadata = await api<Review>(
        `/project-chat/releases/${id}/review`,
        { headers: { 'X-Chat-Actor': actor.userId } },
      );
      const response = await fetch(
        `${apiUrl}/project-chat/releases/${id}/preview`,
        {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'X-Chat-Actor': actor.userId },
        },
      );
      if ([401, 412].includes(response.status)) {
        onRevoked();
        return;
      }
      if (!response.ok)
        throw new Error('Nguồn/quyền đã đổi hoặc chưa đủ điều kiện xem.');
      const blob = await response.blob();
      const text = blob.type.startsWith('text/plain')
        ? await blob.text()
        : undefined;
      if (
        !active.current ||
        !currentList.current.pending.some((r) => r.id === id)
      )
        return;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      const url = URL.createObjectURL(blob);
      blobUrl.current = url;
      setReview(metadata);
      setPreview({ url, text });
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section className="grid gap-2 border rounded p-3">
      <h3>Hồ sơ phát hành cho phòng khách</h3>
      <p>
        Tin nhắn không phải ký kết. Hồ sơ nội bộ cần người phát hành khác người
        chuẩn bị.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {canPrepare && (
        <div>
          <label>
            Nguồn phương án đã duyệt
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Chọn nguồn/phiên bản</option>
              {sources.map((s) => (
                <option value={s.sourceId} key={s.sourceId}>
                  {s.name} · v{s.version}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || locked || !sourceId}
            onClick={() => {
              const source = sources.find((s) => s.sourceId === sourceId);
              if (source)
                void action(`/project-chat/rooms/${roomId}/releases`, {
                  sourceId: source.sourceId,
                  fileId: source.fileId,
                  version: source.version,
                });
            }}
          >
            Chuẩn bị phát hành
          </button>
          <p>
            Hiện chỉ nhận nguồn phương án đủ trạng thái; các loại hồ sơ khác
            chưa hỗ trợ.
          </p>
        </div>
      )}
      {list.pending.map((r) => (
        <div key={r.id}>
          <span>
            Chờ kiểm tra: {r.filename} · v{r.version}
          </span>
          <button disabled={busy} onClick={() => void inspect(r.id)}>
            Kiểm tra nguồn và người nhận
          </button>
        </div>
      ))}
      {review && preview && (
        <div className="grid gap-2">
          <p>
            {review.filename} · phiên bản {review.version} · phòng{' '}
            {review.roomId}
          </p>
          {preview.text !== undefined && (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap">
              {preview.text}
            </pre>
          )}
          <a href={preview.url} download={review.filename}>
            Tải đúng bản nguồn để kiểm tra
          </a>
          <ul>
            {review.recipients.map((r) => (
              <li key={r.userId}>
                {r.name} · {r.kind === 'EXTERNAL' ? 'Khách/đối tác' : 'Nội bộ'}{' '}
                · {r.actions.map((a) => labels[a]).join(', ')} · hết hạn{' '}
                {r.expiresAt
                  ? new Date(r.expiresAt).toLocaleString('vi-VN')
                  : 'không đặt'}
              </li>
            ))}
          </ul>
          {canPublish && review.preparedBy !== actor.userId && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Tôi đã kiểm tra nội dung, phiên bản và đúng người nhận; không có
                thông tin nội bộ bị cấm.
              </label>
              <button
                disabled={busy || locked || !confirmed}
                onClick={() =>
                  void action(`/project-chat/releases/${review.id}/publish`, {
                    confirmed: true,
                    recipientHash: review.recipientHash,
                  })
                }
              >
                Xác nhận phát hành
              </button>
            </>
          )}
        </div>
      )}
      {list.published.map((r) => (
        <div key={r.id}>
          {canDownload ? (
            <a
              className="underline"
              href={`${apiUrl}/project-chat/releases/${r.id}/download`}
            >
              {r.filename} · v{r.version}
            </a>
          ) : (
            <span>
              {r.filename} · v{r.version} — chưa được cấp tải
            </span>
          )}
          {canPublish && (
            <button
              disabled={busy}
              onClick={() =>
                void action(`/project-chat/releases/${r.id}/revoke`, {})
              }
            >
              Thu hồi bản phát hành
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
