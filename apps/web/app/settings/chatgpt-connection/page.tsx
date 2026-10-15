'use client';

import Link from 'next/link';
import { SiwcCapabilityCheck } from '../../../features/settings/siwc-capabilities';
import { McpConnection } from '../../../features/settings/mcp-connection';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

type Connection = {
  status: string;
  canBeginAuth: boolean;
  canTestOwnerInference: boolean;
  ownerInferenceVerified: boolean;
  canStaffUseAI: boolean;
  canCancel: boolean;
  canDisconnect: boolean;
  canCheck: boolean;
  identity: { label: string } | null;
  registration: { clientId: string; verified: boolean } | null;
  models: { id: string; label: string }[];
  scopes: string[];
  callbackHost: string;
  revocation: string;
  catalogAt: string | null;
  providerVerifiedAt: string | null;
  inferenceGrant: string;
  providerScope: string;
  error: {
    stage: string;
    code?: string;
    detail?: string;
    httpStatus: number | null;
    requestId?: string;
    at: string;
  } | null;
  executionPolicy: string;
  apiRelease: string | null;
  legacyProviders: { provider: string; paused: boolean }[];
};
const endpoint = '/system/settings/chatgpt-connection';
const labels: Record<string, string> = {
  AUTH_NOT_STARTED: 'Chưa liên kết tài khoản',
  AUTH_PENDING: 'Đang chờ đăng nhập trên OpenAI',
  VERIFYING_IDENTITY: 'Đang xác minh danh tính',
  OWNER_READY: 'Đã cấp quyền thử AI cho chủ kết nối',
  IDENTITY_VERIFIED: 'Đã xác minh danh tính; chưa có đủ quyền dùng gói',
  CONSENT_DECLINED: 'Lần cấp quyền đã bị từ chối',
  AUTH_CANCELLED: 'Đã hủy lần đăng nhập',
  REAUTH_REQUIRED: 'Cần kết nối lại',
  DISCONNECTED: 'Đã ngắt kết nối tại Galaxy',
  REGISTRATION_INCOMPLETE: 'OpenAI chưa trả registration hợp lệ',
};

export default function ChatGptConnectionPage() {
  const [connection, setConnection] = useState<Connection>();
  const [message, setMessage] = useState('Đang tải trạng thái…');
  const [busy, setBusy] = useState(false);
  const [webRelease, setWebRelease] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      setConnection(await api<Connection>(endpoint));
      setMessage('');
    } catch (e) {
      if (e instanceof ApiError && [401, 403].includes(e.status))
        setConnection(undefined);
      setMessage(
        e instanceof ApiError && e.status === 401
          ? 'Phiên Galaxy đã hết hạn. Hãy đăng nhập lại.'
          : e instanceof ApiError && e.status === 403
            ? 'Chỉ quản trị SYSTEM được quản lý kết nối ChatGPT.'
            : 'Không tải được trạng thái kết nối. Hãy thử lại.',
      );
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    fetch('/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((v) => setWebRelease(v.releaseId))
      .catch(() => {});
    return () => clearTimeout(initial);
  }, [refresh]);
  useEffect(() => {
    if (
      !['AUTH_PENDING', 'VERIFYING_IDENTITY'].includes(connection?.status ?? '')
    )
      return;
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [connection?.status, refresh]);
  async function begin() {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true);
    try {
      const result = await api<{ startUrl: string }>(endpoint + '/begin', {
        method: 'POST',
      });
      if (popup) popup.location.href = result.startUrl;
      else window.location.assign(result.startUrl);
      await refresh();
    } catch (e) {
      popup?.close();
      setMessage(
        e instanceof Error ? e.message : 'Không bắt đầu được đăng nhập.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: 'cancel' | 'disconnect' | 'catalog') {
    setBusy(true);
    try {
      await api(kind === 'catalog' ? endpoint : endpoint + '/' + kind, {
        method: 'POST',
      });
      await refresh();
    } catch (e) {
      await refresh();
      setMessage(e instanceof Error ? e.message : 'Không hoàn tất thao tác.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5">
      <McpConnection />
      <section className="panel grid gap-3">
        <h1 className="text-2xl font-semibold">Kết nối ChatGPT</h1>
        <p>
          Pilot dành cho quản trị viên liên kết tài khoản của mình. Chat và công
          cụ trong Project vẫn theo quyền Galaxy.
        </p>
        <p role="status">{message}</p>
        {!connection && (
          <>
            <Link href="/login">Đăng nhập Galaxy</Link>
            <button type="button" onClick={() => void refresh()}>
              Tải lại trạng thái
            </button>
          </>
        )}
      </section>
      {connection && (
        <>
          <section className="panel grid gap-3" aria-label="Trạng thái kết nối">
            <h2 className="text-xl font-semibold">
              {labels[connection.status] ?? connection.status}
            </h2>
            <dl className="grid gap-2">
              <div>
                <dt>Tài khoản đã xác minh</dt>
                <dd>{connection.identity?.label ?? 'Chưa có'}</dd>
              </div>
              <div>
                <dt>Quyền ChatGPT plan</dt>
                <dd>
                  {connection.inferenceGrant === 'GRANTED'
                    ? 'OpenAI đã cấp quyền sử dụng gói'
                    : 'Chưa được cấp đủ quyền. Hãy kết nối và cấp quyền trên OpenAI.'}
                </dd>
              </div>
              <div>
                <dt>Thử AI cho chủ kết nối</dt>
                <dd>
                  {connection.canTestOwnerInference
                    ? 'Đủ điều kiện thử'
                    : 'Chưa sẵn sàng'}
                </dd>
              </div>
              <div>
                <dt>Câu trả lời thật</dt>
                <dd>
                  {connection.ownerInferenceVerified
                    ? 'Đã nhận response.completed'
                    : 'Chưa kiểm chứng'}
                </dd>
              </div>
              <div>
                <dt>Nhân viên dùng chung</dt>
                <dd>Chưa bật; đang đánh giá quyền phục vụ nhân viên riêng.</dd>
              </div>
            </dl>
            <p id="connection-host">
              Thực hiện kết nối bằng trình duyệt trên máy Windows đang chạy
              Galaxy. Nếu đang mở LAN từ máy khác, hãy chuyển sang máy host;
              callback 127.0.0.1 thuộc máy đang mở trình duyệt.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="primary"
                disabled={busy || !connection.canBeginAuth}
                aria-describedby="connection-host"
                onClick={() => void begin()}
              >
                Continue with ChatGPT
              </button>
              {connection.canCancel && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void action('cancel')}
                >
                  Hủy đăng nhập
                </button>
              )}
              <button
                type="button"
                disabled={busy || !connection.canCheck}
                onClick={() => void action('catalog')}
              >
                Lấy lại danh sách model
              </button>
              <button
                type="button"
                disabled={busy || !connection.canDisconnect}
                onClick={() => void action('disconnect')}
              >
                Ngắt kết nối
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Tải lại trạng thái
              </button>
            </div>
            {connection.callbackHost !== 'READY' && (
              <p role="alert">
                Callback chưa sẵn sàng: {connection.callbackHost}
              </p>
            )}
            {connection.revocation === 'UNCONFIRMED' && (
              <p>
                Đã ngắt cục bộ; chưa xác nhận thu hồi tại OpenAI. Anh có thể
                ngắt ứng dụng trong ChatGPT Settings.
              </p>
            )}
            {connection.revocation === 'CONFIRMED' && (
              <p>OpenAI đã xác nhận thu hồi session.</p>
            )}
            {connection.error && (
              <p role="alert">
                Bước {connection.error.stage}:{' '}
                {connection.error.code ?? 'Lỗi kết nối'}; HTTP{' '}
                {connection.error.httpStatus ?? 'chưa có phản hồi'}; request{' '}
                {connection.error.requestId ?? 'không được cung cấp'}.{' '}
                {connection.error.detail}
              </p>
            )}
          </section>
          <section className="panel grid gap-3">
            <h2 className="text-xl font-semibold">Model và Project</h2>
            <p>
              {connection.models.length
                ? connection.models.map((m) => m.label).join(', ')
                : 'Chưa nhận được danh sách model từ tài khoản đã kết nối.'}
            </p>
            <p>
              Chat theo quyền của từng Project; có công cụ đọc công việc, nguồn,
              memory và tạo bản nháp. Mở Project được phép → Làm việc → AI để
              thử.
            </p>
            <Link href="/projects">Mở danh sách Project</Link>
            <a
              href="https://chatgpt.com/settings/usage"
              target="_blank"
              rel="noreferrer"
            >
              Xem và quản lý usage trong ChatGPT
            </a>
          </section>
          <SiwcCapabilityCheck
            models={connection.models}
            enabled={connection.canTestOwnerInference}
          />
          <section className="panel grid gap-3" aria-label="Chẩn đoán quản trị">
            <h2 className="text-xl font-semibold">Chẩn đoán kết nối</h2>
            <p>
              Registration:{' '}
              {connection.registration?.clientId ?? 'Chưa đăng ký'} ·{' '}
              {connection.registration?.verified
                ? 'đã xác minh'
                : 'chưa xác minh'}
            </p>
            <p>Scope thực nhận: {connection.scopes.join(', ') || 'Chưa có'}</p>
            <p>
              Catalog: {connection.catalogAt ?? 'Chưa kiểm tra'} · Inference:{' '}
              {connection.providerVerifiedAt ?? 'Chưa kiểm chứng'}
            </p>
            <p>
              Web: {webRelease ?? 'Chưa xác minh'} · API:{' '}
              {connection.apiRelease ?? 'Chưa xác minh'}
            </p>
            <p>Policy: {connection.executionPolicy}</p>
            <ul>
              {connection.legacyProviders.map((p) => (
                <li key={p.provider}>
                  {p.provider}: {p.paused ? 'PAUSED_BY_USER' : 'Chưa tạm dừng'}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
