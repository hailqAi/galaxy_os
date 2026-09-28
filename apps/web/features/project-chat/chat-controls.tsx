'use client';
import React, { useEffect, useRef, useState } from 'react';
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
  appendixId?: string;
  purpose?: 'CUSTOMER_REVIEW_FILE' | 'RECORDED_SIGNED_COPY';
  sourceFingerprint?: string;
  sourceType?:
    | 'PROPOSAL'
    | 'QUOTATION'
    | 'TECHNICAL'
    | 'SAMPLE'
    | 'HANDOVER'
    | 'CONTRACT'
    | 'CONTRACT_FILE'
    | 'PAYMENT'
    | 'CUSTOMER_PAYMENT_RECORD'
    | 'CUSTOMER_PAYMENT_FILE'
    | 'SITE_DELIVERY'
    | 'DELIVERY_INSTALL';
  sourceId: string;
  fileId?: string;
  version: number;
  name: string;
};
type EligibleFile = {
  id: string;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: string;
};
export function releaseSourceKey(source: Source) {
  return [
    'CONTRACT',
    'CONTRACT_FILE',
    'CUSTOMER_PAYMENT_RECORD',
    'CUSTOMER_PAYMENT_FILE',
    'SITE_DELIVERY',
  ].includes(source.sourceType ?? '')
    ? JSON.stringify([
        source.sourceType,
        source.sourceId,
        source.appendixId,
        source.sourceFingerprint,
        source.purpose,
        source.sourceType === 'SITE_DELIVERY' ? source.fileId : undefined,
        source.sourceType === 'SITE_DELIVERY' ? source.version : undefined,
      ])
    : source.appendixId
      ? `${source.sourceId}:${source.appendixId}`
      : source.sourceId;
}
export function releasePrepareBody(
  source: Source,
  file: EligibleFile | undefined,
  clientKey: string,
) {
  return {
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    fileId: file?.id ?? source.fileId,
    version: ['CONTRACT_FILE', 'CUSTOMER_PAYMENT_FILE'].includes(
      source.sourceType ?? '',
    )
      ? file?.version
      : source.sourceType === 'SITE_DELIVERY'
        ? source.version
        : source.sourceFingerprint
          ? undefined
          : source.version,
    appendixId: source.appendixId,
    purpose: source.sourceType === 'CONTRACT_FILE' ? source.purpose : undefined,
    sourceFingerprint: source.sourceFingerprint,
    clientKey: source.sourceFingerprint ? clientKey : undefined,
  };
}
export function releasePrepareIdentity(
  roomId: string,
  actorId: string,
  source: Source,
  file: EligibleFile | undefined,
) {
  return JSON.stringify([
    roomId,
    actorId,
    source.sourceType,
    source.sourceId,
    source.appendixId,
    source.sourceFingerprint,
    source.purpose,
    file?.id ?? source.fileId,
    file?.version ??
      (source.sourceType === 'SITE_DELIVERY' ? source.version : undefined),
  ]);
}
type Review = {
  id: string;
  filename: string;
  version: number;
  roomId: string;
  preparedBy: string;
  recipientHash: string;
  sourceSnapshot?: {
    type?: string;
    title?: string;
    signedStatus?: string;
    sourceType?: string;
    purpose?: string;
    handoverStatus?: string;
    file?: { id: string; version: number; filename: string };
  } | null;
  recipients: {
    userId: string;
    name: string;
    kind: string;
    actions: string[];
    expiresAt: string | null;
  }[];
};
export function SourceReviewLabel({
  source,
}: {
  source: NonNullable<Review['sourceSnapshot']>;
}) {
  if (source.sourceType === 'HANDOVER') {
    const purpose =
      source.type === 'HANDOVER_MINUTES'
        ? 'Biên bản bàn giao'
        : source.type === 'AS_BUILT_DRAWING'
          ? 'Bản vẽ hoàn công'
          : source.type === 'WARRANTY_DOCUMENT'
            ? 'Hồ sơ bảo hành'
            : 'Danh mục sản phẩm bàn giao';
    const signing =
      source.signedStatus === 'NOT_REQUIRED'
        ? 'tài liệu không yêu cầu ký'
        : source.signedStatus === 'SIGNED_MANUALLY'
          ? 'hồ sơ ghi nhận ký thủ công, chưa xác minh chữ ký'
          : source.signedStatus === 'SIGNED_EXTERNALLY'
            ? 'hồ sơ ghi nhận ký bên ngoài, chưa xác minh chữ ký'
            : 'chưa có xác nhận ký';
    return (
      <p>
        Loại nguồn: {purpose} ·{' '}
        {source.handoverStatus === 'COMPLETED'
          ? 'Bàn giao hoàn tất theo hồ sơ'
          : 'Bàn giao chưa hoàn tất theo hồ sơ'}
        ; {signing}
      </p>
    );
  }
  if (source.sourceType === 'SITE_DELIVERY')
    return (
      <p>
        Loại nguồn: Nhân viên ghi nhận giao tại công trường · phiên bản file{' '}
        {source.file?.version ?? 'không rõ'}; không chứng minh khách đã ký hoặc
        nghiệm thu
      </p>
    );
  return (
    <p>
      Loại nguồn: {source.title ?? source.type ?? source.sourceType} ·{' '}
      {source.sourceType === 'CUSTOMER_PAYMENT_RECORD'
        ? 'Khoản thu ghi nhận trong Galaxy; không phải biên lai ngân hàng hoặc xác nhận đối soát'
        : source.sourceType === 'CUSTOMER_PAYMENT_FILE'
          ? `Chứng từ khoản thu do nhân viên cung cấp · phiên bản file ${source.file?.version ?? 'không rõ'}; chưa xác nhận đối soát hoặc xác minh biên lai ngân hàng`
          : source.sourceType === 'CONTRACT_FILE'
            ? source.purpose === 'RECORDED_SIGNED_COPY'
              ? `Bản lưu theo hồ sơ đã ký (trạng thái do người có quyền ghi nhận) · phiên bản file ${source.file?.version ?? 'không rõ'}; chưa xác minh chữ ký của file`
              : `Bản file gửi khách xem xét · phiên bản file ${source.file?.version ?? 'không rõ'}; không xác nhận phê duyệt hoặc chữ ký`
            : ['CONTRACT', 'PAYMENT', 'DELIVERY_INSTALL'].includes(
                  source.sourceType ?? '',
                )
              ? 'Bản thông tin từ hồ sơ; trạng thái trong nội dung, không xác nhận phê duyệt, ký, thanh toán hoặc nghiệm thu'
              : source.sourceType === 'SAMPLE'
                ? 'Phiên bản file của mẫu đã duyệt'
                : source.signedStatus === 'NOT_REQUIRED'
                  ? 'Nguồn không yêu cầu ký'
                  : source.signedStatus === 'SIGNED_MANUALLY'
                    ? 'Nguồn ghi nhận ký thủ công'
                    : source.signedStatus === 'SIGNED_EXTERNALLY'
                      ? 'Nguồn ghi nhận ký bên ngoài'
                      : 'Nguồn đã duyệt'}
    </p>
  );
}
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
    [availableFiles, setEligibleFiles] = useState<{
      sourceKey: string;
      files: EligibleFile[];
    }>(),
    [fileKey, setFileKey] = useState(''),
    [review, setReview] = useState<Review>();
  const [error, setError] = useState(''),
    [sourceError, setSourceError] = useState(''),
    [fileError, setFileError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<{ url: string; text?: string }>();
  const active = useRef(true),
    blobUrl = useRef<string | undefined>(undefined);
  const currentList = useRef(list);
  const prepareRequest = useRef<
    { identity: string; clientKey: string } | undefined
  >(undefined);
  const source = sources.find((s) => releaseSourceKey(s) === sourceId);
  const needsFile = ['CONTRACT_FILE', 'CUSTOMER_PAYMENT_FILE'].includes(
    source?.sourceType ?? '',
  );
  const file =
    availableFiles?.sourceKey === sourceId
      ? availableFiles.files.find(
          (f) => JSON.stringify([f.id, f.version]) === fileKey,
        )
      : undefined;
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
          if (controller.signal.aborted) return;
          setSources(value);
          setSourceError('');
          if (
            sourceId &&
            !value.some((s) => releaseSourceKey(s) === sourceId)
          ) {
            setSourceId('');
            setEligibleFiles(undefined);
            setFileKey('');
            setSourceError('Nguồn đã đổi; tải lại và chọn phiên bản mới.');
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setSources([]);
            setSourceId('');
            setEligibleFiles(undefined);
            setFileKey('');
            setSourceError((e as Error).message);
          }
        });
    return () => {
      controller.abort();
    };
  }, [roomId, actor.userId, canPrepare, list, sourceId]);
  useEffect(() => {
    if (!canPrepare || !needsFile || !source) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ sourceId: source.sourceId });
    if (source.sourceType === 'CONTRACT_FILE' && source.appendixId)
      query.set('appendixId', source.appendixId);
    if (source.sourceType === 'CONTRACT_FILE' && source.purpose)
      query.set('purpose', source.purpose);
    const selectedKey = releaseSourceKey(source);
    const path =
      source.sourceType === 'CONTRACT_FILE'
        ? 'contract-files'
        : 'payment-files';
    api<{ sourceFingerprint: string; files: EligibleFile[] }>(
      `/project-chat/rooms/${roomId}/${path}?${query}`,
      { signal: controller.signal, headers: { 'X-Chat-Actor': actor.userId } },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value.sourceFingerprint !== source.sourceFingerprint) {
          setSourceId('');
          setEligibleFiles(undefined);
          setFileKey('');
          setFileError('Nguồn đã đổi; tải lại và chọn phiên bản mới.');
          return;
        }
        setFileError('');
        setEligibleFiles({ sourceKey: selectedKey, files: value.files });
        setFileKey((key) =>
          value.files.some((f) => JSON.stringify([f.id, f.version]) === key)
            ? key
            : '',
        );
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setEligibleFiles(undefined);
        setFileKey('');
        if (e instanceof ApiError && [401, 412].includes(e.status)) onRevoked();
        else setFileError((e as Error).message);
      });
    return () => controller.abort();
  }, [
    roomId,
    actor.userId,
    canPrepare,
    sourceId,
    source,
    needsFile,
    onRevoked,
    list,
  ]);
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
        if (path === `/project-chat/rooms/${roomId}/releases`)
          prepareRequest.current = undefined;
        setNotice(
          'Server đã xác nhận; danh sách sẽ cập nhật ở lần lấy tiếp theo.',
        );
        setReview(undefined);
        setConfirmed(false);
      }
    } catch (e) {
      if (active.current) {
        if (e instanceof ApiError && [401, 412].includes(e.status)) onRevoked();
        else {
          if (
            e instanceof ApiError &&
            e.status === 409 &&
            path === `/project-chat/rooms/${roomId}/releases` &&
            needsFile
          ) {
            setSourceId('');
            setEligibleFiles(undefined);
            setFileKey('');
          }
          setError((e as Error).message);
        }
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
      {(error || sourceError || fileError) && (
        <p role="alert">{error || sourceError || fileError}</p>
      )}
      {notice && <p role="status">{notice}</p>}
      {canPrepare && (
        <div>
          <label>
            Nguồn tài liệu đủ điều kiện
            <select
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setEligibleFiles(undefined);
                setFileKey('');
                setError('');
                setSourceError('');
                setFileError('');
              }}
            >
              <option value="">Chọn nguồn/phiên bản</option>
              {sources.map((s) => (
                <option value={releaseSourceKey(s)} key={releaseSourceKey(s)}>
                  {s.name} ·{' '}
                  {s.sourceFingerprint
                    ? 'bản chụp dữ liệu nguồn'
                    : `v${s.version}`}
                </option>
              ))}
            </select>
          </label>
          {needsFile && (
            <label>
              {source?.sourceType === 'CONTRACT_FILE'
                ? source.purpose === 'RECORDED_SIGNED_COPY'
                  ? 'Bản lưu hợp đồng theo hồ sơ đã ký'
                  : 'File hợp đồng gửi khách xem xét'
                : 'Chứng từ khoản thu do nhân viên cung cấp'}
              <select
                value={fileKey}
                onChange={(e) => {
                  setFileKey(e.target.value);
                }}
              >
                <option value="">Chọn file/phiên bản</option>
                {(availableFiles?.sourceKey === sourceId
                  ? availableFiles.files
                  : []
                ).map((f) => (
                  <option
                    key={`${f.id}:${f.version}`}
                    value={JSON.stringify([f.id, f.version])}
                  >
                    {f.filename} · phiên bản file {f.version}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            disabled={busy || locked || !source || (needsFile && !file)}
            onClick={() => {
              if (!source || (needsFile && !file)) return;
              const identity = releasePrepareIdentity(
                roomId,
                actor.userId,
                source,
                file,
              );
              if (prepareRequest.current?.identity !== identity)
                prepareRequest.current = {
                  identity,
                  clientKey: crypto.randomUUID(),
                };
              void action(
                `/project-chat/rooms/${roomId}/releases`,
                releasePrepareBody(
                  source,
                  file,
                  prepareRequest.current.clientKey,
                ),
              );
            }}
          >
            Chuẩn bị phát hành
          </button>
          <p>
            Nhận phương án, báo giá, mẫu, bản vẽ và hồ sơ bàn giao đủ căn cứ.
            Bản thông tin hợp đồng/phụ lục, lịch nghĩa vụ, khoản thu đã ghi nhận
            và kế hoạch lắp đặt lấy từ hồ sơ; không thay bản có chữ ký, biên lai
            ngân hàng, xác nhận đối soát hoặc xác nhận đã giao/lắp. File hợp
            đồng gửi khách xem xét là bản riêng theo đúng phiên bản file, không
            chứng minh đã phê duyệt hoặc ký. Chứng từ khoản thu do nhân viên
            cung cấp chưa xác nhận đối soát ngân hàng.
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
          {review.sourceSnapshot && (
            <SourceReviewLabel source={review.sourceSnapshot} />
          )}
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
