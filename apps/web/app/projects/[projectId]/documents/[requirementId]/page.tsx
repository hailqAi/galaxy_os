import { redirect } from 'next/navigation';

export function projectDocumentDetailDestination(
  projectId: string,
  requirementId: string,
  stageKey?: string,
) {
  const stage = /^STAGE_[1-5]$/.test(stageKey ?? '') ? stageKey : undefined;
  if (!stage || stage === 'STAGE_1') {
    const query = new URLSearchParams({ requirementId });
    if (stage) query.set('stageKey', stage);
    return `/projects/${projectId}/documents?${query}`;
  }
  return `/projects/${projectId}/${stage.toLowerCase().replace('_', '-')}#document-${encodeURIComponent(requirementId)}`;
}

export default async function ProjectDocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; requirementId: string }>;
  searchParams: Promise<{ stageKey?: string }>;
}) {
  const [{ projectId, requirementId }, { stageKey }] = await Promise.all([
    params,
    searchParams,
  ]);
  redirect(
    projectDocumentDetailDestination(projectId, requirementId, stageKey),
  );
}
