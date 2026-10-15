'use client';

import { useParams } from 'next/navigation';
import { ProjectStageAccess } from '../project-stage-access';

export default function StageFivePage() {
  return (
    <ProjectStageAccess
      projectId={String(useParams().projectId)}
      stageKey="STAGE_5"
    />
  );
}
