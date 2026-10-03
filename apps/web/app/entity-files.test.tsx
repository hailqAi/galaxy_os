import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FileTable } from './entity-files';

it('P06 tách phiên bản, quyền tải và trạng thái AI khỏi phê duyệt nghiệp vụ', () => {
  const file = {
    id: 'file-a',
    originalFilename: 'Hồ sơ A.txt',
    mimeType: 'text/plain',
    sizeBytes: '42',
    category: 'PROJECT_DOCUMENT',
    version: 3,
    createdAt: '2026-10-04',
    uploadedBy: { displayName: 'Lan' },
    attachments: [],
  };
  const html = renderToStaticMarkup(
    <FileTable items={[file]} canDownload={false} onSelect={() => {}} />,
  );
  expect(html).toContain('Hồ sơ A.txt');
  expect(html).toContain('v3');
  expect(html).not.toContain('/download');
  expect(html).not.toContain('Đã duyệt');
  expect(html).not.toContain('AI xử lý xong');
});
