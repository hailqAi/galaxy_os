'use client';

import { useParams } from 'next/navigation';
import { ProjectFilesWorkspace } from '../project-stage-one';

export default function ProjectFilesPage() {
  return <ProjectFilesWorkspace projectId={String(useParams().projectId)} />;
}
