'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Brand = {
  id: string;
  name: string;
  country: string | null;
  defaultCurrency: string;
};
type Product = {
  id: string;
  productCode: string;
  name: string;
  unit: string;
  brand: { name: string };
};
type Page<T> = { items: T[]; total: number };

export default function CatalogPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      Promise.all([
        api<Page<Brand>>('/brands?pageSize=100'),
        api<Page<Product>>('/products?pageSize=100'),
      ])
        .then(([b, p]) => {
          setBrands(b.items);
          setProducts(p.items);
        })
        .catch((error: Error) => setMessage(error.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function createBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await api('/brands', { method: 'POST', body: JSON.stringify(values) });
    event.currentTarget.reset();
    await load();
  }
  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        ...values,
        installationRequired: values.installationRequired === 'on',
        serialTrackingRequired: values.serialTrackingRequired === 'on',
        lotTrackingRequired: values.lotTrackingRequired === 'on',
      }),
    });
    event.currentTarget.reset();
    await load();
  }
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm text-black/55">Dữ liệu dùng chung</p>
        <h1 className="text-2xl font-semibold">Sản phẩm & Thương hiệu</h1>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="panel">
          <h2 className="font-semibold">Thương hiệu</h2>
          <form
            className="my-4 grid gap-2 sm:grid-cols-2"
            onSubmit={(e) => void createBrand(e)}
          >
            <input name="name" placeholder="Tên thương hiệu" required />
            <input name="country" placeholder="Quốc gia" />
            <input
              name="defaultCurrency"
              defaultValue="EUR"
              maxLength={3}
              required
            />
            <button className="primary">Thêm thương hiệu</button>
          </form>
          <ul className="divide-y">
            {brands.map((b) => (
              <li className="py-2" key={b.id}>
                <strong>{b.name}</strong> · {b.country ?? '—'} ·{' '}
                {b.defaultCurrency}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2 className="font-semibold">Sản phẩm</h2>
          {brands.length ? (
            <form
              className="my-4 grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => void createProduct(e)}
            >
              <select name="brandId" required>
                <option value="">Chọn thương hiệu</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input name="productCode" placeholder="Mã sản phẩm" required />
              <input name="name" placeholder="Tên sản phẩm" required />
              <input
                name="unit"
                placeholder="Đơn vị"
                defaultValue="cái"
                required
              />
              <label>
                <input type="checkbox" name="installationRequired" /> Cần lắp
                đặt
              </label>
              <label>
                <input type="checkbox" name="serialTrackingRequired" /> Theo dõi
                serial
              </label>
              <input type="hidden" name="lotTrackingRequired" value="" />
              <button className="primary">Thêm sản phẩm</button>
            </form>
          ) : (
            <p className="my-4">Tạo thương hiệu trước khi thêm sản phẩm.</p>
          )}
          <ul className="divide-y">
            {products.map((p) => (
              <li className="py-2" key={p.id}>
                <strong>{p.productCode}</strong> · {p.name}
                <br />
                <small>
                  {p.brand.name} · {p.unit}
                </small>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
