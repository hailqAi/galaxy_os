'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import {
  legacyProjectDocumentDestination,
  projectRequiredDocumentLookupPath,
} from '../project-stage-access';
import { documentPresentationLabel, documentStatusClass } from './document-ui';

type Document = {
  id: string;
  documentName: string;
  documentType: string;
  stageKey: string;
  workstreamKey: string;
  required: boolean;
  status: string;
  currentVersion: number;
  dueDate: string | null;
  updatedAt: string;
  owner: { displayName: string } | null;
  currentFile: { originalFilename: string } | null;
};
type Page = {
  items: Document[];
  page: number;
  totalPages: number;
  total: number;
};

export const resolvedProjectDocumentDestination = (
  projectId: string,
  document: Pick<Document, 'id' | 'stageKey' | 'workstreamKey'>,
) =>
  legacyProjectDocumentDestination(
    projectId,
    document.stageKey,
    document.id,
    document.workstreamKey,
  );

export default function ProjectDocumentsPage() {
  const projectId = String(useParams().projectId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyRequirementId = searchParams.get('requirementId');
  const legacyWorkstreamKey = searchParams.get('workstreamKey');
  const unresolvedLegacyRequirement =
    Boolean(legacyRequirementId) && !legacyWorkstreamKey;
  const legacyDestination = legacyProjectDocumentDestination(
    projectId,
    searchParams.get('stageKey'),
    legacyRequirementId,
    legacyWorkstreamKey,
  );
  const [data, setData] = useState<Page>();
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    search: searchParams.get('search') ?? '',
    stageKey: searchParams.get('stageKey') ?? '',
    workstreamKey: searchParams.get('workstreamKey') ?? '',
    status: searchParams.get('status') ?? '',
    page: searchParams.get('page') ?? '1',
  });
  const load = useCallback(async () => {
    if (legacyDestination && !unresolvedLegacyRequirement) return;
    const query = new URLSearchParams({
      pageSize: '20',
      ...Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value),
      ),
    });
    if (!unresolvedLegacyRequirement)
      history.replaceState(null, '', `?${query}`);
    try {
      const documents = await api<Page>(
        unresolvedLegacyRequirement
          ? projectRequiredDocumentLookupPath(
              projectId,
              legacyRequirementId!,
              searchParams.get('stageKey'),
            )
          : `/projects/${projectId}/required-documents?${query}`,
      );
      if (unresolvedLegacyRequirement) {
        const document = documents.items.find(
          ({ id }) => id === legacyRequirementId,
        );
        if (!document) {
          setMessage('Không tìm thấy hồ sơ cần mở.');
          return;
        }
        router.replace(
          resolvedProjectDocumentDestination(projectId, document)!,
        );
        return;
      }
      setData(documents);
      setMessage('');
    } catch {
      setData(undefined);
      setMessage('Không thể tải kho hồ sơ. Hãy kiểm tra quyền truy cập.');
    }
  }, [
    filters,
    legacyDestination,
    legacyRequirementId,
    projectId,
    router,
    searchParams,
    unresolvedLegacyRequirement,
  ]);
  useEffect(() => {
    if (legacyDestination && !unresolvedLegacyRequirement)
      router.replace(legacyDestination);
  }, [legacyDestination, router, unresolvedLegacyRequirement]);
  // Fetching is the external synchronization performed by this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void load(), [load]);

  if (legacyDestination || unresolvedLegacyRequirement)
    return <p role="status">Đang mở ma trận hồ sơ của giai đoạn…</p>;

  return (
    <div className="grid gap-5">
      <header className="panel flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-blue-700">Kho lưu trữ · Chỉ đọc</p>
          <h1 className="text-2xl font-semibold">KHO LƯU TRỮ HỒ SƠ DỰ ÁN</h1>
          <p className="text-slate-600">
            Tra cứu hồ sơ cũ; hoàn tất hồ sơ theo từng giai đoạn trong không
            gian dự án.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded border px-3 py-2"
            href={`/projects/${projectId}/files`}
          >
            Mở tệp dự án
          </Link>
          <Link
            className="primary"
            href={`/projects/${projectId}/stage-1?step=1#step-documents`}
          >
            Mở hồ sơ GĐ 1
          </Link>
        </div>
      </header>
      <section className="panel grid gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            aria-label="Tìm hồ sơ"
            placeholder="Tìm tên hồ sơ"
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value, page: '1' })
            }
          />
          <select
            aria-label="Lọc giai đoạn"
            value={filters.stageKey}
            onChange={(event) =>
              setFilters({
                ...filters,
                stageKey: event.target.value,
                page: '1',
              })
            }
          >
            <option value="">Tất cả giai đoạn</option>
            <option value="STAGE_1">GĐ 1</option>
            <option value="STAGE_2">GĐ 2</option>
          </select>
          <input
            aria-label="Lọc bước thực hiện"
            placeholder="Bước thực hiện"
            value={filters.workstreamKey}
            onChange={(event) =>
              setFilters({
                ...filters,
                workstreamKey: event.target.value,
                page: '1',
              })
            }
          />
          <select
            aria-label="Lọc trạng thái"
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value, page: '1' })
            }
          >
            <option value="">Tất cả trạng thái</option>
            {[
              'MISSING',
              'DRAFT',
              'PENDING_REVIEW',
              'APPROVED',
              'REJECTED',
              'SUPERSEDED',
              'NOT_APPLICABLE',
            ].map((status) => (
              <option key={status} value={status}>
                {documentPresentationLabel('status', status)}
              </option>
            ))}
          </select>
        </div>
        {message ? (
          <p role="alert">{message}</p>
        ) : !data ? (
          <p role="status">Đang tải kho hồ sơ…</p>
        ) : !data.items.length ? (
          <p>Chưa có yêu cầu hồ sơ phù hợp.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tên hồ sơ</th>
                  <th>Loại</th>
                  <th>Giai đoạn</th>
                  <th>Bước thực hiện</th>
                  <th>Bắt buộc</th>
                  <th>Trạng thái</th>
                  <th>Phiên bản</th>
                  <th>Phụ trách</th>
                  <th>Đến hạn</th>
                  <th>Tệp hiện hành</th>
                  <th>Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr
                    className={
                      item.required && item.status === 'MISSING'
                        ? 'bg-amber-50'
                        : ''
                    }
                    key={item.id}
                  >
                    <td>
                      <Link
                        className="font-medium text-blue-700 underline"
                        href={
                          legacyProjectDocumentDestination(
                            projectId,
                            item.stageKey,
                            item.id,
                            item.workstreamKey,
                          ) ?? `/projects/${projectId}/documents/${item.id}`
                        }
                      >
                        {item.documentName}
                      </Link>
                    </td>
                    <td>
                      {documentPresentationLabel('document', item.documentType)}
                    </td>
                    <td>{documentPresentationLabel('stage', item.stageKey)}</td>
                    <td>
                      {documentPresentationLabel('step', item.workstreamKey)}
                    </td>
                    <td>{item.required ? 'Có' : 'Không'}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${documentStatusClass(item.status)}`}
                      >
                        {documentPresentationLabel('status', item.status)}
                      </span>
                    </td>
                    <td>v{item.currentVersion}</td>
                    <td>{item.owner?.displayName ?? '—'}</td>
                    <td>
                      {item.dueDate
                        ? new Date(item.dueDate).toLocaleDateString('vi-VN')
                        : '—'}
                    </td>
                    <td>{item.currentFile?.originalFilename ?? 'Thiếu tệp'}</td>
                    <td>{new Date(item.updatedAt).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <button
              disabled={data.page <= 1}
              onClick={() =>
                setFilters({ ...filters, page: String(data.page - 1) })
              }
            >
              Trang trước
            </button>
            <span>
              {data.page}/{data.totalPages}
            </span>
            <button
              disabled={data.page >= data.totalPages}
              onClick={() =>
                setFilters({ ...filters, page: String(data.page + 1) })
              }
            >
              Trang sau
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
