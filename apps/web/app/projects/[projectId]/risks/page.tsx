'use client';

import { useParams } from 'next/navigation';
import { ProjectRisks } from '../project-risks';

export default function ProjectRisksPage() {
  return <ProjectRisks projectId={String(useParams().projectId)} />;
}
