import { describe, it, expect } from 'vitest';
import { WEEK_PATTERNS, patternAt, patternForPhase, patternStyle, weekMatchesPhaseFilter } from './weekPatterns';

describe('week patterns', () => {
  it('the first phase is plain and the next ones all differ', () => {
    expect(patternAt(0).image).toBe('none');
    expect(new Set(WEEK_PATTERNS.map((p) => p.image)).size).toBe(WEEK_PATTERNS.length);
  });
  it('wraps past the last pattern and never fails on a negative index', () => {
    expect(patternAt(WEEK_PATTERNS.length)).toBe(patternAt(0));
    expect(patternAt(-1)).toBe(WEEK_PATTERNS[WEEK_PATTERNS.length - 1]);
  });
  it('is by place in the list: same phase, same pattern', () => {
    const ids = ['a', 'b', 'c'];
    expect(patternForPhase('b', ids)).toBe(patternAt(1));
    expect(patternForPhase('b', ids)).toBe(patternForPhase('b', ids));
    expect(patternForPhase(undefined, ids).image).toBe('none');
    expect(patternForPhase('zzz', ids).image).toBe('none');
  });
  it('plain draws nothing, others draw an image (and a size when they need one)', () => {
    expect(patternStyle(patternAt(0))).toBe('');
    expect(patternStyle(patternAt(1))).toContain('background-image');
    expect(patternStyle(patternAt(2))).toContain('background-size');
  });
});

describe('weekMatchesPhaseFilter', () => {
  it('no choice shows every week', () => {
    expect(weekMatchesPhaseFilter(['a'], new Set())).toBe(true);
    expect(weekMatchesPhaseFilter([undefined], new Set())).toBe(true);
  });
  it('a split week matches any of its phases; a week without a phase matches nothing', () => {
    expect(weekMatchesPhaseFilter(['a', 'b'], new Set(['b']))).toBe(true);
    expect(weekMatchesPhaseFilter(['a'], new Set(['b']))).toBe(false);
    expect(weekMatchesPhaseFilter([undefined], new Set(['b']))).toBe(false);
    expect(weekMatchesPhaseFilter([], new Set(['b']))).toBe(false);
  });
});
