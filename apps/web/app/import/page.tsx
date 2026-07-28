'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '../lib/api';

type Row = {
  id: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  status: string;
};
type Job = {
  id: string;
  entityType: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  rows: Row[];
};
const fields: Record<string, string[]> = {
  Customer: ['displayName', 'type', 'email', 'phone'],
  Contact: ['customerId', 'firstName', 'lastName', 'email', 'phone'],
  Lead: ['name', 'companyName', 'email', 'phone'],
  Project: ['code', 'name', 'customerId'],
};

export default function ImportPage() {
  const [job, setJob] = useState<Job>();
  const [message, setMessage] = useState('');
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    try {
      setJob(
        await api<Job>('/imports', {
          method: 'POST',
          body: new FormData(event.currentTarget),
        }),
      );
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }
  async function mapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job) return;
    const values = new FormData(event.currentTarget);
    const map = Object.fromEntries(
      [...values.entries()].map(([column, value]) => [column, String(value)]),
    );
    try {
      await api(`/imports/${job.id}/mapping`, {
        method: 'POST',
        body: JSON.stringify({ mapping: map }),
      });
      const validated = await api<Job>(`/imports/${job.id}/validate`, {
        method: 'POST',
      });
      setJob(validated);
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }
  async function confirm() {
    if (!job) return;
    try {
      setJob(await api<Job>(`/imports/${job.id}/confirm`, { method: 'POST' }));
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }
  const headers = job?.rows[0] ? Object.keys(job.rows[0].rawData) : [];
  return (
    <div className="grid gap-5">
      <p className="text-sm">Trang chủ / Nhập dữ liệu</p>
      <header>
        <h1 className="text-2xl font-semibold">Nhập dữ liệu Excel</h1>
        <p className="text-sm text-black/60">
          Upload, mapping, validation, preview rồi mới xác nhận nhập
        </p>
      </header>
      {!job && (
        <form className="panel grid gap-3" onSubmit={upload}>
          <label>
            Loại dữ liệu
            <select name="entityType">
              {Object.keys(fields).map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Tệp Excel (.xlsx, tối đa 5 MB)
            <input accept=".xlsx" name="file" required type="file" />
          </label>
          <button className="primary">Đọc tệp</button>
        </form>
      )}
      {job && job.status === 'UPLOADED' && (
        <form className="panel grid gap-3" onSubmit={mapping}>
          <h2 className="font-semibold">Mapping cột</h2>
          {headers.map((header) => (
            <label key={header}>
              {header}
              <select name={header} defaultValue="">
                <option value="">Bỏ qua</option>
                {fields[job.entityType]?.map((field) => (
                  <option key={field}>{field}</option>
                ))}
              </select>
            </label>
          ))}
          <button className="primary">Kiểm tra dữ liệu</button>
        </form>
      )}
      {job && ['VALIDATED', 'COMPLETED'].includes(job.status) && (
        <section className="panel grid gap-3">
          <h2 className="font-semibold">Kết quả kiểm tra</h2>
          <p>
            {job.totalRows} dòng · {job.validRows} hợp lệ · {job.invalidRows}{' '}
            lỗi · {job.importedRows} đã nhập
          </p>
          {job.status === 'VALIDATED' && (
            <button className="primary" onClick={() => void confirm()}>
              Xác nhận nhập
            </button>
          )}
          {job.invalidRows > 0 && (
            <Link href={`/api/v1/imports/${job.id}/errors`}>
              Xem báo cáo lỗi
            </Link>
          )}
        </section>
      )}
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
