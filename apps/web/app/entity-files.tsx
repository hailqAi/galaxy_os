'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, apiUrl } from './lib/api';
type FileItem = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  version: number;
  createdAt: string;
  uploadedBy: { displayName: string };
};
type Page = {
  items: FileItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
export function EntityFiles({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [data, setData] = useState<Page>();
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const load = useCallback(
    () =>
      api<Page>(
        `/files?entityType=${entityType}&entityId=${entityId}&pageSize=50`,
      )
        .then(setData)
        .catch((error: Error) => setMessage(error.message)),
    [entityId, entityType],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set('entityType', entityType);
    body.set('entityId', entityId);
    try {
      await api('/files', { method: 'POST', body });
      form.reset();
      await load();
      setMessage('Đã tải tệp.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="panel grid gap-4">
      <h2 className="font-semibold">Tệp tin</h2>
      {message && <p role="status">{message}</p>}
      {!data ? (
        <p>Đang tải tệp…</p>
      ) : data.items.length ? (
        <ul className="divide-y">
          {data.items.map((file) => (
            <li
              className="flex items-center justify-between gap-3 py-3"
              key={file.id}
            >
              <span>
                <strong>{file.originalFilename}</strong>
                <br />
                <small>
                  {file.category} · {(file.sizeBytes / 1024).toFixed(1)} KB · v
                  {file.version}
                </small>
              </span>
              <a
                className="rounded border px-3 py-2"
                href={`${apiUrl}/files/${file.id}/download`}
              >
                Tải xuống
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>Chưa có tệp đính kèm.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
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
    </section>
  );
}
