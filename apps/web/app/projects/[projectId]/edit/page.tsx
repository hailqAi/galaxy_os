import { redirect } from 'next/navigation';

export const projectEditDestination = (projectId: string) =>
  `/projects/${projectId}/stage-1?step=1`;

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(projectEditDestination(projectId));
}
