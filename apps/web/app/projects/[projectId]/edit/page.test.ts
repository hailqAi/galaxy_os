import { describe, expect, it } from 'vitest';
import { projectEditDestination } from './page';

describe('legacy Project edit route', () => {
  it('redirects to the canonical existing-project Stage 1 edit mode', () => {
    expect(projectEditDestination('project-701')).toBe(
      '/projects/project-701/stage-1?step=1',
    );
  });
});
