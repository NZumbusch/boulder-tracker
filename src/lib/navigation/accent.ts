import type { NavAccent } from "../preferences/migrate";

/**
 * The classes that say "you are here" in the bottom bar, the rail and the drawer, and colour the floating +, for the
 * chosen accent. One place so the three navigations cannot drift apart again. Written out in full so Tailwind finds them.
 */
export interface AccentClasses {
  /** The icon and label of the current destination. */
  text: string;
  /** The soft pill behind the current destination. */
  tint: string;
  /** A solid fill (the floating +) with the ink that reads on it. */
  solid: string;
}

export function accentClasses(accent: NavAccent): AccentClasses {
  return accent === "green"
    ? { text: "text-success", tint: "bg-success/12", solid: "bg-success text-app-bg" }
    : { text: "text-primary", tint: "bg-primary/12", solid: "bg-primary text-on-primary" };
}
