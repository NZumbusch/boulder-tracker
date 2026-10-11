/**
 * Reads the JSON out of text pasted from a chat app. Replies often come with
 * a sentence before or after the data ("Here's your plan!") or wrapped in a
 * code fence, so this takes the outermost `{…}` (or `[…]`) when the whole
 * text isn't JSON itself. The error is written for the person pasting, not
 * for a developer.
 */
export type JsonParse = { ok: true; value: unknown } | { ok: false; message: string };

const FRIENDLY = "I couldn't read that as the AI's JSON answer. Paste the whole reply, starting at the first { and ending at the last }.";
const TRUNCATED = "The reply looks cut off - it stops before the JSON is complete. Ask the AI to continue, or to answer again, then paste the whole reply.";

export function parseJsonReply(text: string): JsonParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "There's nothing to read yet - paste the AI's reply." };
  const attempts: string[] = [trimmed];
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (fenced !== trimmed) attempts.push(fenced);
  const inFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (inFence) attempts.push(inFence[1].trim());
  const open = trimmed.search(/[{[]/);
  if (open >= 0) {
    const close = trimmed[open] === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(close);
    if (end > open) attempts.push(trimmed.slice(open, end + 1));
  }
  for (const attempt of attempts) {
    try {
      return { ok: true, value: JSON.parse(attempt) };
    } catch {
      // try the next reading
    }
  }
  const depth = (trimmed.match(/[{[]/g)?.length ?? 0) - (trimmed.match(/[}\]]/g)?.length ?? 0);
  return { ok: false, message: open >= 0 && depth > 0 ? TRUNCATED : FRIENDLY };
}
