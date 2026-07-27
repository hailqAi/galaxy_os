'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';

type Request = { id: string; requestNumber: string; status: string };
type Supplier = { id: string; legalName: string };

export default function NewRFQPage() {
  const router = useRouter();
  const projectId = useSearchParams().get('projectId');
  const [requests, setRequests] = useState<Request[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      api<{ items: Request[] }>(
        `/purchase-requests?pageSize=100&status=APPROVED${projectId ? `&projectId=${projectId}` : ''}`,
      ),
      api<{ items: Supplier[] }>('/suppliers?pageSize=100'),
    ])
      .then(([r, s]) => {
        setRequests(r.items);
        setSuppliers(s.items);
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const created = await api<{ id: string }>('/rfqs', {
        method: 'POST',
        body: JSON.stringify({
          rfqNumber: form.get('rfqNumber'),
          purchaseRequestId: form.get('purchaseRequestId'),
          responseDeadline: form.get('responseDeadline'),
          requestedCurrency: form.get('requestedCurrency'),
          deliveryDestination: form.get('deliveryDestination'),
          language: form.get('language'),
          supplierIds: form.getAll('supplierIds'),
        }),
      });
      router.push(`/procurement/rfqs/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Tạo RFQ</h1>
        <p>RFQ chỉ dùng yêu cầu mua hàng đã duyệt.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <form className="panel grid max-w-3xl gap-4" onSubmit={submit}>
        <label>
          Số RFQ
          <input name="rfqNumber" required />
        </label>
        <label>
          Yêu cầu mua hàng
          <select name="purchaseRequestId" required>
            <option value="">Chọn yêu cầu</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.requestNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hạn phản hồi
          <input name="responseDeadline" type="date" required />
        </label>
        <label>
          Tiền tệ
          <input
            defaultValue="VND"
            maxLength={3}
            name="requestedCurrency"
            required
          />
        </label>
        <label>
          Điểm giao hàng
          <input name="deliveryDestination" required />
        </label>
        <label>
          Ngôn ngữ
          <select name="language">
            <option value="VI">Tiếng Việt</option>
            <option value="EN">English</option>
            <option value="BILINGUAL">Song ngữ</option>
          </select>
        </label>
        <fieldset>
          <legend>Nhà cung cấp</legend>
          <div className="grid gap-2">
            {suppliers.map((s) => (
              <label key={s.id}>
                <input name="supplierIds" type="checkbox" value={s.id} />{' '}
                {s.legalName}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary rounded px-3 py-2" type="submit">
          Tạo RFQ
        </button>
      </form>
    </div>
  );
}
