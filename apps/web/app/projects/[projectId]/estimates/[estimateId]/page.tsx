'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

type Line = {
  id: string;
  section: string;
  customDescription: string | null;
  itemType: string;
  quantity: string;
  purchaseQuantity: string;
  unit: string;
  sellingPrice: string;
  netPurchasePrice?: string | null;
  totalCost?: string | null;
  margin?: string | null;
  markup?: string | null;
  priceStatus: string;
  priceSourceType?: string | null;
  priceQuotedAt?: string | null;
  priceValidUntil?: string | null;
  sourceDocument?: string | null;
};
type Estimate = {
  number: string;
  title: string;
  currency: string;
  versions: {
    id: string;
    version: number;
    status: string;
    subtotalCost?: string | null;
    subtotalSelling: string;
    approvedContingency?: string;
    totalCostWithContingency?: string | null;
    riskAllocations?: {
      id: string;
      approvedAmount: string;
      basis: string;
      status: string;
      risk: { id: string; code: string; title: string; status: string };
    }[];
    lines: Line[];
    approvals: {
      id: string;
      decision: string;
      comment: string | null;
      createdAt: string;
    }[];
  }[];
};
const priceStatuses: Record<string, string> = {
  MISSING: 'Thiếu dữ liệu',
  PROVISIONAL: 'Tạm tính',
  CONFIRMED: 'Đã xác nhận',
};
const priceSources: Record<string, string> = {
  SUPPLIER_QUOTATION: 'Báo giá NCC',
  HISTORICAL: 'Dữ liệu lịch sử',
  STANDARD: 'Định mức có nguồn',
  MANUAL: 'Nhập tay',
};
export default function EstimatePage() {
  const { projectId, estimateId } = useParams<{
    projectId: string;
    estimateId: string;
  }>();
  const [item, setItem] = useState<Estimate>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Estimate>(`/projects/${projectId}/estimates/${estimateId}`)
        .then(setItem)
        .catch((e: Error) => setMessage(e.message)),
    [estimateId, projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function action(name: 'submit' | 'approve' | 'reject') {
    try {
      await api(`/projects/${projectId}/estimates/${estimateId}/${name}`, {
        method: 'POST',
        body: '{}',
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  if (!item)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải dự toán…'}
      </p>
    );
  const version = item.versions[0];
  if (!version) return <p role="alert">Dự toán không có version hợp lệ.</p>;
  const money = (value?: string | null) =>
    value === undefined
      ? 'Không có quyền xem'
      : value === null
        ? 'Chưa có dữ liệu'
        : new Intl.NumberFormat('vi-VN').format(Number(value));
  const percent = (value?: string | null) =>
    value == null ? '—' : `${(Number(value) * 100).toLocaleString('vi-VN')}%`;
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/estimates`}>Dự toán</Link> →{' '}
        {item.number}
      </p>
      <header className="flex justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <p>
            {item.number} · V{version.version} · {version.status}
          </p>
        </div>
        <div className="flex gap-2">
          {version.status === 'DRAFT' && (
            <button className="primary" onClick={() => void action('submit')}>
              Gửi duyệt
            </button>
          )}
          {version.status === 'PENDING' && (
            <>
              <button
                className="primary"
                onClick={() => void action('approve')}
              >
                Duyệt
              </button>
              <button onClick={() => void action('reject')}>Từ chối</button>
            </>
          )}
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Nhóm</th>
              <th>Mô tả</th>
              <th>Khối lượng</th>
              <th>Khối lượng mua/SX</th>
              <th>Nguồn giá</th>
              <th>Giá bán</th>
              <th>Chi phí nội bộ</th>
              <th>Margin / markup</th>
            </tr>
          </thead>
          <tbody>
            {version.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td className="py-3">{line.section}</td>
                <td>{line.customDescription || line.itemType}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>
                  {line.purchaseQuantity} {line.unit}
                </td>
                <td>
                  <strong>
                    {priceStatuses[line.priceStatus] ?? line.priceStatus}
                  </strong>
                  <br />
                  {line.priceSourceType
                    ? (priceSources[line.priceSourceType] ??
                      line.priceSourceType)
                    : 'Chưa chọn nguồn'}
                  {line.sourceDocument && ` · ${line.sourceDocument}`}
                  {line.priceQuotedAt && (
                    <>
                      <br />
                      {new Date(line.priceQuotedAt).toLocaleDateString('vi-VN')}
                      {line.priceValidUntil &&
                        ` → ${new Date(line.priceValidUntil).toLocaleDateString('vi-VN')}`}
                    </>
                  )}
                </td>
                <td>{money(line.sellingPrice)}</td>
                <td>{money(line.totalCost)}</td>
                <td>
                  {percent(line.margin)} / {percent(line.markup)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end gap-6">
          <strong>Chi phí: {money(version.subtotalCost)}</strong>
          {version.approvedContingency !== undefined && (
            <strong>
              Dự phòng rủi ro: {money(version.approvedContingency)}
            </strong>
          )}
          {version.totalCostWithContingency !== undefined && (
            <strong>
              Chi phí có dự phòng: {money(version.totalCostWithContingency)}
            </strong>
          )}
          <strong>
            Giá bán: {money(version.subtotalSelling)} {item.currency}
          </strong>
        </div>
      </section>
      {version.riskAllocations && (
        <section className="panel">
          <h2 className="font-semibold">Dự phòng rủi ro được phân bổ</h2>
          {version.riskAllocations.length ? (
            <ul>
              {version.riskAllocations.map((allocation) => (
                <li key={allocation.id}>
                  {allocation.risk.code} · {allocation.risk.title}:{' '}
                  {money(allocation.approvedAmount)} {item.currency} ·{' '}
                  {allocation.basis}
                </li>
              ))}
            </ul>
          ) : (
            <p>Chưa phân bổ dự phòng cho phiên bản này.</p>
          )}
        </section>
      )}
      <section className="panel">
        <h2 className="font-semibold">Lịch sử phê duyệt</h2>
        {version.approvals.length ? (
          <ul>
            {version.approvals.map((a) => (
              <li key={a.id}>
                {a.decision} · {new Date(a.createdAt).toLocaleString('vi-VN')}{' '}
                {a.comment}
              </li>
            ))}
          </ul>
        ) : (
          <p>Chưa có quyết định.</p>
        )}
      </section>
    </div>
  );
}
