import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardView } from './page';

const page = {
  items: [
    {
      id: 'project-1',
      code: 'PRJ-001',
      name: 'North tower',
      currentStage: 'STAGE_1',
      status: 'ACTIVE',
      healthStatus: 'ON_TRACK',
      progressPercentage: 20,
      updatedAt: '2026-08-21T08:30:00.000Z',
      stages: [
        { stageKey: 'STAGE_1', status: 'DONE' },
        { stageKey: 'STAGE_2', status: 'IN_PROGRESS' },
      ],
      currency: 'VND',
      expectedCompletionDate: null,
      customer: { displayName: 'Galaxy Centre' },
      projectManager: null,
      departments: [],
    },
  ],
  total: 47,
  page: 1,
  pageSize: 20,
  totalPages: 3,
};

describe('Project dashboard view', () => {
  it('renders the approved portfolio hierarchy and authorized project data', () => {
    const markup = renderToStaticMarkup(
      <DashboardView
        data={page}
        summary={{
          total: 47,
          active: 34,
          needsAttention: 3,
          completed: 10,
          permittedCommands: { create: true },
          estimatedValues: [
            { currency: 'VND', value: '123456789012345678.90' },
            { currency: 'USD', value: '42.50' },
          ],
        }}
      />,
    );

    expect(markup).toContain('TỔNG QUAN DỰ ÁN');
    expect(markup).toContain('47');
    expect(markup).toContain('Đang thực hiện');
    expect(markup).toContain('Cần xử lý');
    expect(markup).toContain('Đã hoàn thành');
    expect(markup).toContain('Tổng giá trị');
    expect(markup).toContain('VND 123.456.789.012.345.678,90');
    expect(markup).toContain('USD 42,50');
    expect(markup).toContain('TIẾN ĐỘ DANH MỤC DỰ ÁN');
    expect(markup).toContain('<progress');
    expect(markup).toContain('10/47 dự án đã hoàn thành');
    expect(markup).toContain('20%');
    expect(markup).not.toContain('baseline');
    expect(markup).not.toContain('actual');
    expect(markup).toContain('PRJ-001');
    expect(markup).toContain('North tower');
    expect(markup).toContain('aria-label="Tiến độ North tower"');
    expect(markup).toContain('value="20"');
    expect(markup).toContain('Giai đoạn 1');
    expect(markup).toContain('Đang hoạt động');
    expect(markup).toContain('Khách hàng');
    expect(markup).toContain('Quản lý dự án');
    expect(markup).toContain('Tiến độ');
    expect(markup).toContain('Giai đoạn đang xử lý');
    expect(markup).toContain('Cập nhật');
    expect(markup).toContain('Thao tác');
    expect(markup).toContain('MỞ DỰ ÁN');
    expect(markup).not.toContain('CHI TIẾT');
    expect(markup).toContain('sticky right-0');
    expect(markup.match(/href="\/projects\/project-1"/g) ?? []).toHaveLength(2);
    expect(markup).not.toContain('href="/projects/project-1/stage-1"');
    expect(markup).toContain('TẠO DỰ ÁN');
    expect(markup).not.toContain('<svg');
  });

  it('omits financial markup and renders loading, error, retry, empty and pagination states', () => {
    const permittedOnly = renderToStaticMarkup(
      <DashboardView
        data={page}
        summary={{
          total: 47,
          active: 34,
          needsAttention: 3,
          completed: 10,
          permittedCommands: { create: false },
        }}
      />,
    );
    expect(permittedOnly).not.toContain('Tổng giá trị');
    expect(permittedOnly).not.toContain('TẠO DỰ ÁN');
    for (const label of [
      'Giá trị hợp đồng',
      'Tổng đã thu',
      'Công nợ phải thu',
      'Công nợ phải trả',
      'Phê duyệt đang chờ',
      'Bảo hành/bảo trì đến hạn',
    ])
      expect(permittedOnly).not.toContain(label);
    expect(renderToStaticMarkup(<DashboardView loading />)).toContain(
      'Đang tải dự án…',
    );
    const error = renderToStaticMarkup(
      <DashboardView
        error="offline"
        onRetry={() => undefined}
        pagination={<span>1/3</span>}
      />,
    );
    expect(error).toContain('offline');
    expect(error).toContain('Thử lại');
    expect(error).toContain('1/3');
    expect(
      renderToStaticMarkup(
        <DashboardView data={page} dashboardError="dashboard offline" />,
      ),
    ).toContain('dashboard offline');
    expect(
      renderToStaticMarkup(
        <DashboardView
          data={{ ...page, items: [] }}
          summary={{
            total: 0,
            active: 0,
            needsAttention: 0,
            completed: 0,
            permittedCommands: { create: false },
          }}
        />,
      ),
    ).toContain('Chưa có dự án phù hợp.');
    expect(
      renderToStaticMarkup(
        <DashboardView
          data={{ ...page, items: [] }}
          summary={{
            total: 0,
            active: 0,
            needsAttention: 0,
            completed: 0,
            permittedCommands: { create: false },
          }}
        />,
      ),
    ).not.toContain('TIẾN ĐỘ DANH MỤC DỰ ÁN');
  });

  it('renders only the permitted KPI cards supplied by the dashboard', () => {
    const markup = renderToStaticMarkup(
      <DashboardView
        data={page}
        summary={{
          total: 1,
          active: 1,
          needsAttention: 0,
          completed: 0,
          permittedCommands: { create: false },
          contractValues: [{ currency: 'VND', value: '5000000.50' }],
          receivedValues: [{ currency: 'USD', value: '100.25' }],
          receivableValues: [{ currency: 'VND', value: '999.00' }],
          payableValues: [{ currency: 'THB', value: '700.00' }],
          pendingApprovals: 2,
          dueWarrantyAssets: 4,
          dueServiceTickets: 3,
        }}
      />,
    );

    expect(markup).toContain('Giá trị hợp đồng');
    expect(markup).toContain('Tổng đã thu');
    expect(markup).toContain('Công nợ phải thu');
    expect(markup).toContain('Công nợ phải trả');
    expect(markup).toContain('Phê duyệt đang chờ');
    expect(markup).toContain('Bảo hành/bảo trì đến hạn');
    expect(markup).toContain('Bảo hành 4 · Dịch vụ 3');
    expect(markup).toContain('VND 5.000.000,50');
    expect(markup).toContain('USD 100,25');
    expect(markup).toContain('THB 700,00');
  });
});
