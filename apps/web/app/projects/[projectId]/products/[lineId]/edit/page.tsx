'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../../lib/api';
import { ProductForm } from '../../product-form';

type Line = {
  code: string;
  positionName: string | null;
  locationId: string | null;
  currentRevision: number;
  revisions: Record<string, unknown>[];
};

export default function EditProjectProductPage() {
  const { projectId, lineId } = useParams<{
    projectId: string;
    lineId: string;
  }>();
  const [line, setLine] = useState<Line>();
  const [message, setMessage] = useState('');
  useEffect(() => {
    void api<Line>(`/projects/${projectId}/products/${lineId}`)
      .then(setLine)
      .catch((error: Error) => setMessage(error.message));
  }, [lineId, projectId]);
  if (message) return <p role="alert">{message}</p>;
  if (!line) return <p role="status">Đang tải biểu mẫu…</p>;
  const revision = line.revisions.find(
    (item) => item.revision === line.currentRevision,
  )!;
  const initial = Object.fromEntries(
    Object.entries({
      ...revision,
      code: line.code,
      locationId: line.locationId,
      positionName: line.positionName,
    }).map(([key, value]) => [key, value == null ? null : String(value)]),
  );
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold">Chỉnh sửa dòng sản phẩm</h1>
      <ProductForm projectId={projectId} lineId={lineId} initial={initial} />
    </div>
  );
}
