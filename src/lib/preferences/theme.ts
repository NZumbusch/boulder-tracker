/**
 * The theme choice and what it resolves to. "system" (the default) follows
 * the phone's light/dark setting; the other three are
 * fixed choices. Only the resolved theme ever reaches `data-theme`.
 */
export type ThemePreference = "system" | "dark" | "light" | "contrast";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEMES: ThemePreference[] = ["system", "light", "dark", "contrast"];
export const DEFAULT_THEME: ThemePreference = "system";

/** A stored value back to a choice; anything unknown (or nothing stored yet) is the default. */
export function parseTheme(raw: unknown): ThemePreference {
  return THEMES.includes(raw as ThemePreference) ? (raw as ThemePreference) : DEFAULT_THEME;
}

export function resolveTheme(choice: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (choice !== "system") return choice;
  return systemDark ? "dark" : "light";
}
