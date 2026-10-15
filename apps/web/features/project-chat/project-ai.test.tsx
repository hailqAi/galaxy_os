import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  AiAnswer,
  aiStatusLabel,
  ModelSelector,
  aiSessionKey,
  ChatGptConnection,
  citationGroups,
  initialAiSelection,
} from './project-ai';

it('uses the Owner preference for a new selection and keeps saved model and effort without fallback', () => {
  const models = [
    {
      id: 'gpt-6.1-sol',
      provider: 'chatgpt',
      available: true,
      capabilities: {
        reasoningModes: ['default', 'high'],
        imageInput: false,
        pdfInput: false,
      },
    },
    {
      id: 'gpt-6-astra',
      provider: 'chatgpt',
      available: true,
      capabilities: {
        reasoningModes: ['default', 'high', 'max'],
        imageInput: false,
        pdfInput: false,
      },
    },
  ];
  const preference = { model: 'gpt-6-astra', reasoning: 'max' };
  expect(initialAiSelection(models, null, null, preference)).toEqual(
    preference,
  );
  expect(
    initialAiSelection(
      models,
      'gpt-6.1-sol',
      { model: 'gpt-6.1-sol', reasoning: 'high' },
      preference,
    ),
  ).toEqual({ model: 'gpt-6.1-sol', reasoning: 'high' });
  expect(
    initialAiSelection(
      models,
      'missing-model',
      { model: 'missing-model', reasoning: 'max' },
      preference,
    ),
  ).toEqual({ model: 'missing-model', reasoning: 'max' });
  expect(
    initialAiSelection(
      models.filter((m) => m.id !== 'gpt-6-astra'),
      null,
      null,
      preference,
    ),
  ).toEqual(preference);
  expect(
    initialAiSelection(
      models,
      'gpt-6-astra',
      { model: 'gpt-6.1-sol', reasoning: 'high' },
      preference,
    ),
  ).toEqual(preference);
});

it('keeps a selected unavailable model visible and disabled instead of showing another model', () => {
  const html = renderToStaticMarkup(
    createElement(ModelSelector, {
      models: [],
      value: 'gpt-6-astra',
      onChange: () => {},
    }),
  );
  expect(html).toContain('value="gpt-6-astra"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('chưa khả dụng');
});

it('groups used file citations by source/version and deduplicates the same page locator without hiding other pages', () => {
  const source = {
    sourceId: 'file',
    handle: 'S1',
    label: 'Quote.pdf',
    version: '1:hash',
    provenance: 'AI_DRAFT',
    page: 1,
    startLine: 1,
    endLine: 10,
  };
  const groups = citationGroups([
    source,
    { ...source, handle: 'S2' },
    { ...source, handle: 'S3', page: 10 },
    { ...source, handle: 'S4', version: '2:hash' },
  ]);
  expect(groups).toHaveLength(2);
  expect(groups[0]).toHaveLength(2);
  expect(groups[0]!.map((source) => source.page)).toEqual([1, 10]);
});

it.each(['FAILED', 'RUNNING', 'QUEUED'])(
  'shows a persisted checked XLSX even while the response is %s',
  (status) => {
    const html = renderToStaticMarkup(
      createElement(AiAnswer, {
        answer: {
          id: 'a',
          status,
          question: 'Original request',
          answer: null,
          sources: [],
          artifacts: [
            {
              sourceId: 'f',
              fileAssetId: 'f',
              version: '1:hash',
              filename: 'Verified.xlsx',
              format: 'xlsx',
              sizeBytes: 42,
              downloadUrl:
                '/api/v1/project-chat/projects/p/ai/files/f/download',
            },
          ],
        },
        onSource: () => {},
        onCancel: () => {},
        onRun: () => {},
      }),
    );
    expect(html).toContain('Verified.xlsx');
    expect(html).toContain(
      '/api/v1/project-chat/projects/p/ai/files/f/download',
    );
  },
);

it.each([true, false])(
  'offers explicit continuation only for an eligible deadline result (%s)',
  (canResume) => {
    const html = renderToStaticMarkup(
      createElement(AiAnswer, {
        onSource: () => undefined,
        onCancel: () => undefined,
        onRun: () => undefined,
        answer: {
          id: 'saved',
          status: 'PARTIAL',
          errorCode: 'RUN_DEADLINE',
          question: 'Create the file.',
          answer: 'Retained part.',
          sources: [],
          canResume,
        },
      }),
    );
    expect(html.includes('Tiếp tục công việc còn lại')).toBe(canResume);
    expect(html).toContain('Create the file.');
    expect(html).toContain('Retained part.');
  },
);

it('offers continuation for a safely saved Galaxy-limit failure', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      onSource: () => undefined,
      onCancel: () => undefined,
      onRun: () => undefined,
      answer: {
        id: 'saved',
        status: 'FAILED',
        errorCode: 'TOOL_ROUND_LIMIT',
        question: 'Create the file.',
        answer: null,
        sources: [],
        canResume: true,
      },
    }),
  );
  expect(html).toContain('Tiếp tục công việc còn lại');
  expect(html).toContain('Create the file.');
});

it('shows an incomplete document region with a human-readable reason and retains the original attachment', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      onSource: () => undefined,
      onCancel: () => undefined,
      onRun: () => undefined,
      answer: {
        id: 'partial',
        status: 'PARTIAL',
        question: 'Read all pages.',
        answer: 'Useful section.',
        sources: [],
        attachments: [
          {
            sourceId: 'source',
            filename: 'Report.pdf',
            sizeBytes: 100,
            mimeType: 'application/pdf',
            version: 'v1',
            status: 'READY',
            downloadUrl:
              '/api/v1/project-chat/projects/p/ai/files/source/download',
          },
        ],
        documentReadIssues: [
          { sourceId: 'source', page: 3, code: 'PDF_SCAN_REQUIRES_VISION' },
        ],
      },
    }),
  );
  expect(html).toContain('Report.pdf · trang 3');
  expect(html).toContain('cần đọc ảnh hoặc OCR');
  expect(html).toContain(
    'href="/api/v1/project-chat/projects/p/ai/files/source/download"',
  );
  expect(html).not.toContain('PDF_SCAN_REQUIRES_VISION');
});

it('keeps partial PDF coverage visible and separates text extraction from unverified image and model reading', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      onSource: () => undefined,
      onCancel: () => undefined,
      onRun: () => undefined,
      answer: {
        id: 'coverage',
        status: 'COMPLETED',
        question: 'Read the PDF.',
        answer: 'A partial result.',
        sources: [],
        pdfCoverage: [
          {
            sourceId: 'source',
            label: 'Report.pdf',
            pagesTotal: 20,
            completeTextPages: [1, 20],
            partialTextPages: [],
            textCoverage: 'PARTIAL',
          },
        ],
      },
    }),
  );
  expect(html).toContain('Report.pdf');
  expect(html).toContain('đã trích đủ chữ 2/20 trang');
  expect(html).toContain(
    'Đây là bản trích chữ; hình ảnh cần được xử lý riêng khi yêu cầu cần.',
  );
  expect(html).not.toContain('AI đã đọc toàn bộ');
});
it('shows workbook sheet, row and cell coverage without claiming formula execution or full model reading', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      onSource: () => undefined,
      onCancel: () => undefined,
      onRun: () => undefined,
      answer: {
        id: 'workbook',
        status: 'PARTIAL',
        question: 'Read all sheets.',
        answer: 'Useful cached values.',
        sources: [],
        xlsxCoverage: [
          {
            sourceId: 'private-source-uuid',
            label: 'Report.xlsx',
            textCoverage: 'PARTIAL',
            sheets: [
              {
                name: 'Quote',
                rows: 3,
                completeRows: 3,
                cellsRead: 3,
                cellsTotal: 3,
                textCoverage: 'FULL',
                nextMissingRange: null,
              },
              {
                name: 'Other',
                rows: 2,
                completeRows: 1,
                cellsRead: 2,
                cellsTotal: 4,
                textCoverage: 'PARTIAL',
                nextMissingRange: 'A2:B2',
              },
            ],
          },
        ],
      },
    }),
  );
  expect(html).toContain('đã trích đủ 1/2 sheet, 5/7 ô');
  expect(html).toContain('Other: 1/2 hàng');
  expect(html).toContain('A2:B2');
  expect(html).toContain('Giá trị lưu sẵn từ nguồn; công thức chưa tính lại.');
  expect(html).not.toContain('private-source-uuid');
});

it('identifies two PDFs and keeps partial page evidence visible after failure', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      onSource: () => undefined,
      onCancel: () => undefined,
      onRun: () => undefined,
      answer: {
        id: 'coverage-many',
        status: 'FAILED',
        question: 'Read both.',
        answer: 'A partial result.',
        sources: [],
        pdfCoverage: [
          {
            sourceId: 'one',
            label: 'First.pdf',
            pagesTotal: 20,
            completeTextPages: [1, 2],
            partialTextPages: [],
            textCoverage: 'PARTIAL',
          },
          {
            sourceId: 'two',
            label: 'Second.pdf',
            pagesTotal: 20,
            completeTextPages: [],
            partialTextPages: [1],
            textCoverage: 'PARTIAL',
          },
        ],
      },
    }),
  );
  expect(html).toMatch(/First\.pdf[^<]*đã trích đủ chữ 2\/20 trang/);
  expect(html).toMatch(/Second\.pdf[^<]*đã trích đủ chữ 0\/20 trang/);
  expect(html).toContain('1 trang mới đọc một phần');
});

it('shows the authorized input image on the user side and links an explicit public reference', () => {
  const handle = 'T_' + 'a'.repeat(24);
  const downloadUrl = '/api/v1/files/f/download?version=2';
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'Read this image.',
        answer: `Thông số [${handle}]`,
        sources: [
          {
            handle,
            label: 'Official',
            version: 'web:1',
            provenance: 'PUBLIC_WEB',
            startLine: 1,
            endLine: 2,
            web: { url: 'https://example.test/official', title: 'Official' },
          },
        ],
        attachments: [
          {
            sourceId: 'f',
            filename: 'Input.png',
            sizeBytes: 42,
            mimeType: 'image/png',
            version: '2:hash',
            status: 'READY',
            downloadUrl,
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain(`src="${downloadUrl}"`);
  expect(html.indexOf(`src="${downloadUrl}"`)).toBeLessThan(
    html.indexOf('Câu trả lời Galaxy AI'),
  );
  expect(html).toContain('alt="Input.png"');
  expect(html).toContain('href="https://example.test/official"');
});

it('allows an explicitly referenced retrieved image only from its current source proof', () => {
  const url = '/api/v1/files/f/download?version=1';
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'Q',
        answer: `![Ảnh nguồn](${url})`,
        sources: [
          {
            handle: 'T_' + 'd'.repeat(24),
            label: 'Source.png',
            version: '1:hash',
            provenance: 'AI_DRAFT',
            startLine: 1,
            endLine: 1,
            image: { url, filename: 'Source.png' },
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain(`src="${url}"`);
  expect(html.indexOf(`src="${url}"`)).toBeGreaterThan(
    html.indexOf('Câu trả lời Galaxy AI'),
  );
});

it('keeps native web attribution visible while internal provenance starts collapsed', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'Q',
        answer: '**Answer**',
        nativeWebCitations: [
          { url: 'https://example.com/official', title: 'Official source' },
        ],
        sources: [
          {
            handle: 'S_' + 'a'.repeat(24),
            label: 'Internal source',
            version: '1:hash',
            provenance: 'SOURCED',
            page: 1,
            startLine: 1,
            endLine: 2,
          },
        ],
      },
      onSource: () => {},
      onRun: () => {},
      onCancel: () => {},
    }),
  );
  const internal = html.indexOf('<summary>Nguồn trích dẫn');
  expect(internal).toBeGreaterThan(0);
  expect(html).toContain('href="https://example.com/official"');
  expect(html.indexOf('href="https://example.com/official"')).toBeLessThan(
    internal,
  );
  const beforeCitation = html.slice(
    0,
    html.indexOf('href="https://example.com/official"'),
  );
  expect((beforeCitation.match(/<details[ >]/g) ?? []).length).toBe(
    (beforeCitation.match(/<\/details>/g) ?? []).length,
  );
  expect(html).toContain('Internal source');
  expect(html).not.toMatch(/<details[^>]*\sopen[=> ]/);
});

it('shows a durable run phase and renders a partial answer with its retained file and attribution', () => {
  const render = (status: string) =>
    renderToStaticMarkup(
      createElement(AiAnswer, {
        answer: {
          id: 'a',
          status,
          question: 'Original',
          answer: '**Completed part**',
          sources: [],
          run: {
            runId: 'a',
            mode: 'DEEP',
            phase: 'READING',
            deadlineAt: '2026-10-11T00:30:00Z',
            heartbeatAt: null,
          },
          nativeWebCitations: [
            { url: 'https://example.com/source', title: 'Public source' },
          ],
          markdownUrl: '/api/v1/project-chat/projects/p/ai/answers/a/markdown',
          artifacts: [
            {
              sourceId: 'f',
              fileAssetId: 'f',
              version: '1:hash',
              filename: 'Partial.xlsx',
              format: 'xlsx',
              sizeBytes: 42,
              downloadUrl:
                '/api/v1/project-chat/projects/p/ai/files/f/download',
            },
          ],
        },
        onSource: () => {},
        onCancel: () => {},
        onRun: () => {},
      }),
    );
  expect(render('RUNNING')).toContain('Đang đọc tài liệu');
  const partial = render('PARTIAL');
  expect(partial).toContain('Kết quả một phần');
  expect(partial).toContain('<strong>Completed part</strong>');
  expect(partial).toContain('Partial.xlsx');
  expect(partial).toContain('href="https://example.com/source"');
  expect(partial).toContain('Tải Markdown');
  expect(partial).not.toContain('Dừng yêu cầu');
});

it.each([
  '/api/v1/project-chat/rooms/r/files/f/download',
  '/api/v1/project-chat/releases/r/download',
])('keeps an authorized original attachment link from %s', (downloadUrl) => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'QUEUED',
        question: 'Read.',
        answer: null,
        sources: [],
        attachments: [
          {
            sourceId: 'f',
            filename: 'Source.pdf',
            sizeBytes: 1000,
            mimeType: 'application/pdf',
            version: '1:abc',
            status: 'READY',
            downloadUrl,
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain(`href="${downloadUrl}"`);
  expect(html).toContain('Source.pdf');
});

it('renders the saved question with its original attachment even when inference fails', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'FAILED',
        question: 'Read this source.',
        answer: null,
        errorCode: 'INPUT_BUDGET_EXCEEDED',
        sources: [],
        attachments: [
          {
            sourceId: 'f',
            filename: 'Source.pdf',
            sizeBytes: 1_405_052,
            mimeType: 'application/pdf',
            version: '1:abc',
            status: 'QUEUED',
            downloadUrl: '/api/v1/project-chat/projects/p/ai/files/f/download',
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('Source.pdf');
  expect(html).toContain('Đã tải lên');
  expect(html).toContain(
    'href="/api/v1/project-chat/projects/p/ai/files/f/download"',
  );
  expect(html.indexOf('Source.pdf')).toBeLessThan(
    html.indexOf('Câu trả lời Galaxy AI'),
  );
  expect(html).not.toContain('AI đã đọc');
});

it('explains why verified native web remains unavailable in private Project chat', () => {
  expect(aiStatusLabel('SIWC_WEB_SEARCH_PRIVACY_UNVERIFIED')).toBe(
    'Tra cứu web trong chat Project chưa khả dụng vì cần tách truy vấn công khai khỏi dữ liệu riêng.',
  );
});

it('shows a partial-history notice only when authorized conversation turns remain omitted', () => {
  const answer = {
    id: 'a',
    status: 'COMPLETED',
    question: 'Q',
    answer: 'Text',
    sources: [],
    historyCompleteness: 'PARTIAL' as const,
  };
  const render = (historyCompleteness: 'PARTIAL' | 'COMPLETE') =>
    renderToStaticMarkup(
      createElement(AiAnswer, {
        answer: { ...answer, historyCompleteness },
        onSource: () => {},
        onCancel: () => {},
        onRun: () => {},
      }),
    );
  expect(render('PARTIAL')).toContain(
    'Một phần lịch sử hội thoại chưa được đưa vào lượt trả lời này',
  );
  expect(render('COMPLETE')).not.toContain('Một phần lịch sử');
});

it('saves only a completed source-verified answer as a private draft', () => {
  const props = {
    answer: {
      id: 'answer',
      status: 'COMPLETED',
      question: 'Q',
      answer: 'text',
      sources: [],
      memorySource: {
        kind: 'AI_ANSWER',
        id: 'answer',
        version: 'a'.repeat(64),
        locator: {},
      },
    },
    onSource: () => {},
    onCancel: () => {},
    onRun: () => {},
    onMemory: () => {},
  };
  expect(renderToStaticMarkup(createElement(AiAnswer, props))).toContain(
    'Lưu riêng vào bộ nhớ',
  );
  expect(
    renderToStaticMarkup(
      createElement(AiAnswer, {
        ...props,
        answer: { ...props.answer, status: 'ACCESS_REVOKED' },
      }),
    ),
  ).not.toContain('Lưu riêng vào bộ nhớ');
});

it('keeps member AI unavailable without provider management controls or diagnostics', () => {
  const html = renderToStaticMarkup(createElement(ChatGptConnection));
  expect(html).toContain('AI chưa được quản trị viên kích hoạt');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('Kết nối ChatGPT');
  expect(html).not.toContain('API key');
  expect(html).not.toContain('ELIGIBILITY');
  expect(html).not.toContain('href=');
  expect(html).not.toContain('CONNECTED');
});

it('thông báo GENERAL không đọc hồ sơ và phân biệt quota với credential', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        mode: 'GENERAL',
        status: 'COMPLETED',
        question: '2+2?',
        answer: '4',
        sources: [],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('Không sử dụng hồ sơ dự án');
  expect(aiStatusLabel('RATE_LIMITED_UNKNOWN')).toContain('chưa xác định');
  expect(aiStatusLabel('QUOTA_EXHAUSTED').toLowerCase()).toContain('hạn mức');
  expect(aiStatusLabel('INPUT_POLICY_DENIED')).toContain('phê duyệt');
});

it('giữ identity scope/Project/room và phiên bản nguồn riêng, không phụ thuộc thứ tự field', () => {
  expect(typeof aiSessionKey).toBe('function');
  expect(aiSessionKey('p', 'ALL', { fileAssetId: 'f', fileVersion: 1 })).toBe(
    aiSessionKey('p', 'ALL', { fileVersion: 1, fileAssetId: 'f' }),
  );
  const keys = [
    aiSessionKey('p', 'ALL'),
    aiSessionKey('p', 'CONSULTING'),
    aiSessionKey('q', 'ALL'),
    aiSessionKey('p', 'ALL', { roomId: 'r' }),
    aiSessionKey('p', 'ALL', { fileAssetId: 'f', fileVersion: 1 }),
    aiSessionKey('p', 'ALL', { fileAssetId: 'f', fileVersion: 2 }),
  ];
  expect(new Set(keys).size).toBe(keys.length);
});

it('chỉ đưa câu trả lời hoàn tất vào nháp khi người dùng yêu cầu, không tạo nút đăng tự động', () => {
  const answer = {
    id: 'a',
    status: 'COMPLETED',
    question: 'Soạn phản hồi',
    answer: 'Bản nháp từ nguồn',
    sources: [],
  };
  const props = {
    answer,
    onSource: () => {},
    onCancel: () => {},
    onRun: () => {},
    onDraft: () => {},
  };
  expect(renderToStaticMarkup(createElement(AiAnswer, props))).toContain(
    'Dùng làm nháp phản hồi',
  );
  expect(
    renderToStaticMarkup(
      createElement(AiAnswer, {
        ...props,
        answer: { ...answer, status: 'ACCESS_REVOKED' },
      }),
    ),
  ).not.toContain('Dùng làm nháp phản hồi');
});

it('renders truthful AI state and escaped answer with versioned backend citations', () => {
  expect(aiStatusLabel('NOT_CONFIGURED')).toContain('Chưa cấu hình');
  expect(aiStatusLabel('FAILED_UNKNOWN')).toContain('Không tự gọi lại');
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'GH-42?',
        answer: '<script>900 mm</script>',
        uncertainty: 'Chưa xác nhận',
        sources: [
          {
            handle: 'S_one',
            label: 'Tin nhắn #1',
            version: 'v1',
            provenance: 'UNCONFIRMED',
            startLine: 1,
            endLine: 2,
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Chưa xác nhận');
  expect(html).toContain('v1');
  expect(html).toContain('AI tạo');
  expect(html).not.toContain('33003');
});

it('never renders derived text or citations for revoked or cancelled answers', () => {
  for (const status of ['ACCESS_REVOKED', 'CANCELLED']) {
    const html = renderToStaticMarkup(
      createElement(AiAnswer, {
        answer: {
          id: 'a',
          status,
          question: 'old-private-question',
          answer: 'old-private-answer',
          uncertainty: 'old-private-note',
          sources: [],
        },
        onSource: () => {},
        onCancel: () => {},
        onRun: () => {},
      }),
    );
    expect(html).not.toContain('old-private-answer');
    expect(html).not.toContain('old-private-note');
    if (status === 'ACCESS_REVOKED')
      expect(html).not.toContain('old-private-question');
  }
});

it('renders model identity and actionable errors without hiding provider differences', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'Mẫu?',
        answer: '900 mm',
        sources: [],
        model: 'kira-3.5-pro',
        modelLabel: 'Kira 3.5 Pro',
        provider: 'kira',
        providerLabel: 'Kira',
        createdAt: '2026-10-03T00:00:00Z',
        usage: { input_tokens: 40, output_tokens: 20 },
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('Kira 3.5 Pro');
  expect(html).not.toContain('Google trực tiếp');
  expect(html).toContain('40');
  expect(aiStatusLabel('DATA_POLICY_BLOCKED')).toContain('chưa được phép');
  expect(aiStatusLabel('INVALID_KEY')).toContain('khóa');
});

it('không đưa model chưa bật vào composer', () => {
  const model = {
    id: 'kira-3.5-pro',
    provider: 'kira',
    label: 'Kira 3.5 Pro',
    providerLabel: 'Kira',
    host: 'kiraai.vn',
    available: false,
    reason: 'NOT_CONFIGURED',
    credentialConfigured: false,
    credentialPresent: false,
    credentialState: 'MISSING_CREDENTIAL',
    providerReady: false,
    providerReason: 'MISSING_CREDENTIAL',
    sourcePolicy: 'DENIED',
    configLoaded: true,
    lastTest: 'NOT_RUN',
    adminEnabled: false,
    accountVisible: false,
    textLiveVerified: false,
    revision: null,
    capabilities: {
      reasoningModes: ['default'],
      imageInput: false,
      pdfInput: false,
    },
    limits: { requestsPerDay: null, concurrent: 1, outputTokens: 8192 },
  };
  const html = renderToStaticMarkup(
    createElement(ModelSelector, {
      models: [model],
      value: '',
      onChange: () => {},
    }),
  );
  expect(html).not.toContain('kira-3.5-pro');
  expect(html).not.toContain('Chưa có khóa thay thế');
});

it('giữ chẩn đoán khóa ngoài danh sách model composer', () => {
  const model = {
    id: 'kira-3.5-pro',
    provider: 'kira',
    label: 'Kira 3.5 Pro',
    providerLabel: 'Kira',
    host: 'kiraai.vn',
    available: false,
    reason: 'MISSING_CREDENTIAL',
    credentialConfigured: false,
    credentialPresent: false,
    credentialState: 'STORE_UNREADABLE',
    providerReady: false,
    providerReason: 'MISSING_CREDENTIAL',
    sourcePolicy: 'DENIED',
    configLoaded: false,
    lastTest: 'NOT_RUN',
    adminEnabled: false,
    accountVisible: false,
    textLiveVerified: false,
    revision: null,
    capabilities: {
      reasoningModes: ['default'],
      imageInput: false,
      pdfInput: false,
    },
    limits: { requestsPerDay: null, concurrent: 1, outputTokens: 8192 },
  };
  const html = renderToStaticMarkup(
    createElement(ModelSelector, {
      models: [model],
      value: '',
      onChange: () => {},
    }),
  );
  expect(html).not.toContain('Không đọc được kho khóa');
  expect(html).not.toContain('Chưa có khóa thay thế');
  expect(aiStatusLabel('CREDENTIAL_NOT_CONFIRMED')).toContain('đã có khóa');
});

it('localizes configuration/source errors and preserves an existing Vietnamese server message', () => {
  expect(aiStatusLabel('SOURCE_UNAVAILABLE')).toContain('Nguồn');
  expect(aiStatusLabel('INVALID_CONFIG')).toContain('Cấu hình');
  expect(aiStatusLabel('Vui lòng thử lại', 'Vui lòng thử lại')).toBe(
    'Vui lòng thử lại',
  );
});

it('preserves the answer status label when its detailed error code has no label', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'NO_SOURCES',
        errorCode: 'NO_READABLE_INDEXED_SOURCE',
        question: 'Nguồn?',
        answer: null,
        sources: [],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain(aiStatusLabel('NO_SOURCES'));
  expect(html).not.toContain('Trạng thái chưa xác định');
});

it('labels requested OpenRouter separately from actual returned model and sourced zero cost', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'router-a',
        status: 'COMPLETED',
        mode: 'GENERAL',
        model: 'openrouter/free',
        modelLabel: 'OpenRouter — Tự chọn model miễn phí',
        provider: 'openrouter',
        returnedModel: 'supplier/actual:free',
        question: 'Dịch câu.',
        answer: 'Bản dịch.',
        sources: [],
        usage: { input_tokens: 12, output_tokens: 6 },
        cost: { status: 'KNOWN', value: 0, source: 'usage.cost' },
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('Qua OpenRouter');
  expect(html).toContain('supplier/actual:free');
  expect(html).toContain('usage.cost');
  expect(html).not.toContain('Chi phí tiền chưa xác định');
  expect(aiStatusLabel('PROVIDER_PAUSED')).toContain('tạm dừng');
});

it.each(['TEMPORARY_ERROR', 'RATE_LIMITED_UNKNOWN'])(
  'shows paused before historical health %s and keeps the option disabled',
  (healthCode) => {
    const html = renderToStaticMarkup(
      createElement(ModelSelector, {
        models: [
          {
            id: 'paused-model',
            provider: 'mistral',
            label: 'Paused provider',
            providerLabel: 'Mistral',
            host: 'api.mistral.ai',
            available: false,
            generalAvailable: false,
            paused: true,
            reason: 'PROVIDER_PAUSED',
            providerReason: 'PROVIDER_PAUSED',
            credentialState: 'LOADED',
            credentialConfigured: true,
            credentialPresent: true,
            providerReady: false,
            sourcePolicy: 'DENIED',
            configLoaded: true,
            lastTest: 'NOT_RUN',
            adminEnabled: true,
            accountVisible: false,
            textLiveVerified: false,
            revision: 'r1',
            health: { status: 'DEGRADED', code: healthCode },
            capabilities: {
              reasoningModes: ['default'],
              imageInput: false,
              pdfInput: false,
            },
            limits: { requestsPerDay: null, concurrent: 1, outputTokens: 8192 },
          },
        ],
        value: '',
        onChange: () => {},
      }),
    );
    expect(html).not.toContain('Nhà cung cấp đang tạm dừng');
    expect(html).not.toContain(aiStatusLabel(healthCode));
    expect(html).not.toContain('paused-model');
  },
);

it('tách câu hỏi và answer thành hai vùng đọc, citation ở trong answer thay vì metadata kỹ thuật thường trực', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'answer',
        status: 'COMPLETED',
        question: 'Mã cửa?',
        answer: 'A-724',
        model: 'openrouter/free',
        provider: 'openrouter',
        sources: [
          {
            handle: 'S1',
            label: 'Cửa.pdf',
            version: '2:hash',
            provenance: 'UNCONFIRMED',
            page: 2,
            startLine: 1,
            endLine: 4,
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('aria-label="Câu trả lời Galaxy AI"');
  expect(html.indexOf('Mã cửa?')).toBeLessThan(
    html.indexOf('aria-label="Câu trả lời Galaxy AI"'),
  );
  expect(html.indexOf('Cửa.pdf')).toBeGreaterThan(
    html.indexOf('aria-label="Câu trả lời Galaxy AI"'),
  );
  expect(html).toContain('Nguồn trích dẫn');
});

it('hiện hoạt động công cụ thật đang chạy, không giả phần trăm hoặc lộ arguments', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'tool',
        status: 'RUNNING',
        toolActivity: 'Đang tra cứu nguồn công khai',
        question: 'Tra thông số',
        answer: null,
        sources: [],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('Đang tra cứu nguồn công khai');
  expect(html).not.toContain('50%');
});

it('file bản nháp là thẻ tải thật, chỉ hiện ở answer hoàn tất', () => {
  const props = {
    answer: {
      id: 'a',
      status: 'COMPLETED',
      question: 'Xuất bảng',
      answer: 'Đã tạo bản nháp.',
      sources: [],
      artifacts: [
        {
          sourceId: 's',
          fileAssetId: 'f',
          version: '1:hash',
          filename: 'Bảng kiểm chứng.xlsx',
          format: 'xlsx',
          sizeBytes: 1234,
          downloadUrl: '/api/v1/project-chat/projects/p/ai/files/s/download',
          diff: { added: ['Mới'], removed: ['Cũ'], coverage: 'Văn bản' },
        },
      ],
    },
    onSource: () => {},
    onRun: () => {},
    onCancel: () => {},
  };
  const html = renderToStaticMarkup(createElement(AiAnswer, props));
  expect(html).toContain('Bảng kiểm chứng.xlsx');
  expect(html).toContain('Chưa phê duyệt');
  expect(html).toContain(props.answer.artifacts[0]!.downloadUrl);
  const hidden = renderToStaticMarkup(
    createElement(AiAnswer, {
      ...props,
      answer: { ...props.answer, status: 'ACCESS_REVOKED' },
    }),
  );
  expect(hidden).not.toContain('Bảng kiểm chứng.xlsx');
});

it('offers a scoped preview for downloadable draft artifacts', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'a',
        status: 'COMPLETED',
        question: 'Q',
        answer: 'Draft',
        sources: [],
        artifacts: [
          {
            sourceId: 's',
            fileAssetId: 'f',
            version: '1:h',
            filename: 'Draft.pdf',
            format: 'pdf',
            sizeBytes: 100,
            downloadUrl: '/api/v1/project-chat/projects/p/ai/files/s/download',
          },
        ],
      },
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
    }),
  );
  expect(html).toContain('Xem trước Draft.pdf');
  expect(html).not.toContain('<iframe');
});

it('explains a failed SIWC deadline without implying an automatic retry', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      onSource: () => {},
      onCancel: () => {},
      onRun: () => {},
      answer: {
        id: 'timeout',
        question: 'Synthetic deadline',
        sources: [],
        status: 'FAILED',
        errorCode: 'PROVIDER_TIMEOUT',
        answer: null,
      },
    }),
  );
  expect(html).toContain('Đã hết thời gian xử lý');
  expect(html).toContain('Không tự gọi lại');
});

it('offers a scoped Markdown download only for a completed answer', () => {
  const render = (status: string, markdownUrl: string) =>
    renderToStaticMarkup(
      createElement(AiAnswer, {
        answer: {
          id: 'a',
          status,
          question: 'Q',
          answer: 'Text',
          sources: [],
          markdownUrl,
        },
        onSource: () => {},
        onCancel: () => {},
        onRun: () => {},
      }),
    );
  const url = '/api/v1/project-chat/projects/p/ai/answers/a/markdown';
  expect(render('COMPLETED', url)).toContain(`href="${url}"`);
  expect(render('COMPLETED', url)).toContain('Tải Markdown');
  expect(render('FAILED', url)).not.toContain('Tải Markdown');
  expect(render('ACCESS_REVOKED', url)).not.toContain('Tải Markdown');
  expect(render('COMPLETED', 'https://outside.example/export')).not.toContain(
    'Tải Markdown',
  );
});
