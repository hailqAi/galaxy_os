'use client';

import { useParams } from 'next/navigation';
import { ProjectStageOne } from '../project-stage-one';

export default function StageOnePage() {
  return <ProjectStageOne projectId={String(useParams().projectId)} />;
}
