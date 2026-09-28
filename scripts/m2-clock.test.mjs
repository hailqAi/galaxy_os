import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockDelta, clockEvidence } from './m2-clock-monitor.mjs';

test('đánh dấu bước lùi/tiến wall clock, không nhầm khoảng chờ dài với drift', () => {
  const before = { wallMs: 1000000, monoMs: 10 };
  assert.equal(
    clockDelta(before, { wallMs: 1010000, monoMs: 10010 }).contaminated,
    false,
  );
  assert.equal(
    clockDelta(before, { wallMs: 817000, monoMs: 110 }).contaminated,
    true,
  );
  assert.equal(
    clockDelta(before, { wallMs: 1183000, monoMs: 110 }).contaminated,
    true,
  );
});

test('missing, invalid or failed baseline evidence never passes the clock gate', () => {
  const samples = [
    { pid: 1, wallMs: 1, monoMs: 1, monoDeltaMs: 20000, contaminated: false },
    {
      pid: 1,
      wallMs: 20001,
      monoMs: 20001,
      monoDeltaMs: 20000,
      contaminated: false,
    },
  ];
  assert.equal(clockEvidence([]), 'CLOCK_UNVERIFIED');
  assert.equal(clockEvidence([{}]), 'CLOCK_UNVERIFIED');
  assert.equal(clockEvidence(samples, 1), 'CLOCK_UNVERIFIED');
  assert.equal(clockEvidence(samples), 'CLEAN');
  assert.equal(
    clockEvidence([...samples, { ...samples[0], contaminated: true }]),
    'CLOCK_CONTAMINATED',
  );
});

test('baseline samples cannot substitute for a missing test-process clock', () => {
  const samples = [
    { pid: 1, wallMs: 1, monoMs: 1, monoDeltaMs: 45000, contaminated: false },
    { pid: 1, wallMs: 2, monoMs: 2, monoDeltaMs: 1, contaminated: false },
  ];
  assert.equal(
    clockEvidence(samples, 0, { pid: 2, minimumCoverage: 1000 }),
    'CLOCK_UNVERIFIED',
  );
});
