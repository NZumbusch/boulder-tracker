/** One week column of the Load and Mix charts. */
export interface ChartWeek {
  id: string;
  /** The week number, "34". */
  label: string;
  totalLoad: number;
  totalPlannedLoad: number;
  /** Minutes per category name, planned and completed sessions together. */
  categories: Record<string, number>;
  /** Minutes per category name, completed sessions only. */
  completedCategories: Record<string, number>;
  totalDuration: number;
  isCurrent: boolean;
}

/** The visible week window's chart data, built once in Analytics.svelte and shared by its panels. */
export interface ChartData {
  weeks: ChartWeek[];
  /** The load axis' top, padded above the tallest bar or target. */
  maxLoad: number;
}
