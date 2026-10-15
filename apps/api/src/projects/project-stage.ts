import { Prisma, ProjectPhase, ProjectStage, TaskStatus } from '@prisma/client';

export type VisualProjectStage =
  | 'STAGE_1'
  | 'STAGE_2'
  | 'STAGE_3'
  | 'STAGE_4'
  | 'STAGE_5';

type StageState = { stage?: unknown; status?: unknown };

const phaseStage: Record<ProjectPhase, VisualProjectStage> = {
  SURVEY: 'STAGE_1',
  REQUIREMENT: 'STAGE_1',
  DESIGN: 'STAGE_2',
  PRODUCT_SELECTION: 'STAGE_2',
  QUOTATION: 'STAGE_3',
  CONTRACT: 'STAGE_3',
  PROCUREMENT: 'STAGE_3',
  PRODUCTION: 'STAGE_4',
  SHIPPING: 'STAGE_4',
  INSTALLATION: 'STAGE_4',
  INSPECTION: 'STAGE_5',
  HANDOVER: 'STAGE_5',
  WARRANTY: 'STAGE_5',
  AFTER_SALES: 'STAGE_5',
};

const stageKeys = [
  { visual: 'STAGE_1', persisted: 'STAGE_ONE' },
  { visual: 'STAGE_2', persisted: 'STAGE_TWO' },
  { visual: 'STAGE_3', persisted: 'STAGE_THREE' },
  { visual: 'STAGE_4', persisted: 'STAGE_FOUR' },
  { visual: 'STAGE_5', persisted: 'STAGE_FIVE' },
] as const satisfies readonly {
  visual: VisualProjectStage;
  persisted: ProjectStage;
}[];

export function visualProjectStageKey(stage: unknown) {
  return stageKeys.find(({ persisted }) => persisted === stage)?.visual;
}

export function parseVisualProjectStage(
  value: string,
): VisualProjectStage | undefined {
  return stageKeys.find(({ visual }) => visual === value)?.visual;
}

export function persistedProjectStage(stage: VisualProjectStage): ProjectStage {
  return stageKeys.find(({ visual }) => visual === stage)!.persisted;
}

const nextStage: Record<VisualProjectStage, VisualProjectStage> = {
  STAGE_1: 'STAGE_2',
  STAGE_2: 'STAGE_3',
  STAGE_3: 'STAGE_4',
  STAGE_4: 'STAGE_5',
  STAGE_5: 'STAGE_5',
};

const stageOrder = stageKeys.map(({ visual }) => visual);

const stageCandidates: Record<
  VisualProjectStage,
  Prisma.ProjectStageStateWhereInput[]
> = {
  STAGE_1: [
    {
      stage: 'STAGE_ONE',
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] },
    },
  ],
  STAGE_2: [
    { stage: 'STAGE_ONE', status: 'DONE' },
    {
      stage: 'STAGE_TWO',
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] },
    },
  ],
  STAGE_3: [
    { stage: 'STAGE_TWO', status: 'DONE' },
    {
      stage: 'STAGE_THREE',
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] },
    },
  ],
  STAGE_4: [
    { stage: 'STAGE_THREE', status: 'DONE' },
    {
      stage: 'STAGE_FOUR',
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'] },
    },
  ],
  STAGE_5: [
    { stage: 'STAGE_FOUR', status: 'DONE' },
    {
      stage: 'STAGE_FIVE',
      status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] },
    },
  ],
};

export function visualProjectStageWhere(
  currentStage: VisualProjectStage,
): Prisma.ProjectWhereInput {
  const index = stageOrder.indexOf(currentStage);
  const higherCandidates = stageOrder
    .slice(index + 1)
    .flatMap((stage) => stageCandidates[stage]);
  const allCandidates = stageOrder.flatMap((stage) => stageCandidates[stage]);
  return {
    OR: [
      {
        AND: [
          { stageStates: { some: { OR: stageCandidates[currentStage] } } },
          ...(higherCandidates.length
            ? [{ NOT: { stageStates: { some: { OR: higherCandidates } } } }]
            : []),
        ],
      },
      {
        AND: [
          { stageStates: { none: { OR: allCandidates } } },
          { entryStage: persistedProjectStage(currentStage) },
        ],
      },
    ],
  };
}

export function initialStageStates(
  entryStage: VisualProjectStage,
): { stage: ProjectStage; status: TaskStatus }[] {
  return stageKeys.map(({ visual, persisted }) => ({
    stage: persisted,
    status: visual === entryStage ? 'IN_PROGRESS' : 'NOT_INITIALIZED',
  }));
}

export function visualProjectStage(
  phase: string | null | undefined,
  stageStates: readonly StageState[],
  entryStage?: string | null,
): VisualProjectStage {
  let current: VisualProjectStage | undefined;
  for (const state of stageStates) {
    const stage = visualProjectStageKey(state.stage);
    if (!stage) continue;
    const candidate =
      state.status === 'DONE'
        ? nextStage[stage]
        : ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'].includes(
              String(state.status),
            )
          ? stage
          : undefined;
    if (
      candidate &&
      (!current || stageOrder.indexOf(candidate) > stageOrder.indexOf(current))
    )
      current = candidate;
  }
  return (
    current ??
    visualProjectStageKey(entryStage) ??
    phaseStage[phase as ProjectPhase] ??
    'STAGE_1'
  );
}
