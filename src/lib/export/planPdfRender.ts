import type { TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * Prints a pdfmake document to a Blob. pdfmake and its fonts (~1 MB) are
 * loaded here, on export only, never with the rest of the app.
 */
export async function renderPdf(doc: TDocumentDefinitions): Promise<Blob> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfMake = ((pdfMakeModule as { default?: unknown }).default ?? pdfMakeModule) as {
    addVirtualFileSystem: (vfs: Record<string, string>) => void;
    createPdf: (doc: TDocumentDefinitions) => { getBlob: () => Promise<Blob> };
  };
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const vfs = ((fontsModule as { default?: unknown }).default ?? fontsModule) as Record<string, string>;
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(doc).getBlob();
}
