import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  AiAnswer,
  aiStatusLabel,
  ModelSelector,
  aiSessionKey,
} from './project-ai';

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
  expect(html).toMatch(/<option[^>]*value="kira-3.5-pro"[^>]*disabled=""/);
  expect(html).toContain('Chưa có khóa thay thế');
});

it('shows credential diagnostics before a legacy provider reason', () => {
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
  expect(html).toContain('Không đọc được kho khóa');
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
    expect(html).toContain('Nhà cung cấp đang tạm dừng');
    expect(html).not.toContain(aiStatusLabel(healthCode));
    expect(html).toMatch(/<option[^>]*value="paused-model"[^>]*disabled=""/);
  },
);
