import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";

/**
 * Getting a generated PNG out of the app.
 *
 * Three targets, because no single one works everywhere:
 * - **Native (Capacitor)**: the WebView has no clipboard-image support and
 *   no Web Share API, and an `<a download>` does nothing without a
 *   DownloadListener - which is why the old "Copy to Clipboard" button
 *   silently did nothing on the phone. The file is written to the cache
 *   directory and handed to the native share sheet, the same
 *   Filesystem+Share pair `storage.exportData` already uses.
 * - **Mobile web**: `navigator.share` with a file, when the browser says
 *   it can.
 * - **Desktop/anything else**: a plain download.
 *
 * Every entry point reports what actually happened rather than failing
 * quietly, so the UI can say something true.
 */

export type ShareOutcome =
  | "shared"
  | "downloaded"
  | "dismissed"
  | "failed";

export type CopyOutcome = "copied" | "unsupported" | "failed";

/** A stable, human-readable file name for a session's share image. */
export function shareImageFileName(date: string | null | undefined): string {
  const day = toIsoDay(date) ?? toIsoDay(new Date().toISOString())!;
  return `boulder-session-${day}.png`;
}

/** The `YYYY-MM-DD` part of an ISO date, or `null` if it isn't a date. */
function toIsoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

/**
 * The payload half of a `data:` URL.
 *
 * `Filesystem.writeFile` wants bare base64, not the whole URL - passing
 * the `data:image/png;base64,` prefix through writes a corrupt file that
 * only fails later, when something tries to open the image.
 */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma === -1) {
    throw new Error("Not a data URL");
  }
  return dataUrl.slice(comma + 1);
}

/**
 * Copies a PNG to the clipboard.
 *
 * Returns `"unsupported"` rather than throwing where the platform has no
 * image clipboard at all (every Capacitor WebView, Firefox until
 * recently), so the caller can offer sharing instead of showing an error
 * for something that was never going to work.
 */
export async function copyImageToClipboard(blob: Blob): Promise<CopyOutcome> {
  if (Capacitor.isNativePlatform()) return "unsupported";
  if (typeof navigator === "undefined" || !navigator.clipboard) return "unsupported";
  if (typeof ClipboardItem === "undefined") return "unsupported";
  if (typeof window !== "undefined" && !window.isSecureContext) return "unsupported";

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch (err) {
    console.error("Clipboard image write failed:", err);
    return "failed";
  }
}

/** True where a clipboard attempt has any chance - lets the UI hide the button rather than offer a dead one. */
export function canCopyImages(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  if (typeof ClipboardItem === "undefined") return false;
  if (typeof window !== "undefined" && !window.isSecureContext) return false;
  return true;
}

export interface ShareImageOptions {
  blob: Blob;
  /** The same image as a data URL - native needs base64, not a Blob. */
  dataUrl: string;
  fileName: string;
  title: string;
  text: string;
}

/**
 * Hands the image to whatever the platform uses for sharing - the native
 * share sheet, the Web Share API, or a download.
 *
 * The native share sheet *is* the social-media path: Instagram, WhatsApp,
 * Signal and the rest register as share targets, so there is nothing
 * per-network to special-case here.
 */
export async function shareImage(options: ShareImageOptions): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    return shareNative(options);
  }
  return shareWeb(options);
}

async function shareNative({ dataUrl, fileName, title, text }: ShareImageOptions): Promise<ShareOutcome> {
  try {
    const written = await Filesystem.writeFile({
      path: fileName,
      data: dataUrlToBase64(dataUrl),
      directory: Directory.Cache,
      // No `encoding`: that is what tells Filesystem the data is base64
      // binary rather than text. Passing Encoding.UTF8 here (as the JSON
      // export legitimately does) would mangle the PNG.
    });

    await Share.share({ title, text, url: written.uri, dialogTitle: title });
    return "shared";
  } catch (err) {
    if (isDismissal(err)) return "dismissed";
    console.error("Native image share failed:", err);
    return "failed";
  }
}

async function shareWeb({ blob, fileName, title, text }: ShareImageOptions): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: "image/png" });

  const canShareFile =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({ title, text, files: [file] });
      return "shared";
    } catch (err) {
      // A user closing the share sheet is not a failure, and must not be
      // reported as one or followed by a surprise download.
      if (isDismissal(err)) return "dismissed";
      console.error("Web share failed, falling back to download:", err);
    }
  }

  return downloadBlob(blob, fileName) ? "downloaded" : "failed";
}

/** Saves the image via a temporary object URL, always revoking it. */
export function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (err) {
    console.error("Image download failed:", err);
    return false;
  } finally {
    // Deferred: revoking synchronously can cancel the download the click
    // has only just started.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Whether a rejection is the user closing the share sheet rather than something going wrong. */
export function isDismissal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (name === "AbortError") return true;
  return typeof message === "string" && /abort|cancel|dismiss/i.test(message);
}
