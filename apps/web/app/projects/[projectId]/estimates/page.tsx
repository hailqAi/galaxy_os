'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Estimate = {
  id: string;
  number: string;
  title: string;
  currentVersion: number;
  status: string;
  updatedAt: string;
};

const text = (value: FormDataEntryValue | undefined) => String(value ?? '');
const present = (value: FormDataEntryValue | undefined) => {
  const result = text(value).trim();
  return result || undefined;
};

export function estimateCreatePayload(
  value: Record<string, FormDataEntryValue | undefined>,
) {
  const priceStatus = text(value.priceStatus) || 'MISSING';
  const netPurchasePrice = present(value.netPurchasePrice);
  return {
    number: text(value.number),
    title: text(value.title),
    currency: text(value.currency),
    lines: [
      {
        section: text(value.section),
        itemType: text(value.itemType),
        customDescription: present(value.description),
        quantity: text(value.quantity),
        purchaseQuantity: present(value.purchaseQuantity),
        unit: text(value.unit),
        ...(priceStatus !== 'MISSING' && netPurchasePrice
          ? { netPurchasePrice }
          : {}),
        currency: text(value.currency),
        exchangeRateSnapshot: text(value.exchangeRateSnapshot),
        sellingPrice: text(value.sellingPrice),
        priceStatus,
        priceSourceType: present(value.priceSourceType),
        priceQuotedAt: present(value.priceQuotedAt),
        priceValidUntil: present(value.priceValidUntil),
        sourceDocument: present(value.sourceDocument),
        freightEstimate: present(value.freightEstimate),
        taxEstimate: present(value.taxEstimate),
        installationCost: present(value.installationCost),
        otherCost: present(value.otherCost),
        notes: present(value.notes),
        contributesToTotal: true,
      },
    ],
  };
}

export default function EstimatesPage() {
  const projectId = String(useParams().projectId);
  const [items, setItems] = useState<Estimate[]>([]);
  const [message, setMessage] = useState('');
  const [priceStatus, setPriceStatus] = useState('MISSING');
  const load = useCallback(
    () =>
      api<Estimate[]>(`/projects/${projectId}/estimates`)
        .then(setItems)
        .catch((e: Error) => setMessage(e.message)),
    [projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = Object.fromEntries(new FormData(form));
    try {
      await api(`/projects/${projectId}/estimates`, {
        method: 'POST',
        body: JSON.stringify(estimateCreatePayload(value)),
      });
      form.reset();
      setPriceStatus('MISSING');
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <p>
        <Link href={`/projects/${projectId}/stage-1`}>Không gian dự án</Link> →
        Dự toán
      </p>
      <header>
        <h1 className="text-2xl font-semibold">Dự toán / BOQ</h1>
        <p>Chi phí nội bộ và giá bán được lưu riêng theo từng version.</p>
      </header>
      {message && <p role="alert">{message}</p>}
      <section className="panel">
        <h2 className="font-semibold">Tạo dự toán</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-4"
          onSubmit={(e) => void create(e)}
        >
          <input name="number" placeholder="Số dự toán" required />
          <input name="title" placeholder="Tên dự toán" required />
          <label className="grid gap-1 text-sm">
            Tiền tệ
            <input name="currency" defaultValue="VND" maxLength={3} required />
          </label>
          <label className="grid gap-1 text-sm">
            Tỷ giá dự toán
            <input
              name="exchangeRateSnapshot"
              defaultValue="1"
              inputMode="decimal"
              required
            />
          </label>
          <input name="section" placeholder="Nhóm hạng mục" required />
          <input
            name="itemType"
            placeholder="Loại hạng mục"
            defaultValue="PRODUCT"
            required
          />
          <input name="description" placeholder="Mô tả" />
          <input name="unit" defaultValue="cái" required />
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue="1"
            required
          />
          <label className="grid gap-1 text-sm">
            Khối lượng mua / sản xuất
            <input
              name="purchaseQuantity"
              type="number"
              min="0.001"
              step="0.001"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Trạng thái nguồn giá
            <select
              name="priceStatus"
              onChange={(event) => setPriceStatus(event.target.value)}
              value={priceStatus}
            >
              <option value="MISSING">Thiếu dữ liệu giá</option>
              <option value="PROVISIONAL">Tạm tính</option>
              <option value="CONFIRMED">Đã xác nhận</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Giá mua thuần
            <input
              name="netPurchasePrice"
              type="number"
              min="0"
              step="0.01"
              disabled={priceStatus === 'MISSING'}
              required={priceStatus !== 'MISSING'}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Loại nguồn giá
            <select
              name="priceSourceType"
              required={priceStatus === 'CONFIRMED'}
            >
              <option value="">Chọn nguồn giá</option>
              <option value="SUPPLIER_QUOTATION">Báo giá NCC</option>
              <option value="HISTORICAL">Dữ liệu lịch sử</option>
              <option value="STANDARD">Định mức có nguồn</option>
              <option value="MANUAL">Nhập tay</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Ngày nguồn giá
            <input
              name="priceQuotedAt"
              type="date"
              required={priceStatus === 'CONFIRMED'}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Hạn hiệu lực
            <input name="priceValidUntil" type="date" />
          </label>
          <label className="grid gap-1 text-sm">
            Tài liệu / số báo giá làm căn cứ
            <input
              name="sourceDocument"
              required={priceStatus === 'CONFIRMED'}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Đơn giá bán
            <input
              name="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Vận chuyển
            <input name="freightEstimate" inputMode="decimal" />
          </label>
          <label className="grid gap-1 text-sm">
            Thuế / phí không khấu trừ
            <input name="taxEstimate" inputMode="decimal" />
          </label>
          <label className="grid gap-1 text-sm">
            Lắp đặt
            <input name="installationCost" inputMode="decimal" />
          </label>
          <label className="grid gap-1 text-sm">
            Chi phí khác
            <input name="otherCost" inputMode="decimal" />
          </label>
          <input name="notes" placeholder="Đã gồm / chưa gồm chi phí" />
          <button className="primary">Tạo dự toán V1</button>
        </form>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số</th>
              <th>Tên</th>
              <th>Version</th>
              <th>Trạng thái</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="py-3">
                  <Link href={`/projects/${projectId}/estimates/${item.id}`}>
                    {item.number}
                  </Link>
                </td>
                <td>{item.title}</td>
                <td>V{item.currentVersion}</td>
                <td>{item.status}</td>
                <td>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="py-5">
            Chưa có dự toán. Dùng form trên để tạo BOQ đầu tiên.
          </p>
        )}
      </section>
    </div>
  );
}
