import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AiAnswer } from './project-ai';
import { readAiDraft } from './ai-draft';

it('shows the saved answer and a specific Excel import failure in the main response', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'job',
        status: 'RUNNING',
        question: 'chuyển sang excel',
        answer: 'The full saved answer.',
        sources: [],
        route: 'MCP_EVENTS',
        mcpJob: {
          state: 'ERROR',
          progress: null,
          errorCode: 'MCP_ARTIFACT_WORKBOOK_READ_FAILED',
          requestedOutputs: ['xlsx'],
          updatedAt: new Date().toISOString(),
        },
      },
      onRun: () => {},
      onCancel: () => {},
      onSource: () => {},
    }),
  );
  expect(html).toContain('The full saved answer.');
  expect(html).toContain(
    'Đã nhận nội dung trả lời. Chưa tải được tệp Excel về Galaxy.',
  );
  expect(html).not.toContain('Đã hoàn thành');
  expect(html).toContain('Thử lại nhận tệp');
});

it('shows persisted Work text while the required workbook is still failing', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'job',
        status: 'RUNNING',
        question: 'Create XLSX',
        answer: 'Saved partial response',
        sources: [],
        route: 'MCP_EVENTS',
        mcpJob: {
          state: 'RECEIVING_FILES',
          progress: 'Đang lưu XLSX',
          errorCode: 'MCP_FILE_DOWNLOAD_FAILED',
          requestedOutputs: ['xlsx'],
          updatedAt: '2026-10-14T00:00:00Z',
        },
      },
      onRun: () => {},
      onCancel: () => {},
      onSource: () => {},
    }),
  );
  expect(html).toContain('Saved partial response');
  expect(html).toContain('chưa hoàn tất');
  expect(html).not.toContain('Đã hoàn thành');
});

it('retains AUTO executor without requiring a model for a direct data query', () => {
  const draft = readAiDraft(
    JSON.stringify({
      version: 1,
      execution: 'AUTO',
      question: 'OS đang có bao nhiêu dự án?',
      sourceIds: [],
    }),
  );
  expect(draft?.execution).toBe('AUTO');
});

it('does not describe a Work job waiting for subscription as processing an answer', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'job',
        status: 'RUNNING',
        question: 'chao',
        answer: null,
        sources: [],
        route: 'MCP_EVENTS',
        mcpJob: {
          state: 'WAITING_SUBSCRIPTION',
          progress: null,
          errorCode: null,
          requestedOutputs: [],
          updatedAt: '2026-10-13T19:12:50.754Z',
        },
      },
      onRun: () => {},
      onCancel: () => {},
      onSource: () => {},
    }),
  );
  expect(html).toContain('Chờ kết nối hoặc đăng ký theo dõi');
  expect(html).not.toContain('Đang xử lý câu trả lời');
  expect(html).toContain('✦ ChatGPT Work');
});

it('shows recorded MCP file receipt progress without declaring completion', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'job',
        status: 'RUNNING',
        question: 'Original quotation request',
        answer: null,
        sources: [],
        route: 'MCP_EVENTS',
        mcpJob: {
          state: 'RECEIVING_FILES',
          progress: 'Đang lưu workbook vào Galaxy.',
          errorCode: null,
          requestedOutputs: ['xlsx'],
          updatedAt: '2026-10-12T07:00:00Z',
        },
      },
      onRun: () => {},
      onCancel: () => {},
      onSource: () => {},
    }),
  );
  expect(html).toContain('ChatGPT Work');
  expect(html).toContain('Đang nhận tệp');
  expect(html).toContain('Đang lưu workbook vào Galaxy.');
  expect(html).not.toContain('Đã hoàn thành');
});

it.each(['MCP_EVENTS', 'AUTO'] as const)(
  'retains the chosen %s route and every selected source in a recoverable draft',
  (execution) => {
    const sourceIds = ['001', '002', '003', '004'].map(
      (suffix) => '3af3b901-214a-4b5c-8c49-45c911b59' + suffix,
    );
    const draft = readAiDraft(
      JSON.stringify({
        version: 1,
        execution,
        question: 'Read these four files',
        sourceIds,
      }),
    );
    expect(draft?.execution).toBe(execution);
    expect(draft?.sourceIds).toEqual(sourceIds);
  },
);

it('shows saved video bytes and collapses completed MCP progress', () => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'job',
        status: 'COMPLETED',
        question: 'Make video',
        answer: 'Saved answer',
        sources: [],
        route: 'MCP_EVENTS',
        mcpJob: {
          state: 'COMPLETED',
          progress: 'Đã lưu tệp',
          errorCode: null,
          requestedOutputs: ['mp4'],
          updatedAt: '2026-10-13T10:00:00Z',
        },
        artifacts: [
          {
            sourceId: 'source',
            fileAssetId: 'asset',
            version: '1:checksum',
            filename: 'result.mp4',
            sizeBytes: 1000,
            format: 'mp4',
            downloadUrl: '/api/v1/project-chat/projects/p/ai/files/f/download',
            diff: null,
          },
        ],
      },
      onRun: () => {},
      onCancel: () => {},
      onSource: () => {},
    }),
  );
  expect(html).toContain('<video');
  expect(html).toContain('controls');
  expect(html).toMatch(
    /<details[^>]*><summary>Tiến độ công việc<\/summary>[\s\S]*Đã lưu tệp/,
  );
});

it.each([
  'MCP_ARTIFACT_STORAGE_LIMIT',
  'MCP_ARTIFACT_STORAGE_SPACE_EXHAUSTED',
  'MCP_ARTIFACT_STORAGE_QUOTA_EXCEEDED',
])('shows a capacity recovery action for %s in the main chat', (errorCode) => {
  const html = renderToStaticMarkup(
    createElement(AiAnswer, {
      answer: {
        id: 'capacity-job',
        question: 'Create XLSX',
        status: 'RUNNING',
        answer: 'Saved text',
        sources: [],
        route: 'MCP_EVENTS',
        mcpJob: {
          state: 'ERROR',
          progress: null,
          errorCode,
          requestedOutputs: ['xlsx'],
          updatedAt: new Date().toISOString(),
        },
      },
      onRun: () => {},
      onCancel: () => {},
      onSource: () => {},
    }),
  );
  expect(html).toContain('dung lượng');
  expect(html).toContain('sau khi xử lý');
});
