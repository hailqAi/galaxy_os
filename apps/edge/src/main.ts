import { createEdge, readConfig } from './edge.js';

const edge = createEdge(readConfig());
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  void edge.stop().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
edge.start().catch(async (error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  await edge.stop();
  process.exitCode = 1;
});
