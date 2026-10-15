'use client';
import React, { useEffect, useState } from 'react';
import { api } from '../../app/lib/api';

type Connection = {
  account: { oauthAuthorized: boolean; canConnect: boolean };
  subscriptions: {
    name: string;
    arguments: { project_id?: string };
    refreshBefore: string | null;
    verifiedUntil: string | null;
  }[];
};
type Readiness = {
  state:
    | 'UNKNOWN'
    | 'DISCONNECTED'
    | 'NO_PERMISSION'
    | 'NO_SUBSCRIPTION'
    | 'READY';
  callbackRevalidation: boolean;
};
export function workReadiness(
  connection: Connection,
  projectId: string,
  now = new Date(),
): Readiness {
  if (!connection.account.canConnect)
    return { state: 'NO_PERMISSION', callbackRevalidation: false };
  if (!connection.account.oauthAuthorized)
    return { state: 'DISCONNECTED', callbackRevalidation: false };
  const subscription = connection.subscriptions.find(
    (s) =>
      s.name === 'galaxy.ai_job.created' &&
      (!s.arguments.project_id || s.arguments.project_id === projectId) &&
      (!s.refreshBefore || new Date(s.refreshBefore) > now),
  );
  return {
    state: subscription ? 'READY' : 'NO_SUBSCRIPTION',
    callbackRevalidation: Boolean(
      subscription &&
        (!subscription.verifiedUntil ||
          new Date(subscription.verifiedUntil) <= now),
    ),
  };
}
const monitorPrompt =
  'Đăng ký theo dõi galaxy.ai_job.created của Galaxy OS cho các công việc của tôi. Khi nhận job, đọc galaxy_get_job, xử lý yêu cầu và gửi kết quả về đúng job bằng galaxy_submit_job_result; không coi nhận event là đã hoàn tất.';
export function WorkReadiness({ value }: { value: Readiness }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="text-sm">
      {value.state === 'UNKNOWN'
        ? 'Chưa kiểm tra được điều kiện nhận việc của ChatGPT Work.'
        : value.state === 'NO_PERMISSION'
          ? 'Tài khoản chưa có quyền giao việc AI. Liên hệ quản trị Project.'
          : value.state === 'DISCONNECTED'
            ? 'Chưa kết nối tài khoản Galaxy với ChatGPT Work.'
            : value.state === 'NO_SUBSCRIPTION'
              ? 'Đã kết nối, chưa đăng ký nhận việc cho Project này. Yêu cầu sẽ được giữ chờ đăng ký.'
              : 'Subscription sẵn sàng nhận việc. Việc xử lý bắt đầu khi ChatGPT báo tiến độ.'}
      {value.state === 'READY' && value.callbackRevalidation && (
        <p>Callback sẽ được xác minh lại trước lần giao việc tiếp theo.</p>
      )}
      {['DISCONNECTED', 'NO_PERMISSION', 'UNKNOWN'].includes(value.state) && (
        <p>
          <a href="/settings/chatgpt-connection">Cấu hình kết nối</a>
        </p>
      )}
      {value.state === 'NO_SUBSCRIPTION' && (
        <p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(monitorPrompt)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            Đăng ký nhận việc · sao chép hướng dẫn
          </button>{' '}
          {copied && 'Đã sao chép. Gửi trong ChatGPT Work có bật Galaxy OS.'}
        </p>
      )}
    </div>
  );
}
export function McpReadiness({
  projectId,
  actorId,
}: {
  projectId: string;
  actorId: string;
}) {
  const identity = projectId + ':' + actorId;
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    value: Readiness;
  }>({
    identity,
    value: { state: 'UNKNOWN', callbackRevalidation: false },
  });
  const value: Readiness =
    snapshot.identity === identity
      ? snapshot.value
      : { state: 'UNKNOWN', callbackRevalidation: false };
  useEffect(() => {
    let disposed = false,
      loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const connection = await api<Connection>('/mcp-connection', {
          headers: { 'X-Chat-Actor': actorId },
        });
        if (!disposed)
          setSnapshot({
            identity: projectId + ':' + actorId,
            value: workReadiness(connection, projectId),
          });
      } catch {
        if (!disposed)
          setSnapshot({
            identity: projectId + ':' + actorId,
            value: { state: 'UNKNOWN', callbackRevalidation: false },
          });
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [projectId, actorId]);
  return <WorkReadiness value={value} />;
}
