import { showAlert } from "../utils";
import { shareImage, copyImageToClipboard, type ShareImageOptions } from "./imageShare";

/**
 * Turning a rendered card into an image and handing it on - shared by the
 * session and week share cards. html2canvas is loaded on first use: it's
 * large, and only needed once someone actually shares.
 */

async function render(node: HTMLElement): Promise<{ blob: Blob; dataUrl: string }> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(node, { scale: 3, useCORS: true, backgroundColor: null, logging: false });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to create image blob");
  return { blob, dataUrl: canvas.toDataURL("image/png") };
}

/** Renders `node` and copies it to the clipboard, saying how that went. */
export async function copyCard(node: HTMLElement): Promise<void> {
  try {
    const { blob } = await render(node);
    const outcome = await copyImageToClipboard(blob);
    if (outcome === "copied") await showAlert("Copied", "The card is on your clipboard.");
    else if (outcome === "unsupported") await showAlert("Not available here", "This device can't copy images to the clipboard. Use Share instead.");
    else await showAlert("Copy failed", "The image could not be copied. Use Share instead.");
  } catch (err) {
    console.error("Failed to generate share image:", err);
    await showAlert("Something went wrong", "The card could not be generated.");
  }
}

/** Renders `node` and shares it (native sheet, web share, or a download), saying so only when it isn't obvious. */
export async function shareCard(node: HTMLElement, options: Omit<ShareImageOptions, "blob" | "dataUrl">): Promise<void> {
  try {
    const { blob, dataUrl } = await render(node);
    const outcome = await shareImage({ ...options, blob, dataUrl });
    if (outcome === "downloaded") await showAlert("Saved", "The card was saved to your downloads.");
    else if (outcome === "failed") await showAlert("Share failed", "The card could not be shared.");
    // "shared" and "dismissed" both speak for themselves - no alert.
  } catch (err) {
    console.error("Failed to generate share image:", err);
    await showAlert("Something went wrong", "The card could not be generated.");
  }
}
