import { describe, it, expect } from 'vitest';
import { planNote, logNote } from './exerciseSlot';
import type { ExerciseSlot } from './types';

describe('planNote / logNote', () => {
  const slot = (prescribed?: string, logged?: string): ExerciseSlot => ({
    id: 's', typeId: 't',
    prescribed: prescribed === undefined ? undefined : { notes: prescribed },
    logged: logged === undefined ? undefined : { notes: logged },
  });
  it('keeps the plan note and the log note apart', () => {
    expect(planNote(slot('focus on feet', 'felt strong'))).toBe('focus on feet');
    expect(logNote(slot('focus on feet', 'felt strong'))).toBe('felt strong');
  });
  it('treats a log note copied from the plan (old logs) as no log note', () => {
    expect(logNote(slot('focus on feet', 'focus on feet'))).toBe('');
  });
  it('is empty when nothing was written', () => {
    expect(planNote(slot())).toBe('');
    expect(logNote(slot('x'))).toBe('');
  });
});
