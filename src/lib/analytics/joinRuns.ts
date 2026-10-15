/**
 * Groups column indices into runs of neighbours.
 *
 * A line through two points with empty columns between them reads as a
 * trend (a slope from 7A down to 6C+ across two months of no sends looks
 * like decline), when the weeks in between simply had no data. So a line
 * is drawn only inside a run of adjacent columns; a lone column stays a dot.
 *
 * `indices` must be ascending.
 */
export function adjacentRuns(indices: number[]): number[][] {
  const runs: number[][] = [];
  for (const i of indices) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === i - 1) run.push(i);
    else runs.push([i]);
  }
  return runs;
}
