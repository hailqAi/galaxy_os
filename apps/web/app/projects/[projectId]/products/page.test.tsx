import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ProductTable } from './page';

it('P05 dùng ID và cấu hình thật, không biến phê duyệt thành hợp đồng đã ký hoặc tiến độ thi công', () => {
  const html = renderToStaticMarkup(
    <ProductTable
      projectId="project-a"
      onSelect={() => {}}
      items={[
        {
          id: 'line-a',
          code: 'D-01',
          positionName: 'Cửa chính',
          currentRevision: 2,
          lifecycleStatus: 'CLIENT_APPROVED',
          blocker: 'Cần xác nhận kích thước',
          location: { name: 'Tầng 1' },
          revisions: [
            {
              revision: 2,
              product: null,
              customProductName: 'Cửa gỗ',
              material: 'Gỗ',
              finish: 'Sơn',
              quantity: '2',
              unit: 'bộ',
              customerApprovalStatus: 'APPROVED',
              technicalApprovalStatus: 'PENDING',
              commercialApprovalStatus: 'DRAFT',
            },
          ],
        },
      ]}
    />,
  );
  expect(html).toContain('Cần xác nhận kích thước');
  expect(html).toContain('/projects/project-a/products/line-a');
  expect(html).toContain('Cửa gỗ');
  expect(html).not.toContain('Đã ký');
  expect(html).not.toContain('%');
});
