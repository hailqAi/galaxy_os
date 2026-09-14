'use client';

import { useParams } from 'next/navigation';
import { ProjectMembersWorkspace } from '../project-stage-one';

export default function ProjectMembersPage() {
  return <ProjectMembersWorkspace projectId={String(useParams().projectId)} />;
}
