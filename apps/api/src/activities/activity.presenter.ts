type PublicActivity = { event: string; metadata: unknown };

export function presentPublicActivity<T extends PublicActivity>(
  activity: T,
): T {
  if (
    [
      'FILE_UPLOADED',
      'FILE_UPDATED',
      'FILE_DELETED',
      'FILE_RESTORED',
      'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
      'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
    ].includes(activity.event)
  )
    return { ...activity, metadata: {} };
  if (activity.event !== 'PROJECT_UPLOAD_BATCH_SUBMITTED') return activity;
  const metadata =
    activity.metadata &&
    typeof activity.metadata === 'object' &&
    !Array.isArray(activity.metadata)
      ? activity.metadata
      : {};
  const result = 'result' in metadata ? metadata.result : undefined;
  const items =
    result && typeof result === 'object' && 'items' in result
      ? result.items
      : undefined;
  return {
    ...activity,
    metadata: { fileCount: Array.isArray(items) ? items.length : 0 },
  };
}
