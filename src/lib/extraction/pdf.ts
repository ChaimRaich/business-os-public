import { join } from "node:path";

// Longest side, in pixels, of a rendered PDF page. About 220 DPI for an A4 page,
// enough to read the small print of an invoice table.
const PAGE_LONG_SIDE = 2576;
const MAX_PAGES = 30;

/**
 * Renders every page of a PDF to a PNG, for models that accept images but not PDFs.
 * The page is drawn as it looks, so right-to-left text keeps its printed order.
 * Each page also carries its embedded text, which settles look-alike characters (O and 0).
 */
export async function renderPdfPages(data: Buffer): Promise<{ image: Buffer; text: string }[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const assets = (folder: string) => join(process.cwd(), "node_modules/pdfjs-dist", folder) + "/";

  const loading = pdfjs.getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: assets("standard_fonts"),
    cMapUrl: assets("cmaps"),
    wasmUrl: assets("wasm"),
    iccUrl: assets("iccs"),
  });

  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_PAGES) {
      throw new Error(`PDF has ${pdf.numPages} pages, more than the ${MAX_PAGES} supported`);
    }
    const pages: { image: Buffer; text: string }[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE_LONG_SIDE / Math.max(base.width, base.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
      pages.push({ image: canvas.toBuffer("image/png"), text });
      page.cleanup();
    }
    return pages;
  } finally {
    await loading.destroy();
  }
}
