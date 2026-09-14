'use client';

import { useParams } from 'next/navigation';
import { ProductForm } from '../product-form';

export default function NewProjectProductPage() {
  const projectId = String(useParams().projectId);
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold">Tạo dòng sản phẩm</h1>
      <ProductForm projectId={projectId} />
    </div>
  );
}
