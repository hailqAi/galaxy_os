'use client';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export type Operation = {
  id: string;
  status: string;
  lines: {
    id: string;
    quantity?: string;
    receivedQuantity?: string;
    expectedQuantity?: string;
  }[];
} & Record<string, unknown>;

export function OperationList({
  endpoint,
  numberField,
  children,
  actions,
}: {
  endpoint: string;
  numberField: string;
  children: (reload: () => Promise<void>) => ReactNode;
  actions: (item: Operation, reload: () => Promise<void>) => ReactNode;
}) {
  const [items, setItems] = useState<Operation[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      api<Operation[]>(endpoint)
        .then(setItems)
        .catch((cause: Error) => setError(cause.message)),
    [endpoint],
  );
  useEffect(() => void load(), [load]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {children(load)}
      <section className="panel overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Số</th>
              <th>Số dòng</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>{String(item[numberField])}</td>
                <td>{item.lines.length}</td>
                <td>{item.status}</td>
                <td>{actions(item, load)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
