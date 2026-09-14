'use client';
import React from 'react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../lib/api';
import { createCommandKey } from '../lib/create-command-key';
import { normalizeVietnameseMoney } from './[projectId]/stage-1/money';

export type ProjectCustomer = {
  id: string;
  displayName: string;
  contacts?: { id: string; displayName: string; isPrimary?: boolean }[];
};
export type NewProjectValues = {
  name: string;
  estimatedInvestmentAmount: string;
  customerId: string;
  primaryContactId?: string;
};
export type CreatedProject = {
  id: string;
  code: string;
  stageOneUrl: `/projects/${string}/stage-1?step=1`;
};
type ProjectRequest = (
  path: string,
  init?: RequestInit,
) => Promise<CreatedProject>;
type CustomerRequest = (path: string) => Promise<ProjectCustomer>;

export const createNewProjectSubmitter =
  (request: ProjectRequest = api, idempotencyKey = createCommandKey()) =>
  (values: NewProjectValues) => {
    const amount = normalizeVietnameseMoney(values.estimatedInvestmentAmount);
    if (!values.name.trim()) throw new Error('Vui lòng nhập tên dự án.');
    if (!amount) throw new Error('Giá trị dự kiến không hợp lệ.');
    if (!values.customerId) throw new Error('Vui lòng chọn khách hàng.');
    return request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        ...values,
        name: values.name.trim(),
        estimatedInvestmentAmount: amount,
        primaryContactId: values.primaryContactId || undefined,
        idempotencyKey,
      }),
    });
  };

export const loadProjectCustomer = (
  customerId: string,
  request: CustomerRequest = api,
) => request(`/customers/${customerId}`);

export const isCurrentCustomerDetail = (
  currentCustomerId: string,
  requestedCustomerId: string,
) => currentCustomerId === requestedCustomerId;

export function finishProjectCreation(
  project: CreatedProject,
  refresh: () => void,
  replace: (url: string) => void,
) {
  if (project.stageOneUrl !== `/projects/${project.id}/stage-1?step=1`)
    throw new Error('Đường dẫn Giai đoạn 1 không hợp lệ.');
  refresh();
  replace(project.stageOneUrl);
}

export function projectFormError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return 'Bạn không có quyền khởi tạo dự án.';
    if (error.status === 409)
      return 'Yêu cầu tạo dự án đã được xử lý trước đó.';
    if (error.status === 400 || error.status === 422)
      return 'Thông tin dự án chưa hợp lệ. Vui lòng kiểm tra lại.';
  }
  if (
    error instanceof Error &&
    /tên dự án|giá trị|khách hàng/i.test(error.message)
  )
    return error.message;
  return 'Không thể khởi tạo dự án. Vui lòng kiểm tra kết nối và thử lại.';
}

export function NewProjectFormView({
  busy = false,
  customers,
  message = '',
  onCustomerChange,
  onSubmit,
}: {
  busy?: boolean;
  customers: ProjectCustomer[];
  message?: string;
  onCustomerChange?: (
    customerId: string,
  ) => Promise<ProjectCustomer | undefined>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const currentCustomerId = useRef('');
  const selectedCustomer = customers.find(({ id }) => id === customerId);
  const [contactId, setContactId] = useState('');
  return (
    <form className="panel grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
      <label className="grid gap-1 text-sm font-semibold">
        TÊN DỰ ÁN *
        <input
          data-business-input="name"
          maxLength={200}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        GIÁ TRỊ DỰ KIẾN (VND) *
        <input
          data-business-input="estimated-investment"
          inputMode="decimal"
          name="estimatedInvestmentAmount"
          placeholder="35.000.000.000 ₫"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        KHÁCH HÀNG / ĐẠI DIỆN KHÁCH HÀNG *
        <select
          data-business-input="investor"
          name="customerId"
          onChange={async (event) => {
            const requestedCustomerId = event.target.value;
            currentCustomerId.current = requestedCustomerId;
            const next = customers.find(({ id }) => id === requestedCustomerId);
            setCustomerId(requestedCustomerId);
            setContactId(
              next?.contacts?.find(({ isPrimary }) => isPrimary)?.id ?? '',
            );
            const detailed = await onCustomerChange?.(requestedCustomerId);
            if (
              detailed &&
              isCurrentCustomerDetail(
                currentCustomerId.current,
                requestedCustomerId,
              )
            )
              setContactId(
                detailed.contacts?.find(({ isPrimary }) => isPrimary)?.id ?? '',
              );
          }}
          required
          value={customerId}
        >
          <option value="">Chọn khách hàng</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.displayName}
            </option>
          ))}
        </select>
        {!!selectedCustomer?.contacts?.length && (
          <select
            aria-label="Đại diện khách hàng"
            name="primaryContactId"
            onChange={(event) => setContactId(event.target.value)}
            value={contactId}
          >
            <option value="">Chọn người đại diện</option>
            {selectedCustomer.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.displayName}
              </option>
            ))}
          </select>
        )}
      </label>
      {message && (
        <p className="sm:col-span-2 text-red-700" role="alert">
          {message}
        </p>
      )}
      <button className="primary sm:col-span-2" disabled={busy}>
        {busy ? 'Đang khởi tạo…' : 'KHỞI TẠO DỰ ÁN'}
      </button>
    </form>
  );
}

export function ProjectForm() {
  const router = useRouter();
  const [customers, setCustomers] = useState<ProjectCustomer[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = useRef<ReturnType<typeof createNewProjectSubmitter> | null>(
    null,
  );
  submit.current ??= createNewProjectSubmitter();
  const createProject = submit.current;
  useEffect(() => {
    api<{ items: ProjectCustomer[] }>(
      '/customers?pageSize=100&status=ACTIVE&sort=displayName&direction=asc',
    )
      .then(({ items }) => setCustomers(items))
      .catch(() =>
        setMessage('Không thể tải danh sách khách hàng. Vui lòng thử lại.'),
      );
  }, []);
  const selectCustomer = async (customerId: string) => {
    if (!customerId) return undefined;
    try {
      const selected = await loadProjectCustomer(customerId);
      setCustomers((current) => [
        ...current.filter(({ id }) => id !== selected.id),
        selected,
      ]);
      return selected;
    } catch (error) {
      setMessage(projectFormError(error));
      return undefined;
    }
  };
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const values = new FormData(event.currentTarget);
    try {
      const created = await createProject({
        name: String(values.get('name') ?? ''),
        estimatedInvestmentAmount: String(
          values.get('estimatedInvestmentAmount') ?? '',
        ),
        customerId: String(values.get('customerId') ?? ''),
        primaryContactId:
          String(values.get('primaryContactId') ?? '') || undefined,
      });
      finishProjectCreation(created, router.refresh, router.replace);
    } catch (error) {
      setMessage(projectFormError(error));
      setBusy(false);
    }
  };
  return (
    <NewProjectFormView
      busy={busy}
      customers={customers}
      message={message}
      onCustomerChange={selectCustomer}
      onSubmit={(event) => void onSubmit(event)}
    />
  );
}
