'use client';
import React, { useState } from 'react';
import { api } from '../../app/lib/api';
type Receipt = {
  kind: string;
  status: string;
  requestedEffort: string | null;
  requestedModel?: string;
  sentModel?: string;
  sentEffort?: string | null;
  evidenceLevel?: string;
  observedEffort: string | null;
  observedModel: string | null;
};
export function SiwcCapabilityReceipts({ receipts }: { receipts: Receipt[] }) {
  return (
    <ul>
      {receipts.map((receipt, index) => (
        <li key={index}>
          {receipt.kind}: {receipt.status} · model yêu cầu:{' '}
          {receipt.requestedModel ?? 'chưa ghi nhận'} · model đã gửi:{' '}
          {receipt.sentModel ?? 'chưa ghi nhận'} · model provider:{' '}
          {receipt.observedModel ?? 'chưa xác minh'} · effort yêu cầu:{' '}
          {receipt.requestedEffort ?? 'default'} · effort đã gửi:{' '}
          {receipt.sentEffort === null
            ? 'default'
            : (receipt.sentEffort ?? 'chưa ghi nhận')}{' '}
          · effort provider báo: {receipt.observedEffort ?? 'chưa có telemetry'}
          {receipt.evidenceLevel && ` · ${receipt.evidenceLevel}`}
        </li>
      ))}
    </ul>
  );
}
export function SiwcCapabilityCheck({
  models,
  enabled,
}: {
  models: { id: string; label: string }[];
  enabled: boolean;
}) {
  const [model, setModel] = useState(models[0]?.id ?? '');
  const [effort, setEffort] = useState('high');
  const [webSearch, setWebSearch] = useState(true);
  const [imageInput, setImageInput] = useState(false);
  const [pdfInput, setPdfInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState('');
  return (
    <section className="panel grid gap-3" aria-label="Kiểm tra capability SIWC">
      <h2 className="text-xl font-semibold">Kiểm tra capability model</h2>
      <p>
        Gửi câu hỏi tổng hợp qua kết nối SIWC hiện tại. Chỉ capability có bằng
        chứng mới xuất hiện trong composer; effort được gửi khác với telemetry
        xác nhận đã áp dụng.
      </p>
      <label>
        Model{' '}
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Effort cần kiểm tra{' '}
        <select value={effort} onChange={(e) => setEffort(e.target.value)}>
          {['none', 'low', 'medium', 'high', 'xhigh', 'max'].map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={webSearch}
          onChange={(e) => setWebSearch(e.target.checked)}
        />{' '}
        Thử native web search và citation
      </label>
      <label>
        <input
          type="checkbox"
          checked={imageInput}
          onChange={(e) => setImageInput(e.target.checked)}
        />{' '}
        Thử đọc ảnh tổng hợp
      </label>
      <label>
        <input
          type="checkbox"
          checked={pdfInput}
          onChange={(e) => setPdfInput(e.target.checked)}
        />{' '}
        Thử đọc PDF gốc tổng hợp
      </label>
      <button
        type="button"
        disabled={!enabled || !model || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await api<{ receipts: Receipt[] }>(
              '/system/settings/chatgpt-capabilities/check',
              {
                method: 'POST',
                body: JSON.stringify({
                  model,
                  reasoningEfforts: [effort],
                  webSearch,
                  imageInput,
                  pdfInput,
                }),
              },
            );
            setReceipts(result.receipts);
          } catch {
            setError(
              'Không xác minh được capability. Kiểm tra quyền và trạng thái provider; không đổi model để thử lại.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Đang kiểm tra provider…' : 'Kiểm tra capability thực'}
      </button>
      {error && <p role="alert">{error}</p>}
      <SiwcCapabilityReceipts receipts={receipts} />
    </section>
  );
}
