import { describe, it, expect } from 'vitest';
import { isCollapsible } from './collapse';
import { HOME_SECTION_IDS } from '../preferences/migrate';

describe('isCollapsible', () => {
  it('every card folds except the Readiness hero', () => {
    expect(HOME_SECTION_IDS.filter((id) => !isCollapsible(id))).toEqual(['readiness']);
  });
});
