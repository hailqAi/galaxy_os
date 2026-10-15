import { ProjectOverview } from '../../../../features/projects/project-overview';
export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectOverview key={projectId} projectId={projectId} />;
}
