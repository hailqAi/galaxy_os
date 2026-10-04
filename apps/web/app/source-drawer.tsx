'use client';
import React, { RefObject } from 'react';

/** Khung viewer P06 dùng chung; caller giữ kiểm quyền, version và nội dung nguồn. */
export function SourceDrawer({
  dialogRef,
  title,
  closeLabel = 'Đóng',
  className = 'file-source-drawer',
  onClose,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  closeLabel?: string;
  className?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className={`source-drawer ${className}`}
      onCancel={(event) => event.stopPropagation()}
      onClose={onClose}
    >
      <header>
        <h2 className="font-semibold">{title}</h2>
        <button onClick={() => dialogRef.current?.close()}>{closeLabel}</button>
      </header>
      {children}
    </dialog>
  );
}
