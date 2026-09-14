'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Revision = {
  product: { name: string; brand: { name: string } } | null;
  variant: { name: string } | null;
  supplier: { legalName: string } | null;
  customProductName: string | null;
  material: string | null;
  finish: string | null;
  quantity: string;
  unit: string;
  customerApprovalStatus: string;
  technicalApprovalStatus: string;
  commercialApprovalStatus: string;
};
type Line = {
  id: string;
  code: string;
  positionName: string | null;
  lifecycleStatus: string;
  blocker: string | null;
  location: { name: string } | null;
  revisions: Revision[];
};
type Page = {
  items: Line[];
  total: number;
  page: number;
  totalPages: number;
};

export default function ProjectProductsPage() {
  const projectId = String(useParams().projectId);
  const query = useSearchParams();
  const [data, setData] = useState<Page>();
  const [search, setSearch] = useState(query.get('search') ?? '');
  const [approvalStatus, setApproval] = useState(
    query.get('approvalStatus') ?? '',
  );
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '20',
      ...(search && { search }),
      ...(approvalStatus && { approvalStatus }),
    });
    history.replaceState(null, '', `?${params}`);
    try {
      setData(await api<Page>(`/projects/${projectId}/products?${params}`));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [approvalStatus, projectId, search]);
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load]);
  return (
    <div className="grid gap-5">
      <p>
        <Link href={`/projects/${projectId}`}>Không gian dự án</Link> → Giai
        đoạn 2 → Sản phẩm nội thất
      </p>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sản phẩm nội thất</h1>
          <p>Product Register theo cấu hình và phiên bản của dự án.</p>
        </div>
        <Link
          className="primary rounded px-4 py-2"
          href={`/projects/${projectId}/products/new`}
        >
          Tạo dòng sản phẩm
        </Link>
      </header>
      <section className="panel grid gap-4">
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Tìm sản phẩm dự án"
            placeholder="Mã hoặc tên sản phẩm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Trạng thái phê duyệt"
            value={approvalStatus}
            onChange={(event) => setApproval(event.target.value)}
          >
            <option value="">Tất cả phê duyệt</option>
            {['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
        {message && <p role="alert">{message}</p>}
        {!data ? (
          <p role="status">Đang tải Product Register…</p>
        ) : data.items.length === 0 ? (
          <p>Chưa có dòng sản phẩm trong dự án.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Khu vực/phòng</th>
                  <th>Vị trí</th>
                  <th>Brand / sản phẩm</th>
                  <th>Material / finish</th>
                  <th>Số lượng</th>
                  <th>Khách hàng</th>
                  <th>Kỹ thuật</th>
                  <th>Thương mại</th>
                  <th>Lifecycle</th>
                  <th>Blocker</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((line) => {
                  const revision = line.revisions[0];
                  if (!revision) return null;
                  return (
                    <tr key={line.id}>
                      <td>
                        <Link
                          className="underline"
                          href={`/projects/${projectId}/products/${line.id}`}
                        >
                          {line.code}
                        </Link>
                      </td>
                      <td>{line.location?.name ?? '—'}</td>
                      <td>{line.positionName ?? '—'}</td>
                      <td>
                        {revision.product
                          ? `${revision.product.brand.name} · ${revision.product.name}${revision.variant ? ` · ${revision.variant.name}` : ''}`
                          : revision.customProductName}
                      </td>
                      <td>
                        {[revision.material, revision.finish]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                      <td>
                        {revision.quantity} {revision.unit}
                      </td>
                      <td>{revision.customerApprovalStatus}</td>
                      <td>{revision.technicalApprovalStatus}</td>
                      <td>{revision.commercialApprovalStatus}</td>
                      <td>{line.lifecycleStatus}</td>
                      <td>{line.blocker ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
