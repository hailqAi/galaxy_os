'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

type Connection = {
  tools: {
    name: string;
    description: string;
    version: string;
    sideEffect: string;
    authorization: string;
    status: string;
    reason: string;
  }[];
  status: string;
  appEligibility: string;
  inferenceGrant: string;
  providerScope: string;
  identity: { label: string } | null;
  models: { id: string; label: string }[];
  canConnect: boolean;
  canDisconnect: boolean;
  canCheck: boolean;
  checkedAt: string | null;
  executionPolicy: string;
  apiRelease: string | null;
  legacyProviders: { provider: string; paused: boolean; configured: boolean }[];
};
const endpoint = '/system/settings/chatgpt-connection';

export default function ChatGptConnectionPage() {
  const [connection, setConnection] = useState<Connection>();
  const [webRelease, setWebRelease] = useState<string>();
  const [message, setMessage] = useState('Đang tải trạng thái…');
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Connection>(endpoint, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setConnection(value);
          setMessage('');
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof ApiError && error.status === 403
              ? 'Chỉ quản trị hệ thống được quản lý kết nối ChatGPT.'
              : 'Không tải được trạng thái. Hãy tải lại trang.',
          );
      });
    fetch('/health', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!controller.signal.aborted && typeof value?.releaseId === 'string')
          setWebRelease(value.releaseId);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function check() {
    setChecking(true);
    try {
      setConnection(await api<Connection>(endpoint, { method: 'POST' }));
      setMessage(
        'Đã kiểm tra cấu hình tại Galaxy. Chưa xác minh kết nối với OpenAI.',
      );
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status))
        setConnection(undefined);
      setMessage(
        'Không kiểm tra được cấu hình hoặc quyền quản trị đã thay đổi.',
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="grid gap-5">
      <section className="panel">
        <h1 className="text-2xl font-semibold">Kết nối ChatGPT</h1>
        <p className="mt-2">
          Quản trị hệ thống cấu hình kết nối. Nhân viên sử dụng AI trong Project
          theo quyền Galaxy.
        </p>
        <p role="status" className="mt-3">
          {message}
        </p>
      </section>
      {connection && (
        <>
          <section className="panel grid gap-3" aria-label="Trạng thái kết nối">
            <h2 className="text-xl font-semibold">Chưa được kích hoạt</h2>
            <dl className="grid gap-2">
              <div>
                <dt>Cấu hình ứng dụng</dt>
                <dd>Chưa có registration phù hợp được xác minh.</dd>
              </div>
              <div>
                <dt>Danh tính đã xác minh</dt>
                <dd>
                  {connection.identity?.label ?? 'Chưa kết nối tài khoản'}
                </dd>
              </div>
              <div>
                <dt>Quyền sử dụng gói</dt>
                <dd>Chưa được cấp quyền inference.</dd>
              </div>
              <div>
                <dt>Phạm vi phục vụ nhiều người</dt>
                <dd>
                  Chưa xác minh. Gói Pro cá nhân không tự cấp quyền sử dụng
                  chung.
                </dd>
              </div>
              <div>
                <dt>Lần kiểm tra cấu hình gần nhất</dt>
                <dd>
                  {connection.checkedAt
                    ? new Date(connection.checkedAt).toLocaleString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                      })
                    : 'Chưa kiểm tra'}
                </dd>
              </div>
            </dl>
            <p id="connection-requirements">
              Cần xác minh điều kiện ứng dụng private/local, registration, grant
              và phạm vi người dùng với OpenAI trước khi mở kết nối. Chưa yêu
              cầu đăng nhập hoặc MFA.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled
                aria-describedby="connection-requirements"
              >
                Kết nối ChatGPT
              </button>
              <button
                type="button"
                className="primary"
                disabled={!connection.canCheck || checking}
                onClick={check}
              >
                {checking ? 'Đang kiểm tra…' : 'Kiểm tra cấu hình'}
              </button>
              <button type="button" disabled title="Chưa có tài khoản kết nối">
                Ngắt kết nối
              </button>
            </div>
            <a
              href="https://developers.openai.com/siwc/quickstart"
              target="_blank"
              rel="noreferrer"
            >
              Điều kiện kết nối chính thức của OpenAI
            </a>
          </section>
          <section className="panel grid gap-3">
            <h2 className="text-xl font-semibold">Model và quyền sử dụng</h2>
            <p>
              {connection.models.length
                ? connection.models.map((model) => model.label).join(', ')
                : 'Chưa có model được cấp. Không có lượt suy luận hoặc công cụ live được xác minh.'}
            </p>
            <p>
              Quyền dùng AI và quyền đọc/ghi hồ sơ được quản lý riêng theo
              Project. Chưa bật sử dụng chung khi phạm vi nhà cung cấp chưa xác
              minh.
            </p>
            <Link href="/settings/roles">
              Quản lý vai trò &amp; quyền Galaxy
            </Link>
            <p>
              Hạn mức và usage: chưa có số liệu chính thức. Khi kết nối hợp lệ,
              xem trong ChatGPT → Settings → Usage.
            </p>
            <a
              href="https://learn.chatgpt.com/docs/sign-in-with-chatgpt"
              target="_blank"
              rel="noreferrer"
            >
              Hướng dẫn quản lý usage trong ChatGPT
            </a>
          </section>
          <section className="panel grid gap-3" aria-label="Công cụ Galaxy">
            <h2 className="text-xl font-semibold">Công cụ Galaxy</h2>
            <p>
              Danh mục contract hiện có. Chưa có công cụ live được xác minh; kết
              nối ChatGPT chưa được kích hoạt.
            </p>
            <ul className="grid gap-3">
              {connection.tools.map((tool) => (
                <li key={tool.name}>
                  <strong>{tool.name}</strong>
                  <p>{tool.description}</p>
                  <p>
                    v{tool.version} · {tool.sideEffect} · {tool.authorization} ·{' '}
                    {tool.status} ({tool.reason})
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel grid gap-3" aria-label="Chẩn đoán quản trị">
            <h2 className="text-xl font-semibold">
              Chẩn đoán và phiên bản đang chạy
            </h2>
            <p>
              Điều kiện ứng dụng: {connection.appEligibility}; grant:{' '}
              {connection.inferenceGrant}; phạm vi: {connection.providerScope}.
            </p>
            <p>
              Policy: {connection.executionPolicy}. Không có fallback sang API
              key.
            </p>
            <ul>
              {connection.legacyProviders.map((provider) => (
                <li key={provider.provider}>
                  {provider.provider}:{' '}
                  {provider.paused
                    ? 'PAUSED_BY_USER'
                    : provider.configured
                      ? 'Chưa tạm dừng trong cấu hình'
                      : 'Chưa cấu hình'}
                </li>
              ))}
            </ul>
            <p>
              Web: {webRelease ?? 'Chưa xác minh'} · API:{' '}
              {connection.apiRelease ?? 'Chưa xác minh'}
            </p>
            <p>
              Callback host chưa cấu hình; callback từ LAN/mobile chưa được
              nghiệm thu. Kết nối tại host và dùng qua LAN là hai phép kiểm
              riêng.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
