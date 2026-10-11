/** Which block's review sheet is open, if any. */
class BlockReviewState {
  blockId = $state<string | null>(null);
}

export const blockReviewState = new BlockReviewState();
export const openBlockReview = (blockId: string) => (blockReviewState.blockId = blockId);
