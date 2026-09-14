import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityActivity } from '../../entity-activity';
import { canDeleteComment, EntityComments } from '../../entity-comments';
import { EntityFiles } from '../../entity-files';
import {
  addProjectMember,
  changeProjectManager,
  projectMemberSearchPath,
  ProjectMembersDialog,
  loadProjectMembersWorkspace,
  removeProjectMember,
} from './project-stage-one';

const project = {
  id: 'project-701',
  code: 'PRJ-701',
  name: 'Galaxy Tower Lobby',
  customerId: 'customer-1',
  customer: { id: 'customer-1', displayName: 'Galaxy Centre' },
  projectType: 'DESIGN_AND_BUILD',
  location: 'Quận 1, TP.HCM',
  projectManagerId: 'member-1',
  projectManager: { id: 'member-1', displayName: 'Nguyễn Minh' },
  status: 'ACTIVE',
  healthStatus: 'ON_TRACK',
  members: [
    {
      userId: 'member-1',
      role: 'PROJECT_MANAGER',
      user: {
        id: 'member-1',
        displayName: 'Nguyễn Minh',
        email: 'minh@example.com',
        status: 'active',
      },
    },
  ],
  projectOwner: { id: 'director-1', displayName: 'Director' },
  departments: [
    {
      departmentId: 'department-1',
      department: { code: 'PM', name: 'Project Management' },
    },
  ],
  stageOnePlan: {},
};

afterEach(() => vi.unstubAllGlobals());

describe('Stage 1 document, Project entity, and member composition', () => {
  it('searches only active organization members through the bounded users endpoint', () => {
    expect(projectMemberSearchPath('  Nguyễn Minh  ')).toBe(
      '/users?pageSize=20&status=active&membershipStatus=active&search=Nguy%E1%BB%85n+Minh',
    );
  });

  it('keeps files and comment controls behind exact actor permissions and leaves activity bounded', () => {
    const files = renderToStaticMarkup(
      <EntityFiles
        entityId="project-701"
        entityType="Project"
        permissions={[]}
      />,
    );
    const comments = renderToStaticMarkup(
      <EntityComments
        entityId="project-701"
        entityType="Project"
        permissions={[]}
      />,
    );
    const activitySource = readFileSync(
      resolve(process.cwd(), 'app/entity-activity.tsx'),
      'utf8',
    );

    expect(files).not.toContain('Tải tệp');
    expect(comments).not.toContain('Gửi bình luận');
    expect(comments).not.toContain('Nhắc đến');
    expect(activitySource).toContain("pageSize: '20'");
    expect(
      renderToStaticMarkup(
        <EntityActivity entityId="project-701" entityType="Project" />,
      ),
    ).toContain('Hoạt động');
  });

  it('uses user ids for membership, reloads from real mutations, and does not manufacture grants', async () => {
    const fetch = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);

    await addProjectMember('project-701', 'user-701', 'DESIGNER');
    await removeProjectMember('project-701', 'user-701');
    await changeProjectManager('project-701', 'user-702');

    expect(
      fetch.mock.calls.map((call) => {
        const [url, init] = call;
        return [String(url), init?.method, init?.body];
      }),
    ).toEqual([
      [
        '/api/v1/projects/project-701/members',
        'POST',
        JSON.stringify({ userId: 'user-701', role: 'DESIGNER' }),
      ],
      ['/api/v1/projects/project-701/members/user-701', 'DELETE', undefined],
      [
        '/api/v1/projects/project-701',
        'PATCH',
        JSON.stringify({ projectManagerId: 'user-702' }),
      ],
    ]);

    const markup = renderToStaticMarkup(
      <ProjectMembersDialog
        actor={{
          permissions: [
            'project.manage_members',
            'project.update',
            'project.stage1.finance.read',
          ],
        }}
        onClose={() => {}}
        onMutate={async () => {}}
        open
        project={project}
      />,
    );
    expect(markup).toContain('THÀNH VIÊN &amp; PHÂN QUYỀN DỰ ÁN');
    expect(markup).toContain('Director');
    expect(markup).toContain('minh@example.com');
    expect(markup).toContain('Project Management');
    expect(markup).toContain('value="member-1"');
    expect(markup).not.toContain('<option value="">Chưa gán</option>');
    expect(markup).toContain('Quyền tài chính hiện tại: xem');
    expect(markup).not.toContain('Nhà thầu');
    expect(markup).not.toContain('Khách hàng');
    expect(markup).not.toContain('Lời mời');
    expect(markup).not.toContain('Phạm vi thành viên');

    const readOnlyMarkup = renderToStaticMarkup(
      <ProjectMembersDialog
        actor={{ permissions: [] }}
        onClose={() => {}}
        onMutate={async () => {}}
        open
        project={project}
      />,
    );
    expect(readOnlyMarkup).not.toContain('Tìm người dùng đang hoạt động');
    expect(readOnlyMarkup).not.toContain('Thêm thành viên');
    expect(readOnlyMarkup).not.toContain('<select');

    expect(
      canDeleteComment({
        actorUserId: 'actor-1',
        authorId: 'author-1',
        permissions: ['comment.delete_own'],
      }),
    ).toBe(false);
    expect(
      canDeleteComment({
        actorUserId: 'actor-1',
        authorId: 'actor-1',
        permissions: ['comment.delete_own'],
      }),
    ).toBe(true);
    expect(
      canDeleteComment({
        actorUserId: 'actor-1',
        authorId: 'author-1',
        permissions: ['comment.delete_any'],
      }),
    ).toBe(true);
  });

  it('loads real member business facts without requiring the Stage 1 financial workspace', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(project))
      .mockResolvedValueOnce(
        Response.json({ userId: 'viewer-1', permissions: ['project.read'] }),
      );
    vi.stubGlobal('fetch', fetch);

    await expect(loadProjectMembersWorkspace('project-701')).resolves.toEqual({
      project,
      actor: { userId: 'viewer-1', permissions: ['project.read'] },
    });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/projects/project-701',
      '/api/v1/me',
    ]);
    expect(
      fetch.mock.calls.map(([url]) => String(url)).join(' '),
    ).not.toContain('/stage-1/simple');
  });

  it('uses only backed document, member, file, and activity adapters', () => {
    const root = process.cwd();
    const matrixSource = readFileSync(
      resolve(root, 'app/projects/[projectId]/documents/page.tsx'),
      'utf8',
    );
    expect(matrixSource).not.toContain('/history');
    expect(matrixSource).toContain('Không thể tải kho hồ sơ.');
    expect(matrixSource).toContain('KHO LƯU TRỮ HỒ SƠ DỰ ÁN');
    expect(matrixSource).toContain(`/files`);
    expect(matrixSource).not.toContain("method: 'POST'");
    expect(matrixSource).toContain('message ? (');
    const stageOneSource = readFileSync(
      resolve(root, 'app/projects/[projectId]/project-stage-one.tsx'),
      'utf8',
    );
    expect(stageOneSource).toContain('loadSimpleStageOne(projectId)');
    expect(stageOneSource).not.toContain('StageRequiredDocumentGroups');
    const stageOneDocumentsSource = readFileSync(
      resolve(root, 'app/projects/[projectId]/stage-1/documents/page.tsx'),
      'utf8',
    );
    expect(stageOneDocumentsSource).toContain('stage-1?step=${step}');
    expect(stageOneDocumentsSource).toContain("'step-documents'");
    expect(stageOneDocumentsSource).toContain(
      'document-${encodeURIComponent(documentId)}',
    );
    expect(
      readFileSync(
        resolve(root, 'app/projects/[projectId]/members/page.tsx'),
        'utf8',
      ),
    ).toContain('ProjectMembersWorkspace');
    expect(
      readFileSync(
        resolve(root, 'app/projects/[projectId]/files/page.tsx'),
        'utf8',
      ),
    ).toContain('ProjectFilesWorkspace');
    expect(
      readFileSync(
        resolve(root, 'app/projects/[projectId]/activity/page.tsx'),
        'utf8',
      ),
    ).toContain('ProjectActivityWorkspace');
  });
});
