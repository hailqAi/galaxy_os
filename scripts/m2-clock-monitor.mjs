import { performance } from 'node:perf_hooks';
import { appendFileSync, mkdirSync } from 'node:fs';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';

export function clockDelta(before, after) {
  const wallDeltaMs = after.wallMs - before.wallMs;
  const monoDeltaMs = after.monoMs - before.monoMs;
  const driftMs = wallDeltaMs - monoDeltaMs;
  return {
    wallDeltaMs,
    monoDeltaMs,
    driftMs,
    contaminated: Math.abs(driftMs) > 100,
  };
}

export function clockEvidence(
  samples,
  baselineExitCode = 0,
  { pid, minimumCoverage = 40000 } = {},
) {
  if (
    baselineExitCode !== 0 ||
    samples.length < 2 ||
    samples.some(
      (s) =>
        !Number.isFinite(s.wallMs) ||
        !Number.isFinite(s.monoMs) ||
        !Number.isFinite(s.monoDeltaMs) ||
        typeof s.contaminated !== 'boolean',
    )
  )
    return 'CLOCK_UNVERIFIED';
  if (samples.some((s) => s.contaminated)) return 'CLOCK_CONTAMINATED';
  const durations = new Map();
  for (const sample of samples)
    durations.set(
      sample.pid,
      (durations.get(sample.pid) ?? 0) + sample.monoDeltaMs,
    );
  return (pid === undefined
    ? Math.max(...durations.values())
    : (durations.get(pid) ?? 0)) >= minimumCoverage
    ? 'CLEAN'
    : 'CLOCK_UNVERIFIED';
}

// Opt-in observer in isolated test bootstrap only. Never replaces Date/timers.
if (process.env.M2_CLOCK_OBSERVE === 'true') {
  const isolation = assertG00Isolation();
  const runId = process.env.M2_CLOCK_RUN_ID;
  if (runId && !/^[0-9a-f-]{36}$/.test(runId))
    throw new Error('Invalid clock run ID');
  const directory = `${isolation.testRoot}/clock${runId ? `/${runId}` : ''}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = `${directory}/${process.pid}.jsonl`;
  const NativeDate = Date,
    nativeNow = Date.now.bind(Date);
  let before = { wallMs: nativeNow(), monoMs: performance.now() },
    seq = 0;
  const timer = setInterval(() => {
    const after = { wallMs: nativeNow(), monoMs: performance.now() };
    appendFileSync(
      file,
      JSON.stringify({
        source: process.argv[1],
        pid: process.pid,
        seq: seq++,
        utc: new NativeDate(after.wallMs).toISOString(),
        ...after,
        ...clockDelta(before, after),
      }) + '\n',
      { mode: 0o600 },
    );
    before = after;
  }, 100);
  timer.unref();
}
