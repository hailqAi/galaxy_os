import { notFound } from 'next/navigation';
import { ProjectChat } from '../../../../features/project-chat/project-chat';
export default async function WorkPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if (process.env.FEATURE_PROJECT_CHAT !== 'true') notFound();
  const { projectId } = await params;
  return <ProjectChat projectId={projectId} />;
}
