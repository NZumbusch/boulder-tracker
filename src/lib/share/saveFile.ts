import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { downloadBlob, isDismissal, type ShareOutcome } from "./imageShare";
import { isIOS, readBrowserInfo } from "../pwa/platform";

/**
 * Getting an exported file (backup, calendar, CSV, PDF) off the device.
 *
 * - **Android app**: an `<a download>` does nothing in the WebView (see
 *   imageShare.ts), so the file goes to the cache directory and the
 *   native share sheet, where "Save to Files/Drive" lives.
 * - **iPhone/iPad**: a download link in a home-screen app opens a preview
 *   with no way back, so the file goes to the share sheet ("Save to
 *   Files", AirDrop, mail).
 * - **Everywhere else**: a plain download.
 */
export interface SaveFileOptions {
  /** Text files are written as UTF-8; anything else (PDF) as binary. */
  content: string | Blob;
  fileName: string;
  mimeType: string;
  title: string;
}

export async function saveFile({ content, fileName, mimeType, title }: SaveFileOptions): Promise<ShareOutcome> {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;

  if (Capacitor.isNativePlatform()) {
    try {
      const written = await Filesystem.writeFile(
        typeof content === "string"
          ? { path: fileName, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 }
          : { path: fileName, data: await blobToBase64(blob), directory: Directory.Cache },
      );
      await Share.share({ title, url: written.uri, dialogTitle: title });
      return "shared";
    } catch (err) {
      if (isDismissal(err)) return "dismissed";
      console.error("Native file export failed:", err);
      return "failed";
    }
  }

  if (isIOS(readBrowserInfo(false)) && typeof navigator.share === "function") {
    const file = new File([blob], fileName, { type: mimeType });
    if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title, files: [file] });
        return "shared";
      } catch (err) {
        if (isDismissal(err)) return "dismissed";
        console.error("Web share failed, falling back to download:", err);
      }
    }
  }

  return downloadBlob(blob, fileName) ? "downloaded" : "failed";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
