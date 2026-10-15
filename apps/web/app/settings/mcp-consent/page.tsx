'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Consent = {
  id: string;
  clientName: string;
  resource: string;
  scopes: string[];
  expiresAt: string;
};
const scopeLabels: Record<string, string> = {
  'galaxy.jobs.read': 'Đọc yêu cầu, tệp đầu vào và trạng thái công việc.',
  'galaxy.jobs.write': 'Gửi tiến độ, câu trả lời và tệp kết quả về Galaxy.',
  'galaxy.events': 'Nhận thông báo khi có công việc Galaxy mới.',
};

export default function McpConsentPage() {
  const [value, setValue] = useState<Consent>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(location.search).get('request');
    const preview = id
      ? api<Consent>('/mcp-auth/requests/' + encodeURIComponent(id))
      : Promise.reject(new Error('Yêu cầu kết nối không hợp lệ.'));
    void preview
      .then((result) => {
        if (active) setValue(result);
      })
      .catch(() => {
        if (active)
          setError(
            'Yêu cầu đã hết hạn hoặc tài khoản Galaxy chưa có quyền dùng AI. Bắt đầu kết nối lại từ ChatGPT.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function consent(approved: boolean) {
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ redirect: string }>(
        '/mcp-auth/requests/' +
          encodeURIComponent(value.id) +
          (approved ? '/consent' : '/decline'),
        { method: 'POST', body: '{}' },
      );
      const target = new URL(result.redirect);
      if (
        target.protocol !== 'https:' ||
        target.hostname !== 'chatgpt.com' ||
        target.username ||
        target.password
      )
        throw new Error();
      location.assign(target.href);
    } catch {
      setError(
        'Không hoàn tất được. Yêu cầu có thể đã hết hạn hoặc quyền đã thay đổi.',
      );
      setBusy(false);
    }
  }
  return (
    <main className="max-w-xl p-6">
      <h1 className="text-xl">Kết nối ChatGPT Work với Galaxy OS</h1>
      {error && <p role="alert">{error}</p>}
      {!value && !error && <p role="status">Đang kiểm tra yêu cầu kết nối…</p>}
      {value && (
        <>
          <p>{value.clientName} yêu cầu các quyền sau:</p>
          <ul>
            {value.scopes.map((scope) => (
              <li key={scope}>{scopeLabels[scope] ?? scope}</li>
            ))}
          </ul>
          <p>
            Quyền dữ liệu theo tổ chức, Project và công việc Galaxy vẫn áp dụng.
            Kết nối này độc lập với SIWC; model và chế độ xử lý được chọn trong
            ChatGPT Work.
          </p>
          <button
            className="border rounded p-2"
            disabled={busy}
            onClick={() => void consent(true)}
          >
            {busy ? 'Đang kết nối…' : 'Cho phép kết nối'}
          </button>
          <button disabled={busy} onClick={() => void consent(false)}>
            Từ chối kết nối
          </button>
        </>
      )}
    </main>
  );
}
