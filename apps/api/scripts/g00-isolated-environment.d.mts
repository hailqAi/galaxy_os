export type G00Isolation = {
  runId: string;
  composeProject: string;
  databaseName: string;
  databaseUser: string;
  postgresPort: number;
  redisPort: number;
  apiPort: number;
  testRoot: string;
};

export function assertG00Isolation(source?: NodeJS.ProcessEnv): G00Isolation;
