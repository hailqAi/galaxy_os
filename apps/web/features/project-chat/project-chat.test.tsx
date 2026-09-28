import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ChatComposer, mergeMessages } from './project-chat';
import {
  releaseSourceKey,
  releasePrepareBody,
  releasePrepareIdentity,
  SourceReviewLabel,
} from './chat-controls';

describe('M2-A chat UI', () => {
  it('deduplicates the same persisted message after polling and keeps server sequence', () => {
    const a = {
      id: 'a',
      sequence: 1,
      body: 'Một',
      authorId: 'u',
      createdAt: '2026-09-28',
      attachments: [],
    };
    const b = { ...a, id: 'b', sequence: 2 };
    expect(mergeMessages([b], [a, b]).map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('renders read-only and escaped text without a fake AI button', () => {
    const html = renderToStaticMarkup(
      createElement(ChatComposer, {
        value: '<script>bad()</script>',
        disabled: true,
        reason: 'Bạn chỉ có quyền xem',
        sending: false,
        onChange: () => {},
        onSubmit: () => {},
      }),
    );
    expect(html).toContain('disabled');
    expect(html).toContain('Bạn chỉ có quyền xem');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('Hỏi GPT');
  });
});

it('labels a draft contract snapshot as information without inferring business approval', () => {
  const html = renderToStaticMarkup(
    createElement(SourceReviewLabel, {
      source: { sourceType: 'CONTRACT', title: 'Hợp đồng dự thảo' },
    }),
  );
  expect(html).toContain('Hợp đồng dự thảo');
  expect(html).toContain('Bản thông tin từ hồ sơ');
  expect(html).not.toContain('Nguồn đã duyệt');
});

it('keeps proposal selection compatible and distinguishes contract information from its file', () => {
  expect(
    releaseSourceKey({
      sourceType: 'PROPOSAL',
      sourceId: 'proposal',
      version: 1,
      name: 'P',
    }),
  ).toBe('proposal');
  const contract = {
    sourceId: 'contract',
    sourceFingerprint: 'fingerprint',
    version: 1,
    name: 'C',
  };
  expect(releaseSourceKey({ ...contract, sourceType: 'CONTRACT' })).not.toBe(
    releaseSourceKey({ ...contract, sourceType: 'CONTRACT_FILE' }),
  );
  expect(
    releaseSourceKey({ ...contract, sourceType: 'CONTRACT_FILE' }),
  ).not.toBe(
    releaseSourceKey({
      ...contract,
      sourceType: 'CONTRACT_FILE',
      sourceFingerprint: 'changed',
    }),
  );
  expect(
    releaseSourceKey({ ...contract, sourceType: 'CUSTOMER_PAYMENT_RECORD' }),
  ).not.toBe(
    releaseSourceKey({ ...contract, sourceType: 'CUSTOMER_PAYMENT_FILE' }),
  );
});

it('prepares the selected contract binary version with source fingerprint and retry key', () => {
  expect(
    releasePrepareBody(
      {
        sourceType: 'CONTRACT_FILE',
        sourceId: 'contract',
        version: 1,
        name: 'C',
        sourceFingerprint: 'fingerprint',
      },
      {
        id: 'file',
        version: 2,
        filename: 'hop-dong.txt',
        mimeType: 'text/plain',
        sizeBytes: '42',
      },
      'retry-key',
    ),
  ).toEqual({
    sourceType: 'CONTRACT_FILE',
    sourceId: 'contract',
    fileId: 'file',
    version: 2,
    sourceFingerprint: 'fingerprint',
    clientKey: 'retry-key',
    appendixId: undefined,
  });
});

it('prepares an employee supplied payment file using its binary version and typed source', () => {
  expect(
    releasePrepareBody(
      {
        sourceType: 'CUSTOMER_PAYMENT_FILE',
        sourceId: 'payment',
        version: 1,
        name: 'Khoản thu',
        sourceFingerprint: 'payment-fingerprint',
      },
      {
        id: 'evidence',
        version: 3,
        filename: 'chung-tu.txt',
        mimeType: 'text/plain',
        sizeBytes: '42',
      },
      'payment-key',
    ),
  ).toEqual({
    sourceType: 'CUSTOMER_PAYMENT_FILE',
    sourceId: 'payment',
    fileId: 'evidence',
    version: 3,
    sourceFingerprint: 'payment-fingerprint',
    clientKey: 'payment-key',
    appendixId: undefined,
  });
});

it('changes retry identity when actor, room, source revision or file version changes', () => {
  const source = {
    sourceType: 'CONTRACT_FILE' as const,
    sourceId: 'contract',
    version: 1,
    name: 'C',
    sourceFingerprint: 'revision-a',
  };
  const file = {
    id: 'file',
    version: 1,
    filename: 'f.txt',
    mimeType: 'text/plain',
    sizeBytes: '1',
  };
  const original = releasePrepareIdentity('room-a', 'actor-a', source, file);
  expect(releasePrepareIdentity('room-b', 'actor-a', source, file)).not.toBe(
    original,
  );
  expect(releasePrepareIdentity('room-a', 'actor-b', source, file)).not.toBe(
    original,
  );
  expect(
    releasePrepareIdentity(
      'room-a',
      'actor-a',
      { ...source, sourceFingerprint: 'revision-b' },
      file,
    ),
  ).not.toBe(original);
  expect(
    releasePrepareIdentity('room-a', 'actor-a', source, {
      ...file,
      version: 2,
    }),
  ).not.toBe(original);
  expect(
    releasePrepareIdentity(
      'room-a',
      'actor-a',
      { ...source, name: 'Renamed' },
      file,
    ),
  ).toBe(original);
});

it('labels the pinned contract file version as a review copy, not an approved or signed contract', () => {
  const html = renderToStaticMarkup(
    createElement(SourceReviewLabel, {
      source: {
        sourceType: 'CONTRACT_FILE',
        title: 'Hợp đồng browser',
        file: { id: 'f', version: 2, filename: 'hop-dong.txt' },
      },
    }),
  );
  expect(html).toContain('phiên bản file 2');
  expect(html).toContain('gửi khách xem xét');
  expect(html).not.toContain('Nguồn đã duyệt');
  expect(html).not.toContain('đã ký');
});

it('labels employee supplied payment evidence without claiming a bank receipt or reconciliation', () => {
  const html = renderToStaticMarkup(
    createElement(SourceReviewLabel, {
      source: {
        sourceType: 'CUSTOMER_PAYMENT_FILE',
        title: 'Khoản thu',
        file: { id: 'f', version: 3, filename: 'chung-tu.txt' },
      },
    }),
  );
  expect(html).toContain('Chứng từ khoản thu do nhân viên cung cấp');
  expect(html).toContain('phiên bản file 3');
  expect(html).toContain('chưa xác nhận đối soát');
  expect(html).not.toContain('Nguồn đã duyệt');
});

it('describes handover status and manual signing without verified signature claims', () => {
  const draft = renderToStaticMarkup(
    createElement(SourceReviewLabel, {
      source: {
        sourceType: 'HANDOVER',
        type: 'HANDOVER_MINUTES',
        handoverStatus: 'DRAFT',
        signedStatus: 'NOT_REQUIRED',
      },
    }),
  );
  expect(draft).toContain('Biên bản bàn giao');
  expect(draft).toContain('chưa hoàn tất');
  expect(draft).toContain('không yêu cầu ký');
  expect(draft).not.toContain('đã ký');
  const manual = renderToStaticMarkup(
    createElement(SourceReviewLabel, {
      source: {
        sourceType: 'HANDOVER',
        type: 'AS_BUILT_DRAWING',
        handoverStatus: 'COMPLETED',
        signedStatus: 'SIGNED_MANUALLY',
      },
    }),
  );
  expect(manual).toContain('Bản vẽ hoàn công');
  expect(manual).toContain('hoàn tất theo hồ sơ');
  expect(manual).toContain('ghi nhận ký thủ công');
  expect(manual).toContain('chưa xác minh chữ ký');
});
