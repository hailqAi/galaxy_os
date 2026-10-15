import { afterEach, expect, it, vi } from 'vitest';
import ProjectPage from './page';

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
afterEach(() => vi.unstubAllEnvs());
it.each([
  ['true', 'work'],
  ['false', 'stage-1'],
])(
  'opens the current project workspace with chat=%s',
  async (flag, destination) => {
    vi.stubEnv('FEATURE_PROJECT_CHAT', flag);
    await expect(
      ProjectPage({ params: Promise.resolve({ projectId: 'project-1' }) }),
    ).rejects.toThrow(`/projects/project-1/${destination}`);
  },
);
