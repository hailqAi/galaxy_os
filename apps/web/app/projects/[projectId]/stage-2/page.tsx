'use client';

import { useParams } from 'next/navigation';
import { ProjectStageTwo } from '../project-stage-two';

export default function StageTwoPage() {
  return <ProjectStageTwo projectId={String(useParams().projectId)} />;
}
