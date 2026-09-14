import { describe, expect, it } from 'vitest';
import { stageOneRows } from './stage-one-projects';

const project = {
  id: 'project-1',
  code: 'PRJ-001',
  name: 'North tower',
  phase: 'SURVEY',
  status: 'ACTIVE',
  healthStatus: 'ON_TRACK',
  progressPercentage: 20,
  currency: 'VND',
  expectedCompletionDate: null,
  customer: { displayName: 'Galaxy Centre' },
  projectManager: null,
  departments: [],
};

describe('Stage 1 Project action and alert rows', () => {
  it('keeps incomplete readiness as a real action but not an alert', () => {
    const entries = [
      {
        project,
        summary: { readiness: { status: 'IN_PROGRESS' }, redFlags: [] },
      },
    ];

    expect(stageOneRows('actions', entries)).toEqual([
      expect.objectContaining({
        project,
        readinessStatus: 'IN_PROGRESS',
        redFlags: [],
      }),
    ]);
    expect(stageOneRows('alerts', entries)).toEqual([]);
  });

  it('uses only real red flags for alerts and omits summaries that fail to load', () => {
    const entries = [
      {
        project,
        summary: {
          readiness: { status: 'COMPLETED' },
          redFlags: [
            {
              code: 'PROJECT_MANAGER_MISSING',
              severity: 'CRITICAL',
              title: 'Project Manager is missing',
              description: 'Stage 1 needs an accountable Project Manager.',
              route: '/projects/project-1/stage-1/initiation',
              remediation: 'Assign an active Project Manager.',
            },
          ],
        },
      },
      { project: { ...project, id: 'project-2', code: 'PRJ-002' } },
    ];

    expect(stageOneRows('actions', entries)).toHaveLength(1);
    expect(stageOneRows('alerts', entries)).toEqual([
      expect.objectContaining({
        project,
        code: 'PROJECT_MANAGER_MISSING',
        title: 'Project Manager is missing',
      }),
    ]);
  });
});
