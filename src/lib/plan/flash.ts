/**
 * Brings a session to the user's eye after a view switch: a brief ring on the element carrying its id
 * (`data-session-id`) inside `root`, or on `root` itself when no session is known or found.
 */
export function flashSession(root: ParentNode | null | undefined, sessionId?: string): void {
  if (!root) return;
  const row = sessionId ? root.querySelector<HTMLElement>(`[data-session-id="${CSS.escape(sessionId)}"]`) : null;
  const el = row ?? (root instanceof HTMLElement ? root : null);
  if (!el) return;
  if (row) row.scrollIntoView({ behavior: "auto", block: "center" });
  el.classList.remove("plan-flash");
  void el.offsetWidth;
  el.classList.add("plan-flash");
  setTimeout(() => el.classList.remove("plan-flash"), 1800);
}
