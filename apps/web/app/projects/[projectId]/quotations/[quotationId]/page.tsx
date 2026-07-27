'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';

type Version = {
  id: string;
  version: number;
  status: string;
  validityDate: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  shipping: string;
  installation: string;
  warranty: string;
  grandTotal: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  installationTerms: string | null;
  warrantyTerms: string | null;
  lines: {
    id: string;
    section: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  approvals: { id: string; decision: string; createdAt: string }[];
  documents: {
    id: string;
    format: string;
    language: string;
    generatedAt: string;
  }[];
};
type Quotation = {
  id: string;
  number: string;
  currency: string;
  status: string;
  currentVersion: number;
  versions: Version[];
};
export default function QuotationPage() {
  const { projectId, quotationId } = useParams<{
    projectId: string;
    quotationId: string;
  }>();
  const [item, setItem] = useState<Quotation>();
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Quotation>(`/projects/${projectId}/quotations/${quotationId}`)
        .then(setItem)
        .catch((e: Error) => setMessage(e.message)),
    [projectId, quotationId],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function command(path: string, body = '{}') {
    try {
      await api(`/projects/${projectId}/quotations/${quotationId}/${path}`, {
        method: 'POST',
        body,
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function generate(format: 'PDF' | 'XLSX') {
    await command(
      'documents',
      JSON.stringify({ format, language: 'BILINGUAL' }),
    );
  }
  if (!item)
    return (
      <p role={message ? 'alert' : 'status'}>
        {message || 'Đang tải báo giá…'}
      </p>
    );
  const version = item.versions[0];
  if (!version) return <p role="alert">Báo giá không có version.</p>;
  const money = (value: string) =>
    new Intl.NumberFormat('vi-VN').format(Number(value));
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/quotations`}>Báo giá</Link> →{' '}
        {item.number}
      </p>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{item.number}</h1>
          <p>
            V{version.version} · {version.status} · {item.currency}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {version.status === 'DRAFT' && (
            <button className="primary" onClick={() => void command('submit')}>
              Gửi duyệt
            </button>
          )}
          {version.status === 'INTERNAL_REVIEW' && (
            <>
              <button
                className="primary"
                onClick={() => void command('approve')}
              >
                Duyệt
              </button>
              <button onClick={() => void command('reject')}>Từ chối</button>
            </>
          )}
          {version.status === 'APPROVED' && (
            <button
              className="primary"
              onClick={() => void command('mark-sent')}
            >
              Đánh dấu đã gửi
            </button>
          )}
          {version.status === 'SENT' && (
            <button
              className="primary"
              onClick={() => void command('mark-accepted')}
            >
              Khách hàng chấp nhận
            </button>
          )}
          {['APPROVED', 'SENT', 'REJECTED'].includes(version.status) && (
            <button onClick={() => void command('revisions')}>
              Tạo revision
            </button>
          )}
          <button onClick={() => void generate('PDF')}>Xuất PDF</button>
          <button onClick={() => void generate('XLSX')}>Xuất Excel</button>
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
              <th className="text-right">Đơn giá</th>
              <th className="text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {version.lines.map((line) => (
              <tr className="border-t" key={line.id}>
                <td className="py-3">{line.section}</td>
                <td>{line.description}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td className="text-right">{money(line.unitPrice)}</td>
                <td className="text-right">{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-right">
          <dt>Tạm tính</dt>
          <dd>{money(version.subtotal)}</dd>
          <dt>Giảm giá</dt>
          <dd>-{money(version.discount)}</dd>
          <dt>Thuế</dt>
          <dd>{money(version.tax)}</dd>
          <dt>Vận chuyển</dt>
          <dd>{money(version.shipping)}</dd>
          <dt>Lắp đặt</dt>
          <dd>{money(version.installation)}</dd>
          <dt>Bảo hành</dt>
          <dd>{money(version.warranty)}</dd>
          <dt className="font-semibold">Tổng cộng</dt>
          <dd className="font-semibold">
            {money(version.grandTotal)} {item.currency}
          </dd>
        </dl>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <article className="panel">
          <h2 className="font-semibold">Điều khoản</h2>
          <p>Thanh toán: {version.paymentTerms || '—'}</p>
          <p>Giao hàng: {version.deliveryTerms || '—'}</p>
          <p>Lắp đặt: {version.installationTerms || '—'}</p>
          <p>Bảo hành: {version.warrantyTerms || '—'}</p>
        </article>
        <article className="panel">
          <h2 className="font-semibold">Version và tài liệu</h2>
          <ul>
            {item.versions.map((v) => (
              <li key={v.id}>
                V{v.version} · {v.status} · {money(v.grandTotal)}{' '}
                {item.currency}
              </li>
            ))}
          </ul>
          {version.documents.length ? (
            <ul className="mt-3">
              {version.documents.map((document) => (
                <li key={document.id}>
                  <a
                    href={`/api/v1/projects/${projectId}/quotations/${quotationId}/documents/${document.id}/download`}
                  >
                    {document.format} · {document.language} ·{' '}
                    {new Date(document.generatedAt).toLocaleString('vi-VN')}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3">Chưa xuất tài liệu.</p>
          )}
        </article>
      </section>
    </div>
  );
}
