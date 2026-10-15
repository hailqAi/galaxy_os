import { expect, it } from 'vitest';
import { chooseExecution, requestedOutputs } from './ai-execution';

it('keeps an explicit conversion on a new line separate from earlier reading instructions', () => {
  expect(
    requestedOutputs('Hướng dẫn đọc PDF\nChuyển file này sang Excel'),
  ).toEqual(['xlsx']);
});

it.each([
  'Explain how to convert Excel to PDF',
  'Hướng dẫn chuyển PDF sang Excel',
  'Cho biết cách chuyển sang Excel',
])('keeps conversion instructions as a text request: %s', (question) => {
  expect(requestedOutputs(question)).toEqual([]);
  expect(
    chooseExecution({ requested: 'AUTO', question, sourceCount: 0 }).effective,
  ).toBe('SIWC');
});

it.each([
  'chuyển sang excel. test luồng',
  'Chuyển file PDF này sang Excel',
  'Convert this PDF to an Excel workbook',
  'Xuất sang Excel và PDF',
  'Xuất ra Excel',
  'Chuyển file PDF này thành Excel',
  'Tạo bảng tính Excel',
  'Xuất file XLSX',
  'Tạo cả Excel và PDF',
  '  XUẤT\tRA   EXCEL  ',
])('requires a workbook for the explicit conversion: %s', (question) => {
  expect(requestedOutputs(question)).toContain('xlsx');
});

it.each([
  'Đọc file Excel và giải thích',
  'Không chuyển sang Excel; trả văn bản',
])('does not require an output workbook for %s', (question) =>
  expect(requestedOutputs(question)).toEqual([]),
);

it('keeps explicit output requirements even when no format dropdown was used', () => {
  expect(requestedOutputs('Lập báo giá và trả XLSX cùng PDF.')).toEqual([
    'xlsx',
    'pdf',
  ]);
  expect(
    requestedOutputs('Read the source and create an XLSX workbook.'),
  ).toEqual(['xlsx']);
  expect(requestedOutputs('Đọc file XLSX và tóm tắt nội dung.')).toEqual([]);
  expect(requestedOutputs('XLSX là gì?')).toEqual([]);
  expect(requestedOutputs('Không tạo XLSX; chỉ trả văn bản.')).toEqual([]);
});

it.each([
  'Create a summary of the PDF.',
  'Tạo hướng dẫn đọc PDF, không cần xuất file.',
  'Không tạo XLSX; chỉ trả văn bản.',
  'Gửi bạn file XLSX để đọc.',
  'Trả lời về file XLSX.',
  'Phân tích file Excel đầu vào.',
  'Không cần xuất ra Excel; chỉ phân tích.',
])(
  'keeps a text request on SIWC without inventing output requirements: %s',
  (question) => {
    expect(requestedOutputs(question)).toEqual([]);
    expect(
      chooseExecution({ requested: 'AUTO', question, sourceCount: 0 })
        .effective,
    ).toBe('SIWC');
  },
);

it('keeps pinned file context out of an unfiltered direct count', () => {
  expect(
    chooseExecution({
      requested: 'AUTO',
      question: 'OS đang có bao nhiêu dự án?',
      sourceCount: 0,
      pinnedContext: true,
    }).effective,
  ).toBe('SIWC');
});

it('routes a clear workspace count to the shared data service, with an explicit ACTIVE filter', () => {
  expect(
    chooseExecution({
      requested: 'AUTO',
      question: 'OS đang có bao nhiêu dự án?',
      sourceCount: 0,
    }),
  ).toMatchObject({
    effective: 'GALAXY_DATA',
    intent: 'COUNT_PROJECTS',
    filters: {},
  });
  expect(
    chooseExecution({
      requested: 'AUTO',
      question: 'Có bao nhiêu dự án đang triển khai?',
      sourceCount: 0,
    }),
  ).toMatchObject({ effective: 'GALAXY_DATA', filters: { status: 'ACTIVE' } });
});
it('respects explicit execution and does not classify by message length', () => {
  expect(
    chooseExecution({
      requested: 'MCP_EVENTS',
      question: 'chào',
      sourceCount: 0,
    }).effective,
  ).toBe('MCP_EVENTS');
  expect(
    chooseExecution({ requested: 'SIWC', question: 'Tạo XLSX', sourceCount: 1 })
      .effective,
  ).toBe('SIWC');
  expect(
    chooseExecution({ requested: 'AUTO', question: 'x', sourceCount: 0 }),
  ).toMatchObject({ effective: 'SIWC', context: 'GENERAL' });
  expect(
    chooseExecution({ requested: 'AUTO', question: 'Chào', sourceCount: 0 }),
  ).toMatchObject({ effective: 'SIWC', context: 'GENERAL' });
  expect(
    chooseExecution({
      requested: 'AUTO',
      question: 'So sánh theo file đã chọn',
      sourceCount: 1,
    }).effective,
  ).toBe('MCP_EVENTS');
});
it('does not replace file-dependent work or a filtered unknown business query with an unfiltered count', () => {
  expect(
    chooseExecution({
      requested: 'AUTO',
      question: 'Đếm dự án trong file này',
      sourceCount: 1,
    }).effective,
  ).toBe('MCP_EVENTS');
  expect(
    chooseExecution({
      requested: 'AUTO',
      question: 'Có bao nhiêu dự án của khách hàng Alpha?',
      sourceCount: 0,
    }).effective,
  ).toBe('SIWC');
});
