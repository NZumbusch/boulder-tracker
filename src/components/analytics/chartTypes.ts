/** One week column of the Load and Mix charts. */
export interface ChartWeek {
  id: string;
  /** Axis label: "W34" for a week column, "Sep" for a month column (the year view). */
  label: string;
  /** Rated session load - the load History, Home and ACWR use. */
  totalLoad: number;
  /** How much of the column's planned work is logged (see `planProgress`); undefined with nothing planned. */
  planProgress?: number;
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
  /** The load axis' top, padded above the tallest bar. */
  maxLoad: number;
}
