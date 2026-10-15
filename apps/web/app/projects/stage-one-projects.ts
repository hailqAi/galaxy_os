export type StageOneMode = 'actions' | 'alerts';

export type StageOneSummary = {
  readiness: { status: string };
  redFlags: {
    code: string;
    severity: string;
    title: string;
    description: string;
    route: string;
    remediation: string;
  }[];
};

type Project = { id: string; code: string; name: string };
type Entry<T extends Project> = { project: T; summary?: StageOneSummary };
export type StageOneActionRow<T extends Project> = {
  type: 'action';
  project: T;
  readinessStatus: string;
  redFlags: StageOneSummary['redFlags'];
};
export type StageOneAlertRow<T extends Project> =
  StageOneSummary['redFlags'][number] & {
    type: 'alert';
    project: T;
    readinessStatus: string;
  };
export type StageOneRow<T extends Project> =
  | StageOneActionRow<T>
  | StageOneAlertRow<T>;

export function stageOneRows<T extends Project>(
  mode: StageOneMode,
  entries: readonly Entry<T>[],
): StageOneRow<T>[] {
  return entries.flatMap<StageOneRow<T>>(({ project, summary }) => {
    if (!summary) return [];
    if (mode === 'alerts')
      return summary.redFlags.map((flag) => ({
        type: 'alert' as const,
        project,
        readinessStatus: summary.readiness.status,
        ...flag,
      }));
    return summary.readiness.status === 'COMPLETED' && !summary.redFlags.length
      ? []
      : [
          {
            type: 'action' as const,
            project,
            readinessStatus: summary.readiness.status,
            redFlags: summary.redFlags,
          },
        ];
  });
}
