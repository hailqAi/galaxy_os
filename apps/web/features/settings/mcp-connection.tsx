'use client';
import React, { useEffect, useState } from 'react';
import { api } from '../../app/lib/api';

type Connection = {
  configuration: {
    serverUrl: string;
    authentication: string;
    registrationMethod: string;
    tokenEndpointAuthMethod: string;
    baseScopes: string;
    authUrl: string;
    tokenUrl: string;
    registrationUrl: string;
    authorizationServerBase: string;
    resource: string;
  };
  account: {
    oauthAuthorized: boolean;
    eventsSubscribed: boolean;
    canConnect: boolean;
  };
  subscriptions: {
    id: string;
    verifiedUntil: string;
    refreshBefore: string | null;
    deliveries: {
      state: string;
      deliveredAt: string | null;
      errorCode: string | null;
    }[];
  }[];
  publicCheck: {
    origin: string;
    at: string;
    passed: boolean;
    checks: { path: string; status: number | null; passed: boolean }[];
  } | null;
};
export function McpConnectionDetails({
  connection,
}: {
  connection: Connection;
}) {
  const c = connection.configuration;
  const rows = [
    ['Server URL', c.serverUrl],
    ['Authentication', c.authentication],
    ['Registration method', c.registrationMethod],
    ['Client ID / Client secret', 'Không nhập thủ công; DCR cấp Client ID'],
    ['Token endpoint auth method', c.tokenEndpointAuthMethod],
    ['Default scopes', 'Để trống'],
    ['Base scopes', c.baseScopes],
    ['Auth URL', c.authUrl],
    ['Token URL', c.tokenUrl],
    ['Registration URL', c.registrationUrl],
    ['Authorization server base', c.authorizationServerBase],
    ['Resource', c.resource],
    ['OIDC enabled', 'Không bật'],
    ['OIDC configuration URL / userinfo endpoint / scopes', 'Để trống'],
  ];
  return (
    <>
      <p>
        OAuth tài khoản:{' '}
        {connection.account.oauthAuthorized
          ? 'Đã cấp quyền tại Galaxy'
          : 'Chưa cấp quyền'}
        . MCP Events:{' '}
        {connection.account.eventsSubscribed
          ? 'Có đăng ký còn hiệu lực'
          : 'Chưa đăng ký theo dõi'}
        .
      </p>
      {!connection.account.canConnect && (
        <p>
          Cần quyền AI của Galaxy và hoàn tất đổi mật khẩu trước khi cấp quyền.
        </p>
      )}
      <div className="overflow-x-auto">
        <table>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th className="p-2 text-left">{label}</th>
                <td className="break-all p-2">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Kiểm tra public:{' '}
        {connection.publicCheck
          ? `${connection.publicCheck.passed ? 'Đạt contract HTTP' : 'Chưa đạt'} · ${connection.publicCheck.at}`
          : 'Chưa kiểm tra'}
        . Kiểm tra endpoint không xác nhận ChatGPT đã nhận công việc.
      </p>
      {connection.publicCheck?.checks
        .filter((v) => !v.passed)
        .map((v) => (
          <p key={v.path}>
            Lỗi {v.path}: HTTP {v.status ?? 'không kết nối được'}. Kiểm tra
            Edge/API và cấu hình public origin rồi thử lại.
          </p>
        ))}
      {connection.subscriptions.map((s) => (
        <p key={s.id}>
          Subscription {s.id} · hiệu lực: {s.refreshBefore ?? 'không TTL'} · lần
          giao gần nhất:{' '}
          {s.deliveries[0]?.deliveredAt ??
            s.deliveries[0]?.state ??
            'chưa giao'}
          {s.deliveries[0]?.errorCode
            ? ` · ${s.deliveries[0].errorCode}; kiểm tra đăng ký trong ChatGPT rồi đăng ký lại.`
            : ''}
        </p>
      ))}
      <ol className="list-decimal pl-5">
        <li>
          Trong ChatGPT Work, thêm custom MCP server tên Galaxy OS, dùng Server
          URL trên.
        </li>
        <li>
          Chọn OAuth và Dynamic Client Registration (DCR), Retry discovery, rồi
          Create as a plugin.
        </li>
        <li>
          Đăng nhập Galaxy và duyệt quyền. Gửi: “Dùng Galaxy OS, đăng ký theo
          dõi galaxy.ai_job.created cho Project [ID Project], đọc job và
          context, xử lý file, gửi kết quả về job. Đọc attempt hiện tại trước
          khi ghi.”
        </li>
        <li>
          Trong Project Chat chọn ChatGPT Work, đính kèm file rồi gửi yêu cầu.
          Xem câu trả lời và file trong thread ban đầu.
        </li>
        <li>
          Để ngừng theo dõi, yêu cầu ChatGPT gọi events/unsubscribe với
          subscription ID. Thu hồi bên dưới sẽ ngắt quyền tại Galaxy.
        </li>
      </ol>
    </>
  );
}
export function McpConnection() {
  const [connection, setConnection] = useState<Connection>();
  const [message, setMessage] = useState('Đang tải cấu hình MCP…');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setConnection(await api<Connection>('/mcp-connection'));
      setMessage('');
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Không tải được cấu hình MCP. Đăng nhập Galaxy rồi thử lại.',
      );
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function action(kind: 'check' | 'revoke') {
    setBusy(true);
    try {
      await api('/mcp-connection/' + kind, { method: 'POST' });
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Thao tác thất bại; thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel grid gap-3" aria-label="Galaxy OS MCP">
      <h2 className="text-xl font-semibold">Galaxy OS MCP · ChatGPT Work</h2>
      <p>
        ChatGPT truy cập dữ liệu Galaxy bằng quyền tài khoản hiện tại. Cấp quyền
        OAuth và đăng ký Events là hai bước riêng.
      </p>
      <p role="status">{message}</p>
      {connection && (
        <>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(connection.configuration.serverUrl)
                .then(() => setMessage('Đã sao chép endpoint MCP.'))
                .catch(() =>
                  setMessage(
                    'Không sao chép được; chọn Server URL trong bảng.',
                  ),
                )
            }
          >
            Sao chép endpoint MCP
          </button>
          <McpConnectionDetails connection={connection} />
          <button
            disabled={busy}
            type="button"
            onClick={() => void action('check')}
          >
            Kiểm tra endpoint public
          </button>
          <button
            disabled={busy || !connection.account.oauthAuthorized}
            type="button"
            onClick={() => void action('revoke')}
          >
            Thu hồi quyền MCP của tài khoản này
          </button>
        </>
      )}
      <button disabled={busy} type="button" onClick={() => void refresh()}>
        Tải lại trạng thái MCP
      </button>
    </section>
  );
}
