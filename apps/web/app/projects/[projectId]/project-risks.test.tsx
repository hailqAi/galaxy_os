import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ProjectRisksView,
  allocateProjectRisk,
  createProjectRisk,
  type ProjectRisk,
} from './project-risks';

const risk: ProjectRisk = {
  id: 'risk-1',
  code: 'R-01',
  title: 'NCC giao hàng trễ',
  cause: 'Lead time tăng',
  event: 'Không giao đúng mốc',
  impact: 'Lùi lịch lắp đặt',
  category: 'SUPPLIER',
  stage: 'STAGE_TWO',
  ownerId: '11111111-1111-4111-8111-111111111111',
  likelihood: 3,
  impactScore: 4,
  priorityScore: 12,
  probability: '0.3',
  financialImpact: '100000000',
  emv: '30000000',
  status: 'OPEN',
  allocations: [],
};

describe('Project risk register', () => {
  it('renders project-scoped evidence, score, explicit EMV and allocation controls', () => {
    const markup = renderToStaticMarkup(
      <ProjectRisksView
        actorPermissions={[
          'project.update',
          'estimate.read',
          'estimate.update',
          'financial_margin.read',
        ]}
        access={{
          project: {
            id: 'project-1',
            code: 'PRJ-001',
            name: 'Galaxy Tower',
            currentStage: 'STAGE_2',
          },
          options: {
            projects: [
              { id: 'project-1', code: 'PRJ-001', name: 'Galaxy Tower' },
            ],
          },
          capabilities: {
            canSwitchProject: true,
            canManageProjectAccess: false,
          },
        }}
        estimateVersions={[{ id: 'version-1', label: 'EST-001 · V1' }]}
        members={[
          {
            userId: '11111111-1111-4111-8111-111111111111',
            user: { displayName: 'Nguyễn Minh' },
          },
        ]}
        onAllocate={async () => true}
        onCreate={async () => true}
        risks={[risk]}
      />,
    );

    expect(markup).toContain('/projects/project-1/risks');
    expect(markup).toContain('Nguyên nhân → sự kiện → ảnh hưởng');
    expect(markup).toContain(
      'Lead time tăng → Không giao đúng mốc → Lùi lịch lắp đặt',
    );
    expect(markup).toContain('12 / 25');
    expect(markup).toContain('30.000.000');
    expect(markup).toContain('Đang theo dõi');
    expect(markup).not.toContain('OPEN');
    expect(markup).toContain('PHÂN BỔ DỰ PHÒNG');
  });

  it('does not render financial risk values or allocation controls without estimate permissions', () => {
    const markup = renderToStaticMarkup(
      <ProjectRisksView
        actorPermissions={['project.read']}
        access={{
          project: {
            id: 'project-1',
            code: 'PRJ-001',
            name: 'Galaxy Tower',
            currentStage: 'STAGE_2',
          },
          options: { projects: [] },
          capabilities: {
            canSwitchProject: false,
            canManageProjectAccess: false,
          },
        }}
        estimateVersions={[]}
        members={[]}
        onAllocate={async () => true}
        onCreate={async () => true}
        risks={[
          {
            ...risk,
            probability: undefined,
            financialImpact: undefined,
            emv: undefined,
          },
        ]}
      />,
    );

    expect(markup).not.toContain('100.000.000');
    expect(markup).not.toContain('30.000.000');
    expect(markup).not.toContain('PHÂN BỔ DỰ PHÒNG');
    expect(markup).not.toContain('THÊM RỦI RO');
  });

  it('posts creation and allocation to the project risk API', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'saved' });
    await createProjectRisk(
      'project-1',
      {
        code: 'R-02',
        title: 'Tỷ giá tăng',
        cause: 'Biến động thị trường',
        event: 'Tỷ giá vượt giả định',
        impact: 'Tăng landed cost',
        category: 'FINANCIAL',
        stage: 'STAGE_TWO',
        ownerId: '11111111-1111-4111-8111-111111111111',
        likelihood: 3,
        impactScore: 5,
      },
      request,
    );
    await allocateProjectRisk(
      'project-1',
      'risk-1',
      {
        estimateVersionId: 'version-1',
        approvedAmount: '30000000',
        basis: 'EMV được duyệt',
      },
      request,
    );

    expect(request).toHaveBeenNthCalledWith(1, '/projects/project-1/risks', {
      method: 'POST',
      body: expect.stringContaining('"likelihood":3'),
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/projects/project-1/risks/risk-1/estimate-allocation',
      {
        method: 'POST',
        body: expect.stringContaining('"approvedAmount":"30000000"'),
      },
    );
  });
});
