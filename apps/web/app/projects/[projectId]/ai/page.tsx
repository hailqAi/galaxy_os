import { notFound } from 'next/navigation';
import { ProjectAiWorkspace } from '../../../../features/project-chat/project-ai-workspace';
export default async function AiPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if (process.env.FEATURE_PROJECT_AI !== 'true') notFound();
  const { projectId } = await params;
  return <ProjectAiWorkspace key={projectId} projectId={projectId} />;
}
