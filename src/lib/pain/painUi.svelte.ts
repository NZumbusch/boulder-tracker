/**
 * Which pain screen is open - the issue page or the new-issue form. Both
 * are mounted once in App, so Home's check-in card, an alert, Analytics
 * and the quick-log sheet all open the same thing.
 */
export const painUi = $state<{ issueId: string | null; reporting: boolean }>({ issueId: null, reporting: false });

export function openPainIssue(id: string) {
  painUi.reporting = false;
  painUi.issueId = id;
}

export function openPainReport() {
  painUi.issueId = null;
  painUi.reporting = true;
}

export function closePainScreens() {
  painUi.issueId = null;
  painUi.reporting = false;
}
