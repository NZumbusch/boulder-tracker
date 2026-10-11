/**
 * What the "Get started" card remembers on this device: that the tour has
 * been started, and that the card was closed. Plain localStorage flags
 * (device-local on purpose - each device is a first run of its own), held in
 * reactive state so the card updates when the tour ends.
 */
const TOUR_KEY = "boulder_tracker_tour_seen";
const DISMISS_KEY = "boulder_tracker_checklist_dismissed";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* the flag just isn't remembered */
  }
}

class ChecklistState {
  tourSeen = $state(read(TOUR_KEY));
  dismissed = $state(read(DISMISS_KEY));

  markTourSeen(): void {
    this.tourSeen = true;
    write(TOUR_KEY);
  }

  dismiss(): void {
    this.dismissed = true;
    write(DISMISS_KEY);
  }
}

export const checklistState = new ChecklistState();
