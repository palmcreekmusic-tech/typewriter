import { describe, expect, it } from 'vitest';
import { RoundRobin } from '../src/audio/samples';
import { rngFor } from '../src/engine/rng';

describe('round-robin takes', () => {
  it('never plays the same take twice running, and uses them all', () => {
    const rr = new RoundRobin();
    const r = rngFor(1, 'rr');
    const picks = Array.from({ length: 200 }, () => rr.pick('key-normal', 5, r));
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
    expect(new Set(picks).size).toBe(5);
  });

  it('copes with a single take', () => {
    expect(new RoundRobin().pick('bell', 1, Math.random)).toBe(0);
  });
});
