import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ProjectOverviewView } from './project-overview';
import { ProjectWorkspaceHeader } from './project-workspace-header';

it('workspace chat giữ đường về các dự án được cấp cho actor chỉ có quyền room', () => {
  const html = renderToStaticMarkup(
    <ProjectWorkspaceHeader
      projectId="project-a"
      active="work"
      permissions={[]}
    />,
  );
  expect(html).toContain('href="/work"');
  expect(html).toContain('← Các dự án được cấp');
  expect(html).not.toContain('href="/projects"');
});

const project = {
  id: 'project-a',
  name: 'Biệt thự nguồn thật',
  code: 'DA-A',
  status: 'ACTIVE',
  healthStatus: 'ON_TRACK',
  customer: { displayName: 'Khách A' },
  projectManager: null,
  expectedCompletionDate: null,
};
it('P03 giữ cùng Project ID, task owner/hạn và cam kết độc lập với tiến độ', () => {
  const html = renderToStaticMarkup(
    <ProjectOverviewView
      project={project}
      permissions={['project.read', 'task.read', 'contract.read']}
      contracts={[]}
      tasks={[
        {
          id: 'task-a',
          title: 'Kiểm tra cấu hình',
          status: 'BLOCKED',
          dueDate: null,
          assignees: [{ user: { displayName: 'Lan' } }],
        },
      ]}
    />,
  );
  expect(html).toContain('/projects/project-a/work');
  expect(html).toContain('/tasks/task-a');
  expect(html).toContain('Lan');
  expect(html).toContain('Chưa ghi nhận hợp đồng ký');
  expect(html).not.toContain('85%');
  expect(html).not.toContain('0 VND');
});
it('P03 thiếu nguồn/quyền không hiện số tiền hoặc mốc minh họa', () => {
  const html = renderToStaticMarkup(
    <ProjectOverviewView project={project} permissions={['project.read']} />,
  );
  expect(html).toContain('Chưa có dữ liệu tài chính được phép hiển thị');
  expect(html).toContain('Chưa xác định');
  expect(html).not.toContain('Kết nối ngay');
});
