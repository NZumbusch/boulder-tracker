import { describe, expect, it } from 'vitest';
import { nextPlannedSession } from './nextSession';
import type { Workout } from '../types';

const w = (id: string, dayOfWeek: Workout['dayOfWeek']) => ({ id, dayOfWeek, status: 'planned' }) as Workout;

describe('nextPlannedSession', () => {
  // Thursday 15 Oct 2026 is in week 42.
  const asOf = new Date(2026, 9, 15, 9);
  it('finds tomorrow', () => {
    const next = nextPlannedSession(asOf, (id) => (id === '2026-W42' ? [w('a', 'Friday')] : []));
    expect(next?.workout.id).toBe('a');
    expect(next?.daysAhead).toBe(1);
    expect(next?.date).toBe('2026-10-16');
  });
  it('crosses into next week', () => {
    const next = nextPlannedSession(asOf, (id) => (id === '2026-W43' ? [w('b', 'Monday')] : []));
    expect(next?.daysAhead).toBe(4);
    expect(next?.date).toBe('2026-10-19');
  });
  it('ignores today and gives up past the horizon', () => {
    expect(nextPlannedSession(asOf, (id) => (id === '2026-W42' ? [w('c', 'Thursday')] : []))).toBeUndefined();
    expect(nextPlannedSession(asOf, (id) => (id === '2026-W44' ? [w('d', 'Monday')] : []))).toBeUndefined();
  });
});
