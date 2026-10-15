'use client';
import Link from 'next/link';
import React, { useState } from 'react';

type Binding = {
  id: string;
  projectId: string;
  requestedModel: string;
  configuredModel: string;
  effort: string;
  agentId: string;
  channelId: string;
  maxRunsPerDay?: number;
  verification?: string;
};
export type WorkspaceMetadata = {
  status: string;
  revision: string | null;
  hasCredential: boolean;
  workspaceId: string | null;
  bindings: Binding[];
};
export function WorkspaceConfigurationForm({
  metadata,
  onSave,
  busy,
}: {
  metadata: WorkspaceMetadata;
  onSave: (input: unknown) => Promise<void>;
  busy: boolean;
}) {
  const binding = metadata.bindings[0];
  const [fields, setFields] = useState({
    workspaceId: metadata.workspaceId ?? '',
    projectId: binding?.projectId ?? '',
    requestedModel: binding?.requestedModel ?? '',
    configuredModel: binding?.configuredModel ?? '',
    effort: binding?.effort ?? 'default',
    agentId: binding?.agentId ?? '',
    channelId: binding?.channelId ?? '',
  });
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          await onSave({
            expectedVersion: metadata.revision,
            workspaceId: fields.workspaceId,
            ...(token ? { accessToken: token } : {}),
            bindings: [
              {
                id: binding?.id ?? crypto.randomUUID(),
                projectId: fields.projectId,
                requestedModel: fields.requestedModel,
                configuredModel: fields.configuredModel,
                effort: fields.effort,
                agentId: fields.agentId,
                channelId: fields.channelId,
                maxRunsPerDay: binding?.maxRunsPerDay ?? 3,
              },
              ...metadata.bindings
                .slice(1)
                .map(
                  ({
                    id,
                    projectId,
                    requestedModel,
                    configuredModel,
                    effort,
                    agentId,
                    channelId,
                    maxRunsPerDay,
                  }) => ({
                    id,
                    projectId,
                    requestedModel,
                    configuredModel,
                    effort,
                    agentId,
                    channelId,
                    maxRunsPerDay,
                  }),
                ),
            ],
          });
          setToken('');
        } catch {
          setToken('');
          setError(
            'Không lưu được cấu hình. Kiểm tra quyền, phiên bản và thông tin rồi thử lại.',
          );
        }
      }}
    >
      <p role="status">
        {binding?.verification === 'CONFIG_VERIFIED'
          ? 'Đã kiểm tra cấu hình published. Model thực từng run chưa có telemetry xác minh.'
          : 'Chưa xác minh cấu hình published. Nhập tên model không xác nhận model thực; Workspace chưa được phép nhận việc.'}
      </p>
      <p>
        Credential Workspace riêng{' '}
        {metadata.hasCredential ? 'đã được lưu mã hóa' : 'chưa được cấu hình'}.
        Không dùng token SIWC.
      </p>
      {(
        [
          'workspaceId',
          'projectId',
          'requestedModel',
          'configuredModel',
          'agentId',
          'channelId',
        ] as const
      ).map((key) => (
        <label key={key} className="block my-3">
          {
            {
              workspaceId: 'Workspace ID',
              projectId: 'Project ID (UUID)',
              requestedModel: 'Model Galaxy (ID chính thức)',
              configuredModel: 'Model published (ID chính thức)',
              agentId: 'Published agent ID',
              channelId: 'API channel ID',
            }[key]
          }
          <input
            className="block border rounded p-2 w-full"
            required
            value={fields[key]}
            maxLength={200}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          />
        </label>
      ))}
      <label className="block my-3">
        Effort published
        <select
          className="block border p-2"
          value={fields.effort}
          onChange={(e) => setFields({ ...fields, effort: e.target.value })}
        >
          {['default', 'low', 'medium', 'high', 'xhigh'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="block my-3">
        Workspace access token{' '}
        {metadata.hasCredential ? '(để trống nếu giữ token hiện tại)' : ''}
        <input
          className="block border rounded p-2 w-full"
          type="password"
          autoComplete="new-password"
          value={token}
          maxLength={32000}
          required={!metadata.hasCredential}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="border rounded p-2" disabled={busy}>
        Lưu cấu hình pilot riêng
      </button>
    </form>
  );
}
export default function WorkspaceAgentsPage() {
  return (
    <main className="max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Workspace Agents</h1>
      <p role="status">
        WORKSPACE_DEFERRED_BY_USER · Workspace tạm dừng theo lựa chọn của bạn.
        Chat, Create và memory tiếp tục qua SIWC.
      </p>
      <Link href="/settings/chatgpt-connection">Kết nối SIWC</Link>
    </main>
  );
}
