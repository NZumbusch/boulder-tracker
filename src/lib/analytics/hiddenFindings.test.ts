import { describe, it, expect } from 'vitest';
import { validateHiddenFindings, withHidden, withoutHidden, splitFindings, MAX_HIDDEN_FINDINGS } from './hiddenFindings';
import { topFindings, type Insight } from './insights';

const f = (id: string, tone: Insight['tone'] = 'info'): Insight => ({ id, group: 'push', tone, title: id });

describe('hidden findings list', () => {
  it('keeps unique non-empty strings and drops the rest', () => {
    expect(validateHiddenFindings(['a', 'a', '', 3, null, 'b'])).toEqual(['a', 'b']);
    expect(validateHiddenFindings('a')).toEqual([]);
    expect(validateHiddenFindings(undefined)).toEqual([]);
  });
  it('is capped, newest kept', () => {
    const many = Array.from({ length: MAX_HIDDEN_FINDINGS + 5 }, (_, i) => `f${i}`);
    const out = validateHiddenFindings(many);
    expect(out).toHaveLength(MAX_HIDDEN_FINDINGS);
    expect(out.at(-1)).toBe(`f${MAX_HIDDEN_FINDINGS + 4}`);
  });
  it('adds once and removes', () => {
    expect(withHidden(['a'], 'b')).toEqual(['a', 'b']);
    expect(withHidden(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(withoutHidden(['a', 'b'], 'a')).toEqual(['b']);
    expect(withoutHidden(['a'], 'zzz')).toEqual(['a']);
  });
});

describe('splitFindings', () => {
  const all = [f('x', 'risk'), f('y', 'good'), f('z', 'good')];
  it('separates shown from hidden, ignoring ids that are not firing', () => {
    const r = splitFindings(all, ['y', 'gone']);
    expect(r.shown.map((i) => i.id)).toEqual(['x', 'z']);
    expect(r.hidden.map((i) => i.id)).toEqual(['y']);
  });
  it('hiding before the overview picks lets the next one in', () => {
    const goods = [f('g1', 'good'), f('g2', 'good'), f('g3', 'good')];
    expect(topFindings(splitFindings(goods, ['g1']).shown).map((i) => i.id)).toEqual(['g2', 'g3']);
  });
});
