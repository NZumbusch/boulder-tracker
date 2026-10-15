import { describe, expect, it } from 'vitest';
import { READINESS_WORD } from './readinessWords';

describe('READINESS_WORD', () => {
  it('names every status in plain words, none of them the raw enum', () => {
    expect(Object.keys(READINESS_WORD).sort()).toEqual(['caution', 'good', 'neutral', 'risk']);
    for (const [status, word] of Object.entries(READINESS_WORD)) expect(word.toLowerCase()).not.toBe(status);
  });
});
