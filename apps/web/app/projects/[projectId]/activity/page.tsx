'use client';

import { useParams } from 'next/navigation';
import { ProjectActivityWorkspace } from '../project-stage-one';

export default function ProjectActivityPage() {
  return <ProjectActivityWorkspace projectId={String(useParams().projectId)} />;
}
