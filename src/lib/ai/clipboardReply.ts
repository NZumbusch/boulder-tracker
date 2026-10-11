/**
 * Whether clipboard text looks like an AI's change-set reply (a JSON object,
 * possibly in a code fence) - so coming back from the chat can pick it up
 * without the athlete pasting, and never takes some other text they copied.
 */
export function looksLikeReply(text: string): boolean {
  return /^\s*(```(?:json)?\s*)?\{/.test(text) && text.includes('"') && text.includes("}");
}
