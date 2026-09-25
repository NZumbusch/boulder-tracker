/**
 * Opens what a `bouldertracker://` link names (see `navigation/deepLink`):
 * the launcher shortcuts and the home-screen widget start the app with one.
 * A cold start reads it from the launch intent; a warm one gets an
 * `appUrlOpen` event.
 */
import { Capacitor } from "@capacitor/core";
import { trainingState } from "../state.svelte";
import { parseDeepLink, type DeepLink } from "../navigation/deepLink";

export function openDeepLink(link: DeepLink): void {
  switch (link.kind) {
    case "session":
      // The running session if there is one, else the Start screen to begin one.
      if (trainingState.isSessionActive) trainingState.sessionStore.openModal();
      else trainingState.navigate("add");
      break;
    case "quickLog":
    case "metrics":
      trainingState.sessionStore.minimize();
      trainingState.navigate("home");
      trainingState.uiStore.homeRequest = link.kind;
      break;
    case "view":
      trainingState.navigate(link.view);
      break;
  }
}

export async function installDeepLinks(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  const open = (url: string | undefined) => {
    const link = parseDeepLink(url);
    if (link) openDeepLink(link);
  };
  await App.addListener("appUrlOpen", (event) => open(event.url));
  open((await App.getLaunchUrl())?.url);
}
