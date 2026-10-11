/** Whether Home's "what is this ACWR made of" sheet is open - opened from the week card's chip and the readiness breakdown's Load row. */
class AcwrSheetState {
  open = $state(false);
}

export const acwrSheet = new AcwrSheetState();

export function showAcwr(): void {
  acwrSheet.open = true;
}
