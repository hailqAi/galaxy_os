'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

type Product = {
  id: string;
  name: string;
  productCode: string;
  brand: { name: string };
  variants: { id: string; name: string }[];
};
type Location = { id: string; name: string; type: string };
type Supplier = { id: string; legalName: string };
type Page<T> = { items: T[] };

export function ProductForm({
  projectId,
  lineId,
  initial,
}: {
  projectId: string;
  lineId?: string;
  initial?: Record<string, string | null>;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [custom, setCustom] = useState(Boolean(initial?.customProductName));
  const [productId, setProductId] = useState(initial?.productId ?? '');
  const [message, setMessage] = useState('');
  useEffect(() => {
    void Promise.all([
      api<Page<Product>>('/products?pageSize=100'),
      api<Location[]>(`/projects/${projectId}/locations`),
      api<Page<Supplier>>('/suppliers?pageSize=100'),
    ])
      .then(([catalog, projectLocations, supplierPage]) => {
        setProducts(catalog.items);
        setLocations(projectLocations);
        setSuppliers(supplierPage.items);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [projectId]);
  const selected = products.find((product) => product.id === productId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const file = values.file as File;
    delete values.file;
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ''),
    );
    for (const key of [
      'quantity',
      'width',
      'depth',
      'height',
      'length',
      'diameter',
    ])
      if (body[key] !== undefined) body[key] = Number(body[key]);
    if (custom) delete body.productId;
    else delete body.customProductName;
    try {
      const line = await api<{ id: string }>(
        `/projects/${projectId}/products${lineId ? `/${lineId}` : ''}`,
        { method: lineId ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      if (file?.size) {
        const upload = new FormData();
        upload.set('file', file);
        upload.set('entityType', 'ProjectProductLine');
        upload.set('entityId', line.id);
        upload.set('category', 'TECHNICAL_DRAWING');
        await api('/files', { method: 'POST', body: upload });
      }
      router.push(`/projects/${projectId}/products/${line.id}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
      {message && <p role="alert">{message}</p>}
      <section className="panel grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-semibold">1. Vị trí dự án</h2>
        <label>
          Khu vực/phòng
          <select
            name="locationId"
            required
            defaultValue={initial?.locationId ?? ''}
          >
            <option value="">Chọn vị trí</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.type} · {location.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vị trí cụ thể
          <input
            name="positionName"
            required
            defaultValue={initial?.positionName ?? ''}
          />
        </label>
      </section>
      <section className="panel grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-semibold">2. Sản phẩm</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={custom}
            onChange={(event) => setCustom(event.target.checked)}
          />{' '}
          Sản phẩm tùy chỉnh
        </label>
        {custom ? (
          <label>
            Tên sản phẩm tùy chỉnh
            <input
              name="customProductName"
              required
              defaultValue={initial?.customProductName ?? ''}
            />
          </label>
        ) : (
          <>
            <label>
              Product Master
              <select
                name="productId"
                required
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">Chọn sản phẩm</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.brand.name} · {product.productCode} ·{' '}
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Variant
              <select name="variantId" defaultValue={initial?.variantId ?? ''}>
                <option value="">Không chọn</option>
                {selected?.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="sm:col-span-2">
          Mô tả
          <textarea
            name="customDescription"
            defaultValue={initial?.customDescription ?? ''}
          />
        </label>
      </section>
      <section className="panel grid gap-3 sm:grid-cols-3">
        <h2 className="sm:col-span-3 font-semibold">3. Cấu hình</h2>
        {['material', 'finish', 'color', 'countryOfOrigin', 'factoryName'].map(
          (name) => (
            <label key={name}>
              {name}
              <input name={name} defaultValue={initial?.[name] ?? ''} />
            </label>
          ),
        )}
      </section>
      <section className="panel grid gap-3 sm:grid-cols-3">
        <h2 className="sm:col-span-3 font-semibold">4. Kích thước</h2>
        {['width', 'depth', 'height', 'length', 'diameter'].map((name) => (
          <label key={name}>
            {name}
            <input
              min="0"
              step="0.001"
              type="number"
              name={name}
              defaultValue={initial?.[name] ?? ''}
            />
          </label>
        ))}
        <label>
          Đơn vị kích thước
          <input
            name="dimensionUnit"
            defaultValue={initial?.dimensionUnit ?? 'mm'}
          />
        </label>
      </section>
      <section className="panel grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-semibold">
          5–7. Khối lượng, nhà cung cấp & tài liệu
        </h2>
        <label>
          Số lượng
          <input
            name="quantity"
            required
            min="0.001"
            step="0.001"
            type="number"
            defaultValue={initial?.quantity ?? '1'}
          />
        </label>
        <label>
          Đơn vị
          <input name="unit" required defaultValue={initial?.unit ?? 'cái'} />
        </label>
        <label>
          Nhà cung cấp
          <select name="supplierId" defaultValue={initial?.supplierId ?? ''}>
            <option value="">Chưa chọn</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.legalName}
              </option>
            ))}
          </select>
        </label>
        {!lineId && (
          <label>
            Tài liệu kỹ thuật
            <input name="file" type="file" accept=".pdf,.png,.jpg,.txt" />
          </label>
        )}
      </section>
      <input
        name="code"
        required
        defaultValue={initial?.code ?? ''}
        placeholder="Mã dòng sản phẩm"
      />
      <button className="primary">Lưu nháp</button>
    </form>
  );
}
