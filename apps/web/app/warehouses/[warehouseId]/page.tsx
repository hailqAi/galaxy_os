'use client';
import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
type Warehouse = {
  code: string;
  name: string;
  type: string;
  activeStatus: string;
  zones: { id: string; code: string; name: string }[];
  locations: { id: string; code: string; name: string; locationType: string }[];
};
export default function WarehouseDetail({
  params,
}: {
  params: Promise<{ warehouseId: string }>;
}) {
  const { warehouseId } = use(params);
  const [item, setItem] = useState<Warehouse>();
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Warehouse>(`/warehouses/${warehouseId}`)
        .then(setItem)
        .catch((cause: Error) => setError(cause.message)),
    [warehouseId],
  );
  useEffect(() => void load(), [load]);
  async function add(event: FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/warehouses/${warehouseId}/${path}`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return <p role={error ? 'alert' : undefined}>{error || 'Đang tải kho…'}</p>;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">
        {item.code} · {item.name}
      </h1>
      {error && <p role="alert">{error}</p>}
      <section className="panel">
        <p>
          {item.type} · {item.activeStatus}
        </p>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Khu vực</h2>
        {item.zones.map((x) => (
          <p key={x.id}>
            {x.code} · {x.name}
          </p>
        ))}
        <form
          className="mt-3 flex gap-3"
          onSubmit={(event) => add(event, 'zones')}
        >
          <input name="code" placeholder="Mã khu" required />
          <input name="name" placeholder="Tên khu" required />
          <button className="primary rounded px-3 py-2">Thêm khu</button>
        </form>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Vị trí lưu</h2>
        {item.locations.map((x) => (
          <p key={x.id}>
            {x.code} · {x.name} · {x.locationType}
          </p>
        ))}
        <form
          className="mt-3 flex flex-wrap gap-3"
          onSubmit={(event) => add(event, 'locations')}
        >
          <input name="code" placeholder="Mã vị trí" required />
          <input name="name" placeholder="Tên vị trí" required />
          <select name="locationType">
            <option>AISLE</option>
            <option>RACK</option>
            <option>BIN</option>
            <option>STAGING</option>
            <option>QUARANTINE</option>
          </select>
          <button className="primary rounded px-3 py-2">Thêm vị trí</button>
        </form>
      </section>
    </div>
  );
}
