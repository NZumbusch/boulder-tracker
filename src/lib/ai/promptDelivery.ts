/**
 * Getting a big prompt to the AI whole, and its reply back whole.
 *
 * - The prompt says at its top that it ends with `PROMPT_END`, and ends with
 *   it: a chat app or a clipboard that cut a long paste short is then caught
 *   by the AI itself ("the end line is missing") instead of answered from
 *   half the data.
 * - The reply rules let the AI hand back its JSON as a file when the answer
 *   is long (Claude and others can make files): a chat answer can stop at the
 *   model's output limit, a file is read whole. The app opens either.
 * - The prompt itself can go out as a .txt file (share sheet), which avoids
 *   the clipboard and the chat box's own limits (`promptFileName`).
 */
import { localIsoDate } from "../dateUtils";

export const PROMPT_END = "END OF PROMPT";

const HEAD = `(This prompt ends with the line "${PROMPT_END}". If that line is not at the very end of what you received, the text was cut off on the way: tell me so and stop, rather than answer from part of it.)`;

/** The prompt with the cut-off check: a note at the top, the end line at the bottom. */
export function withPromptEnd(prompt: string): string {
  return `${HEAD}\n\n${prompt.trimEnd()}\n\n${PROMPT_END}`;
}

/** True when a prompt ends with the end line - what arrived is whole. */
export function hasPromptEnd(text: string): boolean {
  return text.trimEnd().endsWith(PROMPT_END);
}

/** The reply file's name the AI is asked to use. */
export const REPLY_FILE_NAME = "boulder-tracker-reply.json";

/**
 * The first line of a JSON-only reply's rules: plain JSON in the chat, or - when it is long - the same JSON as an
 * attached file. Never split over several messages (the app reads one piece).
 */
export const JSON_REPLY_RULE = `Respond with ONLY one JSON object - no markdown fences, no text before or after it. If the JSON is long (roughly more than 300 lines, or you might reach your answer length limit) and you can create files, attach it instead as a file named "${REPLY_FILE_NAME}" that holds only that JSON object, and write just one short line in the chat. Never split the JSON over several messages.`;

/** The name of a prompt shared as a file. */
export function promptFileName(date: Date = new Date()): string {
  return `boulder-tracker-prompt-${localIsoDate(date)}.txt`;
}

/** Most a reply file may be - a change set is a few hundred kB at the very most. */
export const MAX_REPLY_FILE_BYTES = 5_000_000;
