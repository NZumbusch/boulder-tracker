/**
 * Chrome's "install this web app" prompt, held back until the user asks for
 * it, and the "Get the Android app" card's dismissal (web build only; see
 * AndroidAppCard.svelte).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "boulder_tracker_android_card_dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

class InstallPrompt {
  #event: BeforeInstallPromptEvent | null = null;
  /** Chrome offered to install the web app and it hasn't been used yet. */
  canInstallWebApp = $state(false);
  cardDismissed = $state(readDismissed());

  listen(): void {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.#event = e as BeforeInstallPromptEvent;
      this.canInstallWebApp = true;
    });
    window.addEventListener("appinstalled", () => {
      this.#event = null;
      this.canInstallWebApp = false;
    });
  }

  async installWebApp(): Promise<void> {
    const event = this.#event;
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    // The browser only lets an event be used once.
    this.#event = null;
    this.canInstallWebApp = false;
  }

  dismissCard(): void {
    this.cardDismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* the card just comes back next time */
    }
  }
}

export const installPrompt = new InstallPrompt();
