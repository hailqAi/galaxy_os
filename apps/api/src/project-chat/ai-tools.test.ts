import { expect, it, vi } from 'vitest';
import { calculate, createToolRunner, toolInputs } from './ai-tools';

it('Decimal tính thật, không làm mất phần lẻ hoặc coi giá thiếu là 0', () => {
  expect(
    calculate({
      operation: 'add',
      operands: ['0.1', '0.2'],
      decimalPlaces: null,
    }).value,
  ).toBe('0.3');
  expect(
    calculate({
      operation: 'multiply',
      operands: ['999999999999999.99', '3'],
      decimalPlaces: 2,
    }).value,
  ).toBe('2999999999999999.97');
  expect(() =>
    calculate({
      operation: 'divide',
      operands: ['5', '0'],
      decimalPlaces: null,
    }),
  ).toThrow();
  expect(() =>
    toolInputs.calculate.parse({
      operation: 'add',
      operands: ['', '1'],
      decimalPlaces: null,
    }),
  ).toThrow();
  expect(() =>
    toolInputs.calculate.parse({
      operation: 'add',
      operands: ['1e999', '1'],
      decimalPlaces: null,
    }),
  ).toThrow();
});
it('tool schema không nhận Project/actor/SQL/path do model cung cấp', () => {
  for (const extra of [
    { projectId: 'other' },
    { actorId: 'admin' },
    { sql: 'select *' },
    { path: '/etc/passwd' },
  ])
    expect(() =>
      toolInputs.search_project_sources.parse({
        query: 'mã hàng',
        limit: 5,
        ...extra,
      }),
    ).toThrow();
  expect(() =>
    toolInputs.read_project_source.parse({
      sourceId: '../../secret',
      representation: 'text',
      page: null,
      imageId: null,
    }),
  ).toThrow();
});
it('mỗi request có budget/cancel và cache tool riêng; cùng arguments không tạo output lặp', async () => {
  const execute = vi.fn(async () => ({ content: '{"value":"0.3"}' }));
  const controller = new AbortController();
  const run = createToolRunner(execute, controller.signal);
  const args = JSON.stringify({
    operation: 'add',
    operands: ['0.1', '0.2'],
    decimalPlaces: null,
  });
  await run('calculate', args);
  await run('calculate', args);
  expect(execute).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 6; i++) await run('calculate', args);
  await expect(run('calculate', args)).rejects.toThrow('TOOL_CALL_LIMIT');
  const another = createToolRunner(execute, controller.signal);
  await another('calculate', args);
  expect(execute).toHaveBeenCalledTimes(2);
  controller.abort();
  await expect(another('calculate', args)).rejects.toThrow();
});
it('tool không có trong allowlist hoặc dữ liệu quá lớn không được thực thi', async () => {
  const execute = vi.fn(async () => ({ content: 'x'.repeat(33000) }));
  const run = createToolRunner(execute, new AbortController().signal);
  await expect(run('shell', '{"command":"env"}')).rejects.toThrow(
    'TOOL_NOT_AVAILABLE',
  );
  expect(execute).not.toHaveBeenCalled();
  await expect(
    run(
      'calculate',
      JSON.stringify({
        operation: 'add',
        operands: ['1', '2'],
        decimalPlaces: null,
      }),
    ),
  ).rejects.toThrow('TOOL_OUTPUT_TOO_LARGE');
});
it('cancel kết thúc chờ tool đang chạy, không chờ promise treo', async () => {
  const controller = new AbortController();
  const run = createToolRunner(() => new Promise(() => {}), controller.signal);
  const pending = run(
    'calculate',
    JSON.stringify({
      operation: 'add',
      operands: ['1', '2'],
      decimalPlaces: null,
    }),
  );
  controller.abort();
  await expect(pending).rejects.toThrow();
}, 500);

it('tổng Decimal(20,2) giữ phần lẻ khi cộng nhiều dòng tối đa', async () => {
  const { decimalTotal } = await import('./ai-tools');
  expect(decimalTotal(['999999999999999999.99', '999999999999999999.99'])).toBe(
    '1999999999999999999.98',
  );
});

it('tool chậm có deadline riêng và truyền abort xuống handler', async () => {
  vi.useFakeTimers();
  try {
    let captured: AbortSignal | undefined;
    const run = createToolRunner(async (name, input, key, signal) => {
      expect(name).toBe('calculate');
      expect(input).toBeTruthy();
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      captured = signal;
      return new Promise(() => {});
    }, new AbortController().signal);
    const pending = run(
      'calculate',
      JSON.stringify({
        operation: 'add',
        operands: ['1', '2'],
        decimalPlaces: null,
      }),
    );
    const rejected = expect(pending).rejects.toThrow('TOOL_TIMEOUT');
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(captured?.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
