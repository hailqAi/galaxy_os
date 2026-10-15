'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Consent = {
  requestId: string;
  projectId: string;
  requestedModel: string;
  effort: string;
  visibility: string;
};
export default function WorkspaceConsentPage() {
  const [value, setValue] = useState<Consent>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const id = new URLSearchParams(location.search).get('request');
      if (!id) throw new Error('invalid request');
      return api<Consent>(
        '/workspace-agent-auth/requests/' + encodeURIComponent(id),
      );
    })()
      .then((value) => {
        if (active) setValue(value);
      })
      .catch(() => {
        if (active)
          setError(
            'Cần yêu cầu consent hợp lệ, đăng nhập đúng tài khoản Galaxy và quyền Project của pilot.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="max-w-xl p-6">
      <h1 className="text-xl">Cho phép Workspace nhận kết quả</h1>
      {error && <p role="alert">{error}</p>}
      {value && (
        <>
          <p>
            Connector riêng cho Project {value.projectId}, model{' '}
            {value.requestedModel}, effort {value.effort}, visibility{' '}
            {value.visibility}. Chỉ đọc context/nguồn đã cấp của job và trả kết
            quả vào chat riêng. Token hết hạn sau một giờ; thu hồi
            phiên/quyền/config sẽ chặn truy cập.
          </p>
          <button
            disabled={busy}
            className="border rounded p-2"
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api<{ redirect: string }>(
                  '/workspace-agent-auth/requests/' +
                    value.requestId +
                    '/consent',
                  { method: 'POST', body: '{}' },
                );
                const redirect = new URL(result.redirect);
                if (
                  redirect.protocol !== 'https:' ||
                  redirect.hostname !== 'chatgpt.com'
                )
                  throw new Error();
                location.assign(result.redirect);
              } catch {
                setError(
                  'Không cấp được consent. Yêu cầu có thể đã hết hạn hoặc quyền đã đổi.',
                );
                setBusy(false);
              }
            }}
          >
            Cho phép connector riêng
          </button>
        </>
      )}
    </main>
  );
}
