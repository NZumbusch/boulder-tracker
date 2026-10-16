/**
 * Which Home cards fold to their header, and the context key `CollapsibleCard`
 * shares with `SectionHeader`. The folded set itself is the `homeCollapsed`
 * preference (validated against the section ids in `preferences/migrate.ts`);
 * every card starts open.
 */
import type { HomeSectionId } from '../preferences/migrate';

export const HOME_COLLAPSE = Symbol('home-collapse');

export interface HomeCollapse {
  enabled: boolean;
  collapsed: boolean;
  toggle: () => void;
}

/** The Readiness hero is the one card without a title row to tap. */
const NOT_COLLAPSIBLE: readonly HomeSectionId[] = ['readiness'];

export function isCollapsible(id: HomeSectionId): boolean {
  return !NOT_COLLAPSIBLE.includes(id);
}
