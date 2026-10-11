/** Which goal's taper view is open, if any. */
class TaperViewState {
  goalId = $state<string | null>(null);
}

export const taperView = new TaperViewState();
export const openTaperView = (goalId: string) => (taperView.goalId = goalId);
