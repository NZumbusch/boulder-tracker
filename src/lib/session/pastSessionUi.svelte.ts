/**
 * Whether the "Log a past session" sheet is open - one sheet, mounted once in
 * App, opened from History and the Plan. See `PastSessionSheet.svelte`.
 */
export const pastSessionSheet = $state<{ open: boolean }>({ open: false });

export function openPastSessionSheet() {
  pastSessionSheet.open = true;
}

export function closePastSessionSheet() {
  pastSessionSheet.open = false;
}
