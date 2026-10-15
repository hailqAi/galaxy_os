import { redirect } from 'next/navigation';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(
    `/projects/${projectId}/${process.env.FEATURE_PROJECT_CHAT === 'true' ? 'work' : 'stage-1'}`,
  );
}
