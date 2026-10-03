import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AiAnswer, aiStatusLabel, ModelSelector } from './project-ai';

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

it('keeps unavailable models visible and disabled with reasons', () => {
  const model = {
    id: 'kira-3.5-pro',
    provider: 'kira',
    label: 'Kira 3.5 Pro',
    providerLabel: 'Kira',
    host: 'kiraai.vn',
    available: false,
    reason: 'NOT_CONFIGURED',
    credentialConfigured: false,
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
  expect(html).toMatch(/<option[^>]*value="kira-3.5-pro"[^>]*disabled=""/);
  expect(html).toContain('Chưa cấu hình');
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
