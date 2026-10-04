'use client';
import React, { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiUrl } from './lib/api';
import { parseUploadBytes } from './projects/[projectId]/documents/document-upload';
import { useAiSurfaces } from '../features/project-chat/project-ai-surfaces';
import { SourceDrawer } from './source-drawer';

type Attachment = {
  entityType: string;
  entityId: string;
  projectId: string | null;
};
type FileItem = {
  canDownload?: boolean;
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: string;
  category: string;
  version: number;
  createdAt: string;
  uploadedBy: { displayName: string };
  attachments: Attachment[];
};
type Page = {
  items: FileItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type Props = { entityType: string; entityId: string; permissions?: string[] };
const size = (file: FileItem) =>
  `${(parseUploadBytes(file.sizeBytes) / 1024).toFixed(1)} KB`;
const download = (file: FileItem) =>
  `${apiUrl}/files/${file.id}/download?version=${file.version}`;
function sourceHref(attachment: Attachment) {
  const base = `/projects/${attachment.projectId ?? attachment.entityId}`;
  if (attachment.entityType === 'ProjectRequiredDocument')
    return `${base}/documents/${attachment.entityId}`;
  if (attachment.entityType === 'ProjectStageOneDocument')
    return `${base}/documents`;
  if (attachment.entityType === 'ProjectProductLine')
    return `${base}/products/${attachment.entityId}`;
  if (attachment.entityType === 'Task') return `/tasks/${attachment.entityId}`;
  if (attachment.entityType === 'Project') return `${base}/overview`;
  return null;
}
export function FileTable({
  items,
  canDownload,
  onSelect,
}: {
  items: FileItem[];
  canDownload: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="file-table">
        <thead>
          <tr>
            <th>Tài liệu / phiên bản</th>
            <th>Phân loại</th>
            <th>Người tải</th>
            <th>Cập nhật</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {items.map((file) => (
            <tr key={file.id}>
              <td>
                <button
                  className="item-title"
                  onClick={() => onSelect(file.id)}
                >
                  ▤ {file.originalFilename}
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  v{file.version} · {size(file)} · {file.mimeType}
                </p>
              </td>
              <td>
                {{
                  DOCUMENT: 'Tài liệu',
                  PROJECT_DOCUMENT: 'Hồ sơ dự án',
                  CHAT: 'Tệp trao đổi',
                  FIXTURE: 'Nguồn tổng hợp kiểm thử',
                }[file.category] ?? file.category}
              </td>
              <td>{file.uploadedBy.displayName}</td>
              <td>{new Date(file.createdAt).toLocaleDateString('vi-VN')}</td>
              <td>
                <div className="flex gap-3">
                  <button onClick={() => onSelect(file.id)}>Xem nguồn</button>
                  {canDownload && <a href={download(file)}>Tải xuống</a>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntityFiles(props: Props) {
  return (
    <EntityFileList key={`${props.entityType}/${props.entityId}`} {...props} />
  );
}
function EntityFileList({ entityType, entityId, permissions }: Props) {
  const ai = useAiSurfaces();
  const [data, setData] = useState<Page>(),
    [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false),
    [revision, setRevision] = useState(0);
  const [search, setSearch] = useState(''),
    [mimeType, setMimeType] = useState(''),
    [sort, setSort] = useState('createdAt'),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState(''),
    [file, setFile] = useState<FileItem>(),
    [preview, setPreview] = useState(''),
    [previewError, setPreviewError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    uploadController = useRef<AbortController | undefined>(undefined);
  const canUpload = permissions?.includes('file.upload') ?? true,
    canDownload = permissions?.includes('file.download') ?? true;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      uploadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setData(undefined);
      setMessage('');
      const params = new URLSearchParams({
        ...(entityType === 'Project'
          ? { projectId: entityId }
          : { entityType, entityId }),
        page: String(page),
        pageSize: '20',
        sort,
        direction: sort === 'originalFilename' ? 'asc' : 'desc',
        ...(search && { search }),
        ...(mimeType && { mimeType }),
      });
      api<Page>(`/files?${params}`, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setMessage((e as Error).message);
        });
    }, 150);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [entityId, entityType, page, search, mimeType, sort, revision]);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    let version: number | undefined;
    const clearPreview = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = '';
      setPreview('');
    };
    if (!selected) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    void api<FileItem>(`/files/${selected}`, { signal: controller.signal })
      .then(async (metadata) => {
        if (controller.signal.aborted) return;
        version = metadata.version;
        setFile(metadata);
        if (!canDownload || metadata.canDownload === false) {
          setPreviewError('Bạn chưa được cấp quyền tải/preview file.');
          return;
        }
        const response = await fetch(
          `${apiUrl}/files/${selected}/preview?version=${version}`,
          {
            signal: controller.signal,
            credentials: 'include',
            cache: 'no-store',
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            category?: string;
            message?: string;
          } | null;
          throw new Error(
            body?.category === 'MISSING_BINARY'
              ? 'MISSING_BINARY — Thiếu file gốc trong kho. Hồ sơ vẫn được giữ; cần khôi phục đúng binary.'
              : (body?.message ?? 'Không thể mở file này.'),
          );
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (blob.type.split(';')[0] !== metadata.mimeType)
          throw new Error('Loại file trả về không khớp hồ sơ nguồn.');
        objectUrl = URL.createObjectURL(
          metadata.mimeType === 'text/plain'
            ? new Blob([blob], { type: 'text/plain;charset=utf-8' })
            : blob,
        );
        setPreview(objectUrl);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setPreviewError((e as Error).message);
      });
    const timer = setInterval(() => {
      if (version === undefined || document.hidden) return;
      void api<FileItem>(`/files/${selected}`, { signal: controller.signal })
        .then((current) => {
          if (
            !controller.signal.aborted &&
            (current.version !== version || current.canDownload === false)
          ) {
            controller.abort();
            clearPreview();
            setFile(undefined);
            setPreviewError(
              'Quyền tải hoặc phiên bản đã thay đổi. Đóng và chọn lại file.',
            );
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            controller.abort();
            clearPreview();
            setFile(undefined);
            setPreviewError('Không còn quyền xem nguồn.');
          }
        });
    }, 5000);
    const hide = () => {
      if (document.hidden) {
        controller.abort();
        clearPreview();
        setFile(undefined);
        setSelected('');
      }
    };
    const revoke = () => {
      controller.abort();
      clearPreview();
      setFile(undefined);
      setSelected('');
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('galaxy-auth-changed', revoke);
    return () => {
      controller.abort();
      clearInterval(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('galaxy-auth-changed', revoke);
    };
  }, [selected, canDownload]);
  function selectFile(id: string) {
    setFile(undefined);
    setPreview('');
    setPreviewError('');
    setSelected(id);
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    const form = event.currentTarget,
      body = new FormData(form);
    body.set('entityType', entityType);
    body.set('entityId', entityId);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      await api('/files', { method: 'POST', body, signal: controller.signal });
      if (alive.current) {
        form.reset();
        setPage(1);
        setRevision((n) => n + 1);
      }
    } catch (error) {
      if (alive.current) setMessage((error as Error).message);
    } finally {
      if (alive.current) setUploading(false);
    }
  }
  return (
    <section className="panel grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Hồ sơ & kiến thức</h2>
          <p className="mt-2 text-xs text-slate-500">
            File gốc và phiên bản từ hồ sơ được cấp quyền. Phê duyệt, phát hành
            và xử lý AI là các trạng thái riêng.
          </p>
        </div>
        {canUpload && (
          <details className="upload-details">
            <summary>+ Tải tài liệu lên</summary>
            <form
              className="mt-3 grid gap-3"
              onSubmit={(event) => void upload(event)}
            >
              <label>
                Danh mục
                <input name="category" required defaultValue="DOCUMENT" />
              </label>
              <label>
                Chọn tệp
                <input
                  name="file"
                  required
                  type="file"
                  accept=".pdf,.png,.jpg,.txt"
                />
              </label>
              <button className="primary" disabled={uploading}>
                {uploading ? 'Đang tải…' : 'Tải tệp'}
              </button>
            </form>
          </details>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Tìm tài liệu"
          placeholder="Tìm tên tài liệu…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Loại tài liệu"
          value={mimeType}
          onChange={(e) => {
            setMimeType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả loại file</option>
          <option value="application/pdf">PDF</option>
          <option value="text/plain">Văn bản</option>
          <option value="image/png">Ảnh PNG</option>
          <option value="image/jpeg">Ảnh JPEG</option>
        </select>
        <select
          aria-label="Sắp xếp tài liệu"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="createdAt">Mới tải lên</option>
          <option value="updatedAt">Mới cập nhật</option>
          <option value="originalFilename">Tên A → Z</option>
          <option value="sizeBytes">Dung lượng lớn nhất</option>
        </select>
      </div>
      {message ? (
        <div role="alert">
          <p>{message}</p>
          <button onClick={() => setRevision((n) => n + 1)}>Thử lại</button>
        </div>
      ) : !data ? (
        <p role="status">Đang tải tệp…</p>
      ) : data.items.length ? (
        <FileTable
          items={data.items}
          canDownload={canDownload}
          onSelect={selectFile}
        />
      ) : (
        <p className="empty-state">
          Chưa có tài liệu phù hợp trong phạm vi này.
        </p>
      )}
      <footer className="flex flex-wrap justify-between gap-3 text-sm">
        <span>
          {data ? `${data.total} tài liệu phù hợp` : 'Đang tải số lượng'}
        </span>
        <div className="flex items-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </button>
          <span>
            {page}/{data?.totalPages || 1}
          </span>
          <button
            disabled={!data || page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </button>
        </div>
      </footer>
      <SourceDrawer
        dialogRef={dialog}
        title="Nguồn tài liệu"
        onClose={() => selectFile('')}
      >
        {file && (
          <div className="grid gap-4">
            <h3 className="break-words text-xl font-semibold">
              {file.originalFilename}
            </h3>
            <p>
              Phiên bản tài sản v{file.version} · {size(file)} ·{' '}
              {file.uploadedBy.displayName}
            </p>
            <div className="source-state-note">
              <strong>Trạng thái nguồn</strong>
              <p>
                Phiên bản tài sản không thay cho quyết định phê duyệt. Xem hồ sơ
                gốc để kiểm tra trạng thái nghiệp vụ và lịch sử.
              </p>
              <p>
                Phát hành và khả năng AI được kiểm tra theo phòng, nguồn và nhà
                cung cấp đã chọn.
              </p>
              <p>
                AI tra cứu các nguồn đã gửi vào phòng trao đổi hoặc phát hành
                theo quyền. File vừa tải lên cần được liên kết vào nguồn phù
                hợp.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {canDownload && file.canDownload !== false && (
                <a href={download(file)}>Tải đúng phiên bản</a>
              )}
              {entityType === 'Project' && (
                <button
                  onClick={() => {
                    dialog.current?.close();
                    ai?.open({
                      projectId: entityId,
                      scope: 'ALL',
                      context: {
                        fileAssetId: file.id,
                        fileVersion: file.version,
                      },
                    });
                  }}
                >
                  Hỏi AI về nguồn →
                </button>
              )}
            </div>
            {file.attachments.map((a) => {
              const href = sourceHref(a);
              return href ? (
                <Link key={`${a.entityType}/${a.entityId}`} href={href}>
                  {a.entityType === 'ProjectRequiredDocument' ||
                  a.entityType === 'ProjectStageOneDocument'
                    ? 'Mở hồ sơ gốc & lịch sử phiên bản'
                    : 'Mở hồ sơ liên quan'}{' '}
                  →
                </Link>
              ) : null;
            })}
          </div>
        )}
        {previewError && (
          <p role="alert" className="my-4">
            {previewError}
          </p>
        )}
        {preview && file && (
          <iframe
            title={`Xem ${file.originalFilename} — v${file.version}`}
            src={preview}
            className="file-preview"
            // Chrome vô hiệu trình đọc PDF trong sandbox; API đã kiểm MIME/signature.
            sandbox={file.mimeType === 'application/pdf' ? undefined : ''}
          />
        )}
        {!file && !previewError && (
          <p role="status">Đang kiểm tra quyền và phiên bản…</p>
        )}
      </SourceDrawer>
    </section>
  );
}
