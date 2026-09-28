'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { deliveryFailureKind, deliveryRequestBody } from './delivery-request';

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  title: string;
  status: string;
  plan: { name: string; siteReady: boolean; customerCoordination: boolean };
  checklist: { id: string; title: string; completedAt: string | null }[];
  items: {
    id: string;
    status: string;
    room: string | null;
    position: string | null;
  }[];
  dailyLogs: {
    id: string;
    logDate: string;
    workCompleted: string;
    peopleOnsite: number;
  }[];
  punchItems: {
    id: string;
    issue: string;
    location: string;
    severity: string;
    status: string;
  }[];
};

type DeliveryOptions = {
  workOrderId: string;
  projectId: string;
  lines: {
    stockIssueLineId: string;
    issueNumber: string;
    itemCode: string;
    unit: string;
    lotNumber: string | null;
    serialNumber: string | null;
    quantity: string;
  }[];
  files: { id: string; version: number; filename: string }[];
};
export default function WorkOrderClient({
  id,
  deliveryEnabled,
}: {
  id: string;
  deliveryEnabled: boolean;
}) {
  const [item, setItem] = useState<WorkOrder>();
  const [error, setError] = useState('');
  const [options, setOptions] = useState<DeliveryOptions>();
  const [optionsError, setOptionsError] = useState('');
  const [lineId, setLineId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [recipient, setRecipient] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [pending, setPending] =
    useState<ReturnType<typeof deliveryRequestBody>>();
  const [deliveryNotice, setDeliveryNotice] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const scope = useRef(0);
  const optionsGeneration = useRef(0);
  const clearDelivery = useCallback(() => {
    optionsGeneration.current++;
    setOptions(undefined);
    setPending(undefined);
    setLineId('');
    setFileKey('');
    setQuantity('');
    setDeliveryDate('');
    setRecipient('');
    setError('');
    setOptionsError('');
    setDeliveryNotice('');
    setDeliveryBusy(false);
  }, []);
  const load = useCallback(() => {
    const epoch = scope.current;
    return api<WorkOrder>(`/installation/work-orders/${id}`)
      .then((value) => {
        if (scope.current === epoch) setItem(value);
      })
      .catch((cause: Error) => {
        if (scope.current === epoch) setError(cause.message);
      });
  }, [id]);
  const loadOptions = useCallback(() => {
    if (!deliveryEnabled) return Promise.resolve();
    const epoch = scope.current;
    const generation = ++optionsGeneration.current;
    return api<DeliveryOptions>(
      `/installation/work-orders/${id}/delivery-options`,
    )
      .then((value) => {
        if (
          scope.current === epoch &&
          optionsGeneration.current === generation
        ) {
          setOptions(value);
          setLineId((selected) =>
            value.lines.some((line) => line.stockIssueLineId === selected)
              ? selected
              : '',
          );
          setFileKey((selected) =>
            value.files.some(
              (file) => JSON.stringify([file.id, file.version]) === selected,
            )
              ? selected
              : '',
          );
          setOptionsError('');
        }
      })
      .catch((cause: unknown) => {
        if (
          scope.current === epoch &&
          optionsGeneration.current === generation
        ) {
          if (deliveryFailureKind(cause) === 'revoke') clearDelivery();
          else {
            setOptions(undefined);
            setOptionsError((cause as Error).message);
          }
        }
      });
  }, [id, clearDelivery, deliveryEnabled]);
  useEffect(() => {
    const currentScope = scope;
    void load();
    void loadOptions();
    const clear = () => {
      currentScope.current++;
      setItem(undefined);
      clearDelivery();
    };
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('galaxy-auth');
    if (channel) channel.onmessage = clear;
    window.addEventListener('galaxy-auth-changed', clear);
    return () => {
      currentScope.current++;
      window.removeEventListener('galaxy-auth-changed', clear);
      channel?.close();
    };
  }, [load, loadOptions, clearDelivery]);
  async function createDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deliveryEnabled) return;
    const file = options?.files.find(
      (candidate) =>
        JSON.stringify([candidate.id, candidate.version]) === fileKey,
    );
    if (
      !pending &&
      (!options?.lines.some((line) => line.stockIssueLineId === lineId) ||
        !file ||
        !recipient.trim())
    )
      return;
    const body =
      pending ??
      deliveryRequestBody({
        stockIssueLineId: lineId,
        quantity,
        deliveryDate,
        recipient,
        fileId: file!.id,
        fileVersion: file!.version,
        clientKey: crypto.randomUUID(),
      });
    const epoch = scope.current;
    setPending(body);
    setDeliveryBusy(true);
    setError('');
    try {
      await api(`/installation/work-orders/${id}/deliveries`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (scope.current !== epoch) return;
      setPending(undefined);
      setDeliveryNotice(
        'Đã ghi nhận giao tại công trường; có thể chọn nguồn trong phòng khách.',
      );
      setLineId('');
      setFileKey('');
      setQuantity('');
      setRecipient('');
      setDeliveryDate('');
      void loadOptions();
    } catch (cause) {
      if (scope.current === epoch) {
        const failure = deliveryFailureKind(cause);
        if (failure !== 'retry') setPending(undefined);
        if (failure === 'revoke') {
          clearDelivery();
        } else {
          setError(
            `${(cause as Error).message}${failure === 'retry' ? ' · Có thể thử lại cùng yêu cầu.' : ' · Sửa thông tin và thử lại.'}`,
          );
          if (failure === 'correct') void loadOptions();
        }
      }
    } finally {
      if (scope.current === epoch) setDeliveryBusy(false);
    }
  }
  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/work-orders/${id}/release`, {
        method: 'POST',
        body: JSON.stringify({
          overrideReason: form.get('overrideReason') || undefined,
        }),
      });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function addLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/work-orders/${id}/daily-logs`, {
        method: 'POST',
        body: JSON.stringify({
          logDate: form.get('logDate'),
          siteCondition: form.get('siteCondition'),
          peopleOnsite: Number(form.get('peopleOnsite')),
          workCompleted: form.get('workCompleted'),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function addPunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(`/installation/work-orders/${id}/punch-items`, {
        method: 'POST',
        body: JSON.stringify({
          issue: form.get('issue'),
          location: form.get('location'),
          severity: form.get('severity'),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  if (!item)
    return (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Đang tải lệnh lắp đặt…'}
      </p>
    );
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {item.workOrderNumber} · {item.title}
        </h1>
        <p>
          {item.status} · {item.plan.name}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {deliveryEnabled && optionsError && (
        <p role="alert">
          Không tải được lựa chọn giao hàng: {optionsError}.{' '}
          <button
            type="button"
            onClick={() => {
              setOptionsError('');
              void loadOptions();
            }}
          >
            Tải lại lựa chọn giao hàng
          </button>
        </p>
      )}
      {deliveryEnabled && options && (
        <form
          className="panel grid gap-3 md:grid-cols-2"
          onSubmit={createDelivery}
        >
          <h2 className="font-semibold md:col-span-2">
            Ghi nhận giao tại công trường
          </h2>
          <p className="md:col-span-2">
            Nhân viên ghi nhận dựa trên dòng xuất kho và file chứng cứ; không
            chứng minh khách đã ký hoặc nghiệm thu.
          </p>
          <p className="md:col-span-2 flex flex-wrap gap-3">
            <a
              href={`/projects/${options.projectId}/files`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mở hồ sơ file của dự án
            </a>
            <button
              type="button"
              disabled={deliveryBusy || !!pending}
              onClick={() => void loadOptions()}
            >
              Tải lại lựa chọn
            </button>
          </p>
          {deliveryNotice && (
            <p role="status" className="md:col-span-2">
              {deliveryNotice}
            </p>
          )}
          <label>
            Dòng xuất kho đã phát hành
            <select
              required
              disabled={!!pending || deliveryBusy}
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
            >
              <option value="">Chọn dòng xuất kho</option>
              {options.lines.map((line) => (
                <option
                  key={line.stockIssueLineId}
                  value={line.stockIssueLineId}
                >
                  {line.issueNumber} · {line.itemCode} · {line.quantity}{' '}
                  {line.unit}
                  {line.lotNumber ? ` · lô ${line.lotNumber}` : ''}
                  {line.serialNumber ? ` · serial ${line.serialNumber}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số lượng giao
            <input
              required
              disabled={!!pending || deliveryBusy}
              inputMode="decimal"
              pattern="(?:0|[1-9][0-9]{0,16})(?:\.[0-9]{1,3})?"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label>
            Ngày giao
            <input
              required
              disabled={!!pending || deliveryBusy}
              type="date"
              value={deliveryDate}
              onChange={(event) => setDeliveryDate(event.target.value)}
            />
          </label>
          <label>
            Người nhận được nhân viên ghi nhận
            <input
              required
              disabled={!!pending || deliveryBusy}
              maxLength={200}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </label>
          <label>
            File chứng cứ đúng Project
            <select
              required
              disabled={!!pending || deliveryBusy}
              value={fileKey}
              onChange={(event) => setFileKey(event.target.value)}
            >
              <option value="">Chọn file và phiên bản</option>
              {options.files.map((file) => (
                <option
                  key={`${file.id}:${file.version}`}
                  value={JSON.stringify([file.id, file.version])}
                >
                  {file.filename} · phiên bản {file.version}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border px-3 py-2 md:col-span-2"
            disabled={
              deliveryBusy ||
              (!pending &&
                (!lineId ||
                  !fileKey ||
                  !quantity ||
                  !deliveryDate ||
                  !recipient.trim()))
            }
          >
            {pending
              ? 'Thử lại ghi nhận cùng yêu cầu'
              : 'Ghi nhận giao tại công trường'}
          </button>
        </form>
      )}
      <form className="panel flex flex-wrap gap-3" onSubmit={release}>
        <label>
          Lý do override (chỉ khi thiếu readiness)
          <input name="overrideReason" />
        </label>
        <button className="primary rounded px-3 py-2">Phát hành lệnh</button>
      </form>
      <section className="panel">
        <h2 className="font-semibold">Checklist</h2>
        <ul>
          {item.checklist.map((line) => (
            <li key={line.id}>
              {line.completedAt ? '✓' : '○'} {line.title}
            </li>
          ))}
        </ul>
      </section>
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={addLog}>
        <h2 className="font-semibold md:col-span-2">Nhật ký công trường</h2>
        <label>
          Ngày
          <input name="logDate" type="date" required />
        </label>
        <label>
          Số người
          <input min="0" name="peopleOnsite" type="number" required />
        </label>
        <label>
          Điều kiện site
          <input name="siteCondition" required />
        </label>
        <label>
          Công việc hoàn thành
          <input name="workCompleted" required />
        </label>
        <button className="rounded border px-3 py-2 md:col-span-2">
          Thêm nhật ký
        </button>
        <ul className="md:col-span-2">
          {item.dailyLogs.map((log) => (
            <li key={log.id}>
              {new Date(log.logDate).toLocaleDateString('vi-VN')} ·{' '}
              {log.peopleOnsite} người · {log.workCompleted}
            </li>
          ))}
        </ul>
      </form>
      <form className="panel grid gap-3 md:grid-cols-2" onSubmit={addPunch}>
        <h2 className="font-semibold md:col-span-2">Punch list</h2>
        <label>
          Vấn đề
          <input name="issue" required />
        </label>
        <label>
          Vị trí
          <input name="location" required />
        </label>
        <label>
          Mức độ
          <select name="severity">
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
            <option>CRITICAL</option>
          </select>
        </label>
        <button className="rounded border px-3 py-2">Thêm punch item</button>
        <ul className="md:col-span-2">
          {item.punchItems.map((punch) => (
            <li key={punch.id}>
              {punch.severity} · {punch.location} · {punch.issue} ·{' '}
              {punch.status}
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
