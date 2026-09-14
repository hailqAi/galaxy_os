import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyProjectFilter,
  DashboardView,
  loadProjectDashboard,
  loadProjectsPage,
  projectListPath,
  ProjectsPage,
} from './page';

const project = {
  id: 'project-1',
  code: 'PRJ-001',
  name: 'North tower',
  currentStage: 'STAGE_1',
  status: 'ACTIVE',
  healthStatus: 'ON_TRACK',
  progressPercentage: 20,
  updatedAt: '2026-08-21T08:30:00.000Z',
  stages: [{ stageKey: 'STAGE_1', status: 'IN_PROGRESS' }],
  currency: 'VND',
  expectedCompletionDate: null,
  customer: { displayName: 'Galaxy Centre' },
  projectManager: null,
  departments: [],
  canDeleteProject: false,
};

const page = (id: string) => ({
  items: [{ ...project, id, code: `PRJ-${id}` }],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
});

const twoProjectPage = () => ({
  items: [
    { ...project, id: 'project-1', code: 'PRJ-001' },
    { ...project, id: 'project-2', code: 'PRJ-002' },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
});

const summary = (status: string) => ({ readiness: { status }, redFlags: [] });
const summaries = (projectId: string, status: string) => ({
  items: [{ projectId, ...summary(status) }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function state() {
  return {
    data: undefined as ReturnType<typeof page> | undefined,
    rows: undefined as unknown,
    message: '',
    listFailed: false,
  };
}

function callbacks(view: ReturnType<typeof state>) {
  return {
    onStart: () => {
      view.listFailed = false;
      view.message = '';
      view.rows = undefined;
    },
    onData: (data: unknown) => {
      view.data = data as ReturnType<typeof page>;
    },
    onRows: (rows: unknown, message: string) => {
      view.rows = rows;
      view.message = message;
    },
    onListError: (message: string) => {
      view.listFailed = true;
      view.message = message;
    },
  };
}

function dashboardState() {
  return {
    data: undefined as unknown,
    error: '',
    loading: false,
  };
}

function dashboardCallbacks(view: ReturnType<typeof dashboardState>) {
  return {
    onStart: () => {
      view.data = undefined;
      view.error = '';
      view.loading = true;
    },
    onData: (data: unknown) => {
      view.data = data;
      view.loading = false;
    },
    onError: (message: string) => {
      view.error = message;
      view.loading = false;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Project Stage 1 page loading', () => {
  it('shows the shared Project-delete action only for a row capability', () => {
    const allowed = renderToStaticMarkup(
      React.createElement(DashboardView, {
        data: {
          ...page('project-delete'),
          items: [
            {
              ...project,
              id: 'project-delete',
              code: 'PRJ-TEST-DELETE',
              canDeleteProject: true,
            },
          ],
        },
        summary: {
          total: 1,
          active: 1,
          needsAttention: 0,
          completed: 0,
          permittedCommands: { create: false },
        },
      }),
    );
    const denied = renderToStaticMarkup(
      React.createElement(DashboardView, {
        data: page('project-read-only'),
        summary: {
          total: 1,
          active: 1,
          needsAttention: 0,
          completed: 0,
          permittedCommands: { create: false },
        },
      }),
    );

    expect(allowed).toContain('Xóa dự án');
    expect(denied).not.toContain('Xóa dự án');
  });

  it('links both Project list actions directly to Stage 1', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardView, {
        data: page('project-root'),
        summary: {
          total: 1,
          active: 1,
          needsAttention: 0,
          completed: 0,
          permittedCommands: { create: false },
        },
      }),
    );

    expect(
      markup.match(/href="\/projects\/project-root\/stage-1"/g) ?? [],
    ).toHaveLength(2);
    expect(markup).not.toContain('href="/projects/project-root"');
  });

  it('requests an actor-scoped current-stage page instead of client filtering', () => {
    expect(
      projectListPath({ currentStage: 'STAGE_3', mine: true, page: 2 }),
    ).toContain('currentStage=STAGE_3');
  });

  it.each(['search', 'currentStage', 'status', 'health'])(
    'resets pagination when the %s filter changes',
    () => {
      let filter = '';
      let currentPage = 7;

      applyProjectFilter(
        'ACTIVE',
        (value) => (filter = value),
        (value) => (currentPage = value),
      );

      expect(filter).toBe('ACTIVE');
      expect(currentPage).toBe(1);
    },
  );

  it('uses the five-stage current-stage filter instead of legacy phase controls', () => {
    const markup = renderToStaticMarkup(React.createElement(ProjectsPage));

    expect(markup).toContain('Giai đoạn hiện tại');
    expect(markup).toContain('Giai đoạn 1');
    expect(markup).toContain('Giai đoạn 5');
    expect(markup).not.toContain('>STAGE_1<');
    expect(markup).not.toContain('>ON_TRACK<');
    expect(markup).not.toContain('SURVEY');
  });

  it('loads one batch of summaries for an Actions page and retains partial rows', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(twoProjectPage()))
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              projectId: 'project-1',
              ...summary('IN_PROGRESS'),
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const view = state();

    await loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => true,
      path: '/projects?page=1',
      stageOneMode: 'actions',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]?.[0])).toContain(
      '/projects/stage-1-summaries?projectIds=',
    );
    expect(String(fetch.mock.calls[1]?.[0])).toContain(
      'projectIds=project-1,project-2',
    );
    expect(String(fetch.mock.calls[1]?.[0])).not.toContain('/stage-1/summary');
    expect(view.rows).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ id: 'project-1' }),
        readinessStatus: 'IN_PROGRESS',
      }),
    ]);
    expect(view.message).toBe('Một số dữ liệu Stage 1 không thể tải.');
  });

  it('loads one batch of summaries for an Alerts page', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(twoProjectPage()))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetch);

    await loadProjectsPage({
      callbacks: callbacks(state()),
      isCurrent: () => true,
      path: '/projects?page=1',
      stageOneMode: 'alerts',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]?.[0])).toContain(
      'projectIds=project-1,project-2',
    );
  });

  it('does not let a deferred older list replace newer data or rows', async () => {
    const oldList = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(oldList.promise)
        .mockResolvedValueOnce(Response.json(page('current')))
        .mockResolvedValueOnce(
          Response.json(summaries('current', 'IN_PROGRESS')),
        ),
    );
    let generation = 1;
    const view = state();
    const oldLoad = loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => generation === 1,
      path: '/projects?page=1',
      stageOneMode: 'actions',
    });

    generation = 2;
    await loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => generation === 2,
      path: '/projects?page=2',
      stageOneMode: 'actions',
    });
    oldList.resolve(Response.json(page('stale')));
    await oldLoad;

    expect(view.data?.items[0]?.id).toBe('current');
    expect(view.rows).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ id: 'current' }),
      }),
    ]);
    expect(view.message).toBe('');
  });

  it('does not let a deferred older summary replace newer rows or message', async () => {
    const oldSummary = deferred<Response>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page('old')))
      .mockReturnValueOnce(oldSummary.promise)
      .mockResolvedValueOnce(Response.json(page('current')))
      .mockResolvedValueOnce(
        Response.json(summaries('current', 'IN_PROGRESS')),
      );
    vi.stubGlobal('fetch', fetch);
    let generation = 1;
    const view = state();
    const oldLoad = loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => generation === 1,
      path: '/projects?page=1',
      stageOneMode: 'actions',
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    generation = 2;
    await loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => generation === 2,
      path: '/projects?page=2',
      stageOneMode: 'actions',
    });
    oldSummary.reject(new Error('stale summary failed'));
    await oldLoad;

    expect(view.data?.items[0]?.id).toBe('current');
    expect(view.rows).toEqual([
      expect.objectContaining({
        project: expect.objectContaining({ id: 'current' }),
      }),
    ]);
    expect(view.message).toBe('');
  });

  it('does not commit a deferred list failure after invalidation', async () => {
    const list = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(list.promise));
    let current = true;
    const view = state();
    const load = loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => current,
      path: '/projects?page=1',
      stageOneMode: 'actions',
    });

    current = false;
    list.reject(new Error('unmounted list failed'));
    await load;

    expect(view.data).toBeUndefined();
    expect(view.rows).toBeUndefined();
    expect(view.message).toBe('');
  });

  it('reports an authorized list failure as an error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const view = state();

    await loadProjectsPage({
      callbacks: callbacks(view),
      isCurrent: () => true,
      path: '/projects?page=1',
      stageOneMode: 'actions',
    });

    expect(view.listFailed).toBe(true);
    expect(view.message).toBe('offline');
    expect(view.data).toBeUndefined();
  });

  it('loads dashboard independently while the Project list is still pending', async () => {
    const pendingList = deferred<Response>();
    const fetch = vi.fn((input: RequestInfo | URL) =>
      String(input).endsWith('/projects/dashboard')
        ? Promise.resolve(Response.json({ total: 2 }))
        : pendingList.promise,
    );
    vi.stubGlobal('fetch', fetch);
    const listView = state();
    const dashboardView = dashboardState();

    const listLoad = loadProjectsPage({
      callbacks: callbacks(listView),
      isCurrent: () => true,
      path: '/projects?page=1',
    });
    await loadProjectDashboard({
      callbacks: dashboardCallbacks(dashboardView),
      isCurrent: () => true,
    });

    expect(dashboardView.data).toEqual({ total: 2 });
    expect(listView.data).toBeUndefined();
    pendingList.resolve(Response.json(page('current')));
    await listLoad;
  });

  it('does not refetch or clear dashboard data when list filters reload or fail', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ total: 2 }))
      .mockResolvedValueOnce(Response.json(page('first')))
      .mockRejectedValueOnce(new Error('filtered list offline'));
    vi.stubGlobal('fetch', fetch);
    const dashboardView = dashboardState();
    const listView = state();

    await loadProjectDashboard({
      callbacks: dashboardCallbacks(dashboardView),
      isCurrent: () => true,
    });
    await loadProjectsPage({
      callbacks: callbacks(listView),
      isCurrent: () => true,
      path: '/projects?page=1',
    });
    await loadProjectsPage({
      callbacks: callbacks(listView),
      isCurrent: () => true,
      path: '/projects?page=1&status=ACTIVE',
    });

    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/projects/dashboard',
      '/api/v1/projects?page=1',
      '/api/v1/projects?page=1&status=ACTIVE',
    ]);
    expect(dashboardView.data).toEqual({ total: 2 });
    expect(listView.listFailed).toBe(true);
  });

  it('retries a dashboard failure without loading the Project list', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('dashboard offline'))
      .mockResolvedValueOnce(Response.json({ total: 2 }));
    vi.stubGlobal('fetch', fetch);
    const view = dashboardState();

    await loadProjectDashboard({
      callbacks: dashboardCallbacks(view),
      isCurrent: () => true,
    });
    expect(view.error).toBe('dashboard offline');

    await loadProjectDashboard({
      callbacks: dashboardCallbacks(view),
      isCurrent: () => true,
    });

    expect(view.data).toEqual({ total: 2 });
    expect(view.error).toBe('');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.every(([input]) =>
        String(input).endsWith('/projects/dashboard'),
      ),
    ).toBe(true);
  });
});
