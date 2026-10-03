import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperationalDashboard } from './page';

const data = {
  asOf: '2026-10-04T01:00:00Z',
  scope: 'AUTHORIZED',
  kpis: { activeLeads: 2, activeProjects: 3, overdueTasks: 1 },
  pipeline: [],
  projectHealth: [],
  attentionTasks: [
    {
      id: 'task-a',
      title: 'Đối chiếu nguồn',
      status: 'BLOCKED',
      priority: 'HIGH',
      dueDate: null,
      project: { id: 'p-a', name: 'Dự án A' },
      assignees: [{ user: { displayName: 'Linh' } }],
    },
  ],
};
describe('Tổng quan vận hành', () => {
  it('dẫn tới task thật, giữ người phụ trách và không bịa số tiền khi thiếu nguồn', () => {
    const html = renderToStaticMarkup(<OperationalDashboard data={data} />);
    expect(html).toContain('/tasks/task-a');
    expect(html).toContain('Linh');
    expect(html).toContain('Chưa có hạn');
    expect(html).not.toContain('0 VND');
    expect(html).toContain('Chưa có dữ liệu');
  });
  it('giữ số thập phân chính xác và tách đồng tiền, không gọi giá trị cơ hội là doanh thu', () => {
    const html = renderToStaticMarkup(
      <OperationalDashboard
        data={{
          ...data,
          opportunityValues: [
            { currency: 'VND', value: '9007199254740993.25' },
            { currency: 'USD', value: '25.50' },
          ],
        }}
      />,
    );
    expect(html).toContain('9.007.199.254.740.993,25');
    expect(html).toContain('25,50 USD');
    expect(html).not.toContain('doanh thu');
  });
  it('lỗi tải không biến thành KPI0', () => {
    const html = renderToStaticMarkup(
      <OperationalDashboard error="Không có quyền xem tổng quan" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('>0<');
  });
});
