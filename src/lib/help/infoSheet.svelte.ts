import type { TermId } from "./glossary";

/** Which glossary term the app-wide `InfoSheet` is showing, if any. */
class InfoSheetState {
  term = $state<TermId | null>(null);
}

export const infoSheet = new InfoSheetState();

export function showInfo(term: TermId): void {
  infoSheet.term = term;
}
