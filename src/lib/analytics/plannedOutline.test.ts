import { describe, it, expect } from 'vitest';
import { outlineHeights, columnPlannedLoad } from './plannedOutline';
import type { Workout } from '../types';

describe('outlineHeights', () => {
  it('scales to its own tallest week and leaves unplanned weeks bare', () => {
    expect(outlineHeights([0, 50, 100], 80)).toEqual([null, 40, 80]);
  });
  it('is all bare with nothing planned', () => {
    expect(outlineHeights([0, 0])).toEqual([null, null]);
    expect(outlineHeights([])).toEqual([]);
  });
  it('a tiny week still shows a sliver', () => {
    expect(outlineHeights([1, 1000])[0]).toBeGreaterThanOrEqual(3);
  });
});

describe('columnPlannedLoad', () => {
  it('is 0 for no sessions or sessions without exercises', () => {
    expect(columnPlannedLoad([])).toBe(0);
    expect(columnPlannedLoad([{ status: 'planned', exercises: [] } as unknown as Workout])).toBe(0);
  });
});
