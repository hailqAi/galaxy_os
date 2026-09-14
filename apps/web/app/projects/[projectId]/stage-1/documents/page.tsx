import { redirect } from 'next/navigation';

export default async function StageOneDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    documentId?: string;
    requirementId?: string;
    workstreamKey?: string;
  }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const documentId = query.documentId ?? query.requirementId;
  if (documentId && !query.workstreamKey)
    redirect(
      `/projects/${projectId}/documents?stageKey=STAGE_1&requirementId=${encodeURIComponent(documentId)}`,
    );
  const steps: Record<string, number> = {
    ASSIGNMENT: 1,
    SURVEY: 2,
    PROPOSAL: 3,
    FINANCIAL_PLANNING: 4,
    KICKOFF_APPROVAL: 5,
  };
  const step = steps[query.workstreamKey ?? ''] ?? 1;
  redirect(
    `/projects/${projectId}/stage-1?step=${step}#${documentId ? `document-${encodeURIComponent(documentId)}` : 'step-documents'}`,
  );
}
