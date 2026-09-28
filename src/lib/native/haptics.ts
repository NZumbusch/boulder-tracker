import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Short vibrations that confirm an action landed: finishing an exercise,
 * saving a session, a swipe or long-press doing something. Native app via
 * @capacitor/haptics; a browser gets a tiny `navigator.vibrate` where it
 * has one (Android Chrome), nothing elsewhere. Never throws.
 *
 * Switched off with Settings -> Sessions & Timer -> Haptic feedback;
 * `App.svelte` keeps `hapticsConfig.enabled` in step with that preference.
 */
export const hapticsConfig = { enabled: true };

export type HapticKind = "tap" | "select" | "success" | "warning";

export function haptic(kind: HapticKind = "tap") {
  if (!hapticsConfig.enabled) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const p =
        kind === "success" ? Haptics.notification({ type: NotificationType.Success })
        : kind === "warning" ? Haptics.notification({ type: NotificationType.Warning })
        : Haptics.impact({ style: kind === "select" ? ImpactStyle.Medium : ImpactStyle.Light });
      void p.catch(() => {});
    } else if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(kind === "success" ? [12, 60, 12] : kind === "select" ? 18 : 10);
    }
  } catch {
    // Feedback is a nicety; it must never break the action it confirms.
  }
}
