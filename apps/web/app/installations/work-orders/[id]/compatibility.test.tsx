import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import WorkOrderPage from './page';
import WorkOrderClient from './work-order-client';

const { effects, api } = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  api: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => effects.push(effect),
}));

vi.mock('../../../lib/api', () => ({ api }));

afterEach(() => {
  effects.length = 0;
  api.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([
  ['true', true],
  ['false', false],
  [undefined, false],
] as const)(
  'enables delivery only when the server flag is %s',
  async (flag, enabled) => {
    vi.stubEnv('FEATURE_PROJECT_CHAT', flag);
    vi.stubGlobal('React', React);
    const page = await Reflect.apply(WorkOrderPage, undefined, [
      { params: Promise.resolve({ id: 'wo-1' }) },
    ]);

    expect(page.key).toBe('wo-1');
    expect(page.props).toMatchObject({ id: 'wo-1', deliveryEnabled: enabled });
  },
);

it.each([
  [false, ['/installation/work-orders/wo-1']],
  [
    true,
    [
      '/installation/work-orders/wo-1',
      '/installation/work-orders/wo-1/delivery-options',
    ],
  ],
] as const)(
  'loads only allowed endpoints with deliveryEnabled=%s',
  (enabled, paths) => {
    vi.stubGlobal('React', React);
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('BroadcastChannel', undefined);
    renderToStaticMarkup(
      <WorkOrderClient id="wo-1" deliveryEnabled={enabled} />,
    );
    expect(effects).toHaveLength(1);

    effects[0]!();

    expect(api.mock.calls.map(([path]) => path)).toEqual(paths);
  },
);
