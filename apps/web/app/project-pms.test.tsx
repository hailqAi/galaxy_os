import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProjectPmsError,
  ProjectPmsLoading,
  ProjectPmsOverview,
  ProjectPmsShell,
} from './project-pms';
import * as projectPms from './project-pms';

const project = {
  id: 'project-701',
  code: 'PRJ-701',
  name: 'Galaxy Tower Lobby',
  customer: { id: 'customer-1', displayName: 'Galaxy Centre' },
  location: 'Quận 1, TP.HCM',
  projectType: 'DESIGN_AND_BUILD',
  status: 'ACTIVE',
  healthStatus: 'AT_RISK',
  currentStage: 'STAGE_1',
  salesOwner: { displayName: 'Trần Anh' },
  projectManager: { displayName: 'Nguyễn Minh' },
  expectedCompletionDate: '2026-12-15T00:00:00.000Z',
};

const workspace = {
  project,
  stages: [
    ['STAGE_1', 'IN_PROGRESS', 40],
    ['STAGE_2', 'COMPLETED', 100],
    ['STAGE_3', 'BLOCKED', 25],
    ['STAGE_4', 'NOT_STARTED', 0],
    ['STAGE_5', 'NOT_STARTED', 0],
  ].map(([stageKey, status, progressPercent]) => ({
    stageKey: String(stageKey),
    title: String(stageKey),
    objective: `Mục tiêu ${stageKey}`,
    status: String(status),
    completedSteps: Number(progressPercent) / 20,
    totalSteps: 5,
    progressPercent: Number(progressPercent),
    updatedAt: null,
    nextAction: 'Tiếp tục giai đoạn',
  })),
};

const stageOne = {
  steps: [
    {
      id: 'step-1',
      step: 'ASSIGNMENT',
      status: 'DONE',
      ownerUserId: 'user-1',
      dueDate: '2026-08-15T00:00:00.000Z',
    },
    {
      id: 'step-2',
      step: 'SURVEY',
      status: 'BLOCKED',
      ownerUserId: null,
      dueDate: null,
    },
  ],
  requiredDocuments: { required: 8, approved: 3, rejected: 1, overdue: 1 },
  routing: {
    projectType: 'DESIGN_AND_BUILD',
    workstreams: ['PROJECT_MANAGEMENT', 'DESIGN', 'PROCUREMENT'],
    requiresSurvey: true,
    requiresPreliminaryFinance: true,
    riskLevel: 'HIGH',
  },
  readiness: {
    status: 'BLOCKED',
    satisfied: 3,
    total: 6,
    progress: 50,
    cards: [
      {
        key: 'PROJECT_DOSSIER',
        applicable: true,
        satisfied: 3,
        total: 4,
        status: 'IN_PROGRESS',
      },
      {
        key: 'FINANCE',
        applicable: true,
        satisfied: 0,
        total: 1,
        status: 'NOT_STARTED',
      },
    ],
  },
  redFlags: [
    {
      code: 'REQUIRED_DOCUMENT_REJECTED',
      severity: 'CRITICAL',
      title: 'Hồ sơ bắt buộc bị từ chối',
      description: 'Bản nộp cần được cập nhật.',
      owner: 'PROJECT_MANAGER',
      dueDate: '2026-08-09T00:00:00.000Z',
      route: '/projects/project-701/stage-1/documents',
      remediation: 'Cập nhật và nộp lại hồ sơ.',
    },
  ],
};

describe('Project PMS shell', () => {
  it('shows the same Project-delete action in the shared header only with capability', () => {
    const Header = projectPms.ProjectStageHeader;
    const props = {
      activeStage: 'STAGE_1' as const,
      canManageProjectAccess: false,
      canSwitchProject: true,
      project,
      projects: [project],
    };
    const allowed = renderToStaticMarkup(
      <Header {...props} canDeleteProject onProjectDeleted={() => undefined} />,
    );
    const denied = renderToStaticMarkup(<Header {...props} />);

    expect(allowed).toContain('Xóa dự án');
    expect(denied).not.toContain('Xóa dự án');
  });

  it('renders one invariant two-row header and drops old context when switching Projects', () => {
    const Header = (
      projectPms as unknown as {
        ProjectStageHeader?: React.ComponentType<{
          activeStage: 'STAGE_1';
          canManageProjectAccess: boolean;
          canSwitchProject: boolean;
          project: typeof project;
          projects: readonly { id: string; code: string; name: string }[];
        }>;
        projectStagePath?: (projectId: string, stageKey: string) => string;
      }
    ).ProjectStageHeader;
    const projectStagePath = (
      projectPms as unknown as {
        projectStagePath?: (projectId: string, stageKey: string) => string;
      }
    ).projectStagePath;

    expect(Header).toBeTypeOf('function');
    expect(projectStagePath).toBeTypeOf('function');
    expect(projectStagePath?.('project-702', 'STAGE_4')).toBe(
      '/projects/project-702/stage-4',
    );
    if (!Header) return;
    const markup = renderToStaticMarkup(
      <Header
        activeStage="STAGE_1"
        canManageProjectAccess={false}
        canSwitchProject
        project={project}
        projects={[
          { id: project.id, code: project.code, name: project.name },
          { id: 'project-702', code: 'PRJ-702', name: 'Galaxy Annex' },
        ]}
      />,
    );

    expect(markup.match(/data-project-stage-header=/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-project-stage-header-row=/g) ?? []).toHaveLength(
      2,
    );
    expect(markup).toContain('data-project-stage-header-row="stage"');
    expect(markup).toContain('data-project-stage-header-row="project"');
    expect(markup).toContain('GIAI ĐOẠN 1');
    expect(markup).toContain('KHỞI TẠO, HỒ SƠ DỰ ÁN &amp; PHÊ DUYỆT');
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(markup).toContain('PRJ-701');
    expect(markup).toContain('Galaxy Tower Lobby');
    expect(markup).toContain('PRJ-702 · Galaxy Annex');
    expect(markup).toContain('/projects/project-701/risks');
    expect(markup).toContain('RỦI RO');
    expect(markup).not.toContain('PHÂN QUYỀN DỰ ÁN');
  });

  it.each([
    ['STAGE_1', 'bg-blue-700'],
    ['STAGE_2', 'bg-indigo-600'],
    ['STAGE_3', 'bg-amber-600'],
    ['STAGE_4', 'bg-emerald-600'],
    ['STAGE_5', 'bg-teal-700'],
  ] as const)(
    'uses the %s accent only on the active Stage',
    (activeStage, accent) => {
      const Header = projectPms.ProjectStageHeader;
      const markup = renderToStaticMarkup(
        <Header
          activeStage={activeStage}
          canManageProjectAccess={false}
          canSwitchProject
          project={project}
          projects={[project]}
        />,
      );

      expect(markup).toMatch(
        new RegExp(
          `class="[^"]*${accent}[^"]*" data-stage-control="${activeStage}"`,
        ),
      );
      expect(markup.match(new RegExp(accent, 'g')) ?? []).toHaveLength(2);
    },
  );

  it('renders five independent overview cards with truthful nullable progress and direct Stage links', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsOverview
        project={project}
        stages={[
          {
            stageKey: 'STAGE_1',
            title: 'GĐ 1 — KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT',
            objective:
              'Hoàn thiện thông tin khởi tạo, hồ sơ chủ chốt và quy trình phê duyệt ban đầu.',
            status: 'Đang thực hiện',
            completedSteps: 2,
            totalSteps: 5,
            progressPercent: 40,
            updatedAt: '2026-08-04T00:00:00.000Z',
            nextAction: 'Tiếp tục Lập & Thẩm định hồ sơ đề xuất',
          },
          ...[
            ['STAGE_2', 'Chưa bắt đầu'],
            ['STAGE_3', 'Tạm dừng'],
            ['STAGE_4', 'Hoàn thành'],
            ['STAGE_5', 'Cần xử lý'],
          ].map(([stageKey, status]) => ({
            stageKey: String(stageKey),
            title: `GĐ ${String(stageKey).slice(-1)}`,
            objective: `Mục tiêu ${stageKey}`,
            status: String(status),
            completedSteps: null,
            totalSteps: null,
            progressPercent: null,
            updatedAt: null,
            nextAction: 'Bắt đầu giai đoạn',
          })),
        ]}
      />,
    );

    expect(markup).toContain('TỔNG QUAN TIẾN ĐỘ DỰ ÁN');
    expect(markup.match(/data-stage-overview=/g) ?? []).toHaveLength(5);
    expect(markup).toContain('2/5 bước');
    expect(markup).toContain('40%');
    expect(markup.match(/Chưa có tiến độ được ghi nhận/g) ?? []).toHaveLength(
      4,
    );
    for (let stage = 1; stage <= 5; stage += 1) {
      expect(markup).toContain(`href="/projects/project-701/stage-${stage}"`);
    }
    expect(markup.match(/MỞ GIAI ĐOẠN/g) ?? []).toHaveLength(5);
    for (const status of [
      'Chưa bắt đầu',
      'Đang thực hiện',
      'Tạm dừng',
      'Hoàn thành',
      'Cần xử lý',
    ]) {
      expect(markup).toContain(`data-status="${status}">${status}</span>`);
    }
    expect(markup).not.toContain('Không xác định:');
    for (let stage = 1; stage <= 5; stage += 1) {
      expect(markup).toContain(`aria-label="Mở GĐ ${stage}`);
    }
  });

  it('uses the supplied Stage 1 frame and keeps all five stages navigable', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        activeStage="STAGE_1"
        activeTab="/projects/project-701/stage-1/initiation"
        contextSlot={
          <label>
            Gói công việc
            <select aria-label="Gói công việc" />
          </label>
        }
        project={project}
        stageOne={stageOne}
        tabs={[
          { href: '/projects/project-701/stage-1', label: 'Tổng quan' },
          {
            href: '/projects/project-701/stage-1/initiation',
            label: 'Khởi tạo dự án',
          },
        ]}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('data-project-stage-header="STAGE_1"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Gói công việc');
    expect(markup).toContain('href="/projects/project-701/stage-1"');
    expect(markup).toContain('href="/projects/project-701/stage-1/initiation"');
    expect(markup).toContain('data-stage-control="STAGE_2"');
    expect(markup).toContain('href="/projects/project-701/stage-2"');
    expect(markup).toContain('href="/projects/project-701/stage-3"');
    expect(markup).toContain('href="/projects/project-701/stage-4"');
    expect(markup).toContain('href="/projects/project-701/stage-5"');
    expect(markup.match(/>GĐ[1-5]</g)).toHaveLength(5);
    expect(markup).not.toContain('aria-disabled');
    expect(markup).toMatch(/aria-label="Dự án đang chọn"[^>]*disabled=""/);
    expect(markup).toMatch(
      /^<div class="[^"]*mx-auto[^"]*w-full[^"]*max-w-\[1280px\]/,
    );
  });

  it('keeps the exact full Stage title to one heading', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={stageOne}
        workspace={workspace}
      />,
    );

    expect(
      markup.match(/KHỞI TẠO, HỒ SƠ DỰ ÁN &amp; PHÊ DUYỆT/g) ?? [],
    ).toHaveLength(1);
    expect(markup).toContain('GIAI ĐOẠN 1');
  });

  it('keeps the compact Stage 1 header stable with an incomplete customer', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={
          { ...project, currentStage: 'STAGE_3', customer: null } as never
        }
        stageOne={stageOne}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('Galaxy Tower Lobby');
    expect(markup).toContain('3/6 điều kiện');
    expect(markup).not.toContain('Khách hàng');
  });

  it('does not render a remediation link when the actor cannot act on its route', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={{
          ...stageOne,
          redFlags: [{ ...stageOne.redFlags[0]!, route: '' }],
        }}
        workspace={workspace}
      />,
    );

    expect(markup).not.toContain('>XỬ LÝ</a>');
    expect(markup).toContain('Bản nộp cần được cập nhật.');
    expect(markup).not.toContain('Cập nhật và nộp lại hồ sơ.');
  });

  it('can omit document navigation and its card for an actor without product view', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        showDocuments={false}
        stageOne={stageOne}
        tabs={[{ href: '/projects/project-701/stage-1', label: 'Tổng quan' }]}
        workspace={workspace}
      />,
    );

    expect(markup).not.toContain('MA TRẬN HỒ SƠ BẮT BUỘC');
    expect(markup).not.toContain(
      '/projects/project-701/documents?stageKey=STAGE_1',
    );
  });

  it('renders real project context and exactly five live stage links', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={stageOne}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('PRJ-701');
    expect(markup).toContain('KHỞI TẠO, HỒ SƠ DỰ ÁN &amp; PHÊ DUYỆT');
    expect(markup).toContain('Galaxy Tower Lobby');
    expect(markup).toContain('3/6 điều kiện');
    expect(markup).toContain('50%');
    expect(markup).not.toContain('Sales owner');
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(
      [...markup.matchAll(/href="([^"]+)"/g)].map(([, href]) => href),
    ).toEqual([
      '/projects/project-701/stage-1',
      '/projects/project-701/stage-2',
      '/projects/project-701/stage-3',
      '/projects/project-701/stage-4',
      '/projects/project-701/stage-5',
      '/projects/project-701/risks',
      '/projects/project-701/stage-1',
      '/projects/project-701/stage-1/initiation',
      '/projects/project-701/stage-1/documents',
    ]);
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(markup).not.toContain('aria-disabled');
    expect(markup).not.toContain('chưa có điểm đến khả dụng');
  });

  it('presents server status, readiness, flags, steps, and routing without dead calls to action', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={stageOne}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('Đang thực hiện');
    expect(markup).toContain('Hoàn thành');
    expect(markup).toContain('Bị chặn');
    expect(markup).toContain('Hồ sơ bắt buộc bị từ chối');
    expect(markup).toContain('Bản nộp cần được cập nhật.');
    expect(markup).not.toContain('Cập nhật và nộp lại hồ sơ.');
    expect(markup).toContain('Quản lý dự án');
    expect(markup).toContain('2026-08-09');
    expect(markup).toContain('Tiếp nhận &amp; Phân công');
    expect(markup).not.toContain('2026-08-15');
    expect(markup).toContain('Thiết kế');
    expect(markup).toContain('Rủi ro: Cao');
    expect(markup).toContain('3/8');
    expect(markup).toContain('1 bị từ chối');
    expect(markup).toContain('1 quá hạn');
    expect(markup).toContain('/projects/project-701/stage-1/documents');
    expect(markup).toContain('XỬ LÝ');
    expect(markup).not.toContain('documents?stageKey=STAGE_1');
    expect(markup).not.toContain('Coming Soon');
    expect(markup).not.toContain('Mở bản ghi');
  });

  it('keeps the server overview after a first initiation row while suppressing duplicate routing', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={stageOne}
        workspace={workspace}
      >
        <p>Initiation row</p>
      </ProjectPmsShell>,
    );

    expect(markup).toContain('Initiation row');
    expect(markup).toContain('Tóm tắt Giai đoạn 1');
    expect(markup).toContain('Các bước Giai đoạn 1');
    expect(markup).not.toContain('Rủi ro: HIGH');
    expect(markup.indexOf('Initiation row')).toBeLessThan(
      markup.indexOf('Tóm tắt Giai đoạn 1'),
    );
  });

  it('keeps supplied content slots in workspace order and falls back to the Stage 1 summary', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        activitySlot={<p>Activity slot</p>}
        documentsSlot={<p>Documents slot</p>}
        flagsSlot={<p>Flags slot</p>}
        governanceSlot={<p>Governance slot</p>}
        mainSlot={<p>Main slot</p>}
        planSlot={<p>Plan slot</p>}
        project={project}
        readinessSlot={<p>Readiness slot</p>}
        stageOne={stageOne}
        stepsSlot={<p>Steps slot</p>}
        summarySlot={<p>Summary slot</p>}
        surveySlot={<p>Survey slot</p>}
        workspace={workspace}
      />,
    );

    expect(markup.indexOf('Main slot')).toBeLessThan(
      markup.indexOf('Summary slot'),
    );
    expect(markup.indexOf('Summary slot')).toBeLessThan(
      markup.indexOf('Flags slot'),
    );
    expect(markup.indexOf('Flags slot')).toBeLessThan(
      markup.indexOf('Governance slot'),
    );
    expect(markup.indexOf('Governance slot')).toBeLessThan(
      markup.indexOf('Survey slot'),
    );
    expect(markup.indexOf('Survey slot')).toBeLessThan(
      markup.indexOf('Plan slot'),
    );
    expect(markup.indexOf('Plan slot')).toBeLessThan(
      markup.indexOf('Documents slot'),
    );
    expect(markup.indexOf('Documents slot')).toBeLessThan(
      markup.indexOf('Steps slot'),
    );
    expect(markup.indexOf('Steps slot')).toBeLessThan(
      markup.indexOf('Readiness slot'),
    );
    expect(markup.indexOf('Readiness slot')).toBeLessThan(
      markup.indexOf('Activity slot'),
    );
    expect(markup).not.toContain('Tóm tắt Giai đoạn 1');
  });

  it('keeps alerts compact at three items before the inline document slot', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        documentsSlot={<p>Inline matrix</p>}
        project={project}
        stageOne={{
          ...stageOne,
          redFlags: [1, 2, 3, 4].map((number) => ({
            ...stageOne.redFlags[0]!,
            code: `FLAG_${number}`,
            title: `Alert ${number}`,
          })),
        }}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('Alert 1');
    expect(markup).toContain('Alert 3');
    expect(markup).not.toContain('Alert 4');
    expect(markup.indexOf('VIỆC CẦN XỬ LÝ')).toBeLessThan(
      markup.indexOf('Inline matrix'),
    );
    expect(markup).toContain('Phụ trách: Quản lý dự án · Hạn: 2026-08-09');
    expect(markup).not.toContain('Hạn: —');
    expect(markup).not.toContain('Cập nhật và nộp lại hồ sơ.');
    expect(markup).toContain('Tóm tắt Giai đoạn 1');
    expect(markup).not.toContain('Mức độ sẵn sàng');
  });

  it('renders an empty Stage 1 steps state and a null red-flag deadline truthfully', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={{
          ...stageOne,
          steps: [],
          redFlags: [{ ...stageOne.redFlags[0]!, dueDate: null }],
        }}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('Chưa có bước Giai đoạn 1.');
    expect(markup).not.toContain('Hạn: —');
  });

  it('keeps the Stage 1 header compact beside five-stage navigation', () => {
    const markup = renderToStaticMarkup(
      <ProjectPmsShell
        project={project}
        stageOne={stageOne}
        summarySlot={false}
        workspace={workspace}
      />,
    );

    expect(markup).toContain('PRJ-701');
    expect(markup).toContain('Galaxy Tower Lobby');
    expect(markup).toContain('data-status="IN_PROGRESS">Đang thực hiện');
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(markup).not.toContain('Sales owner');
    expect(markup).not.toContain('Bàn giao dự kiến');
  });

  it('keeps bounded loading and inaccessible-project error states', () => {
    expect(renderToStaticMarkup(<ProjectPmsLoading />)).toContain(
      'Đang tải không gian dự án…',
    );
    const error = renderToStaticMarkup(
      <ProjectPmsError message="Project not found" onRetry={() => {}} />,
    );
    expect(error).toContain('Project not found');
    expect(error).toContain('<button');
    expect(error).toContain('type="button"');
    expect(error).toContain('Thử lại');
  });
});
