'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, apiUrl } from '../lib/api';
type FileItem = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  version: number;
  createdAt: string;
  attachments: {
    entityType: string;
    entityId: string;
    projectId: string | null;
  }[];
  uploadedBy: { displayName: string };
};
type Page = {
  items: FileItem[];
  page: number;
  totalPages: number;
  total: number;
};
export default function FilesPage() {
  const [data, setData] = useState<Page>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<Page>(
        `/files?${new URLSearchParams({ page: String(page), pageSize: '20', ...(search && { search }), ...(category && { category }) })}`,
      )
        .then(setData)
        .catch((error: Error) => setMessage(error.message)),
    [category, page, search],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function remove(id: string) {
    try {
      await api(`/files/${id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function update(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    try {
      await api(`/files/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Tệp tin</p>
      <header>
        <h1 className="text-2xl font-semibold">Tệp tin</h1>
        <p className="text-sm text-black/60">
          Thư viện tệp nghiệp vụ được phân quyền
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel">
          <p>Tổng tệp</p>
          <strong className="text-2xl">{data?.total ?? 0}</strong>
        </div>
        <div className="panel">
          <p>Tài liệu</p>
          <strong className="text-2xl">
            {data?.items.filter((file) => file.category === 'DOCUMENT')
              .length ?? 0}
          </strong>
        </div>
        <div className="panel">
          <p>Hình ảnh</p>
          <strong className="text-2xl">
            {data?.items.filter((file) => file.mimeType.startsWith('image/'))
              .length ?? 0}
          </strong>
        </div>
      </section>
      <section className="panel grid gap-4">
        <div className="flex gap-3">
          <input
            aria-label="Tìm tệp"
            placeholder="Tìm tên tệp…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <input
            aria-label="Danh mục"
            placeholder="Danh mục"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        {message && <p role="alert">{message}</p>}
        {!data ? (
          <p role="status">Đang tải thư viện…</p>
        ) : !data.items.length ? (
          <p>Chưa có tệp phù hợp.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tên tệp</th>
                <th>Loại</th>
                <th>Danh mục</th>
                <th>Đối tượng</th>
                <th>Người tải</th>
                <th>Kích thước</th>
                <th>Phiên bản</th>
                <th>Ngày tải</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((file) => (
                <tr key={file.id}>
                  <td>{file.originalFilename}</td>
                  <td>{file.mimeType}</td>
                  <td>
                    <form
                      className="flex gap-1"
                      onSubmit={(event) => void update(event, file.id)}
                    >
                      <input
                        className="w-28"
                        name="category"
                        defaultValue={file.category}
                      />
                      <button>Lưu</button>
                    </form>
                  </td>
                  <td>
                    {file.attachments.map((item) => item.entityType).join(', ')}
                  </td>
                  <td>{file.uploadedBy.displayName}</td>
                  <td>{(file.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td>{file.version}</td>
                  <td>
                    {new Date(file.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <a href={`${apiUrl}/files/${file.id}/download`}>Tải</a>
                      <button onClick={() => void remove(file.id)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-end gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span>
            {page}/{data?.totalPages || 1}
          </span>
          <button
            disabled={!data || page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      </section>
    </div>
  );
}
