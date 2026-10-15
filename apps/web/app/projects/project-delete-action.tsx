'use client';

import React, { FormEvent, useState } from 'react';
import { api } from '../lib/api';

export function ProjectDeleteAction({
  onDeleted,
  project,
}: {
  onDeleted?: () => void | Promise<void>;
  project: { id: string; code: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const valid = code === project.code && Boolean(reason.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError('');
    try {
      await api(`/projects/${project.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ code, reason: reason.trim() }),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Không thể xóa dự án.',
      );
      setPending(false);
      return;
    }
    setOpen(false);
    if (!onDeleted) return globalThis.location.assign('/projects');
    try {
      await onDeleted();
    } catch {
      globalThis.location.assign('/projects');
    }
  }

  return (
    <>
      <button
        className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
        onClick={() => {
          setCode('');
          setReason('');
          setError('');
          setOpen(true);
        }}
        type="button"
      >
        Xóa dự án
      </button>
      {open && (
        <dialog
          aria-labelledby={`delete-project-${project.id}`}
          className="fixed inset-0 z-50 m-auto grid w-[min(34rem,calc(100%-2rem))] gap-4 rounded-xl border bg-white p-5 shadow-xl backdrop:bg-black/30"
          open
        >
          <h2 className="text-lg font-bold" id={`delete-project-${project.id}`}>
            Xóa dự án
          </h2>
          <p>
            <strong>{project.code}</strong> · {project.name}
          </p>
          <p className="text-sm text-slate-700">
            Dự án sẽ được đánh dấu “Đã xóa” và không còn trong danh sách hoặc
            không gian làm việc. Dữ liệu lịch sử và chứng từ không bị hủy vật
            lý.
          </p>
          <form className="grid gap-3" onSubmit={submit}>
            <label className="grid gap-1 text-sm font-semibold">
              Nhập lại mã dự án
              <input
                autoComplete="off"
                disabled={pending}
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Lý do xóa
              <textarea
                disabled={pending}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
              >
                Hủy
              </button>
              <button
                className="rounded bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
                disabled={!valid || pending}
                type="submit"
              >
                {pending ? 'Đang xóa...' : 'Xóa dự án'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
