import { toast } from "../toast.svelte";

/** Copies this page's address (without the #fragment) and says so - for "open it in the real browser" (Welcome, the in-app-browser banner). */
export async function copyPageLink(browserName: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href.split("#")[0]);
    toast.show(`Link copied. Paste it into ${browserName}.`);
  } catch {
    toast.show(`Couldn't copy. Use the app's menu → "Open in browser".`);
  }
}
