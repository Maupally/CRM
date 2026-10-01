/**
 * Deterministic file work the assistant can ask for: QR codes and stamping a QR onto a
 * PDF or a poster image. Done here rather than in the model's sandbox, because the
 * sandbox has no QR library and a QR code has to be exactly right to scan.
 */
import QRCode from 'qrcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function qrPng(text: string, px = 1024): Promise<Uint8Array> {
  return new Uint8Array(await QRCode.toBuffer(text, { type: 'png', width: px, margin: 2, errorCorrectionLevel: 'M' }));
}

export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';

export interface StampOptions {
  url: string;
  /** 1-based page; 0 = every page */
  page?: number;
  corner?: Corner;
  /** QR side in millimetres */
  sizeMm?: number;
  /** Short line printed under the code, e.g. "Zapisy: maplebear.pl" */
  caption?: string;
}

const MM = 72 / 25.4;

/** Returns a PDF: the original PDF, or the image placed on a page of its own size, with the QR code on it. */
export async function stampQr(input: Uint8Array, mime: string, o: StampOptions): Promise<Uint8Array> {
  let doc: PDFDocument;
  if (mime === 'application/pdf') {
    doc = await PDFDocument.load(input, { ignoreEncryption: true });
  } else if (mime === 'image/png' || mime === 'image/jpeg') {
    doc = await PDFDocument.create();
    const img = mime === 'image/png' ? await doc.embedPng(input) : await doc.embedJpg(input);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  } else {
    throw new Error('Kod QR mogę nanieść na PDF, PNG albo JPG.');
  }

  const qr = await doc.embedPng(await qrPng(o.url));
  const font = o.caption ? await doc.embedFont(StandardFonts.Helvetica) : null;
  const pages = doc.getPages();
  const targets = !o.page ? pages : [pages[Math.min(Math.max(o.page, 1), pages.length) - 1]];

  for (const p of targets) {
    const { width, height } = p.getSize();
    // default: ~22% of the shorter side, never smaller than 25 mm
    const side = Math.max(25 * MM, (o.sizeMm ? o.sizeMm * MM : Math.min(width, height) * 0.22));
    const pad = Math.max(8 * MM, side * 0.12);
    const captionH = font ? Math.max(9, side * 0.09) : 0;
    const boxW = side + pad * 0.6, boxH = side + pad * 0.6 + (font ? captionH * 1.8 : 0);
    const corner = o.corner || 'bottom-right';
    const x = corner.endsWith('left') ? pad : corner === 'center' ? (width - boxW) / 2 : width - boxW - pad;
    const y = corner.startsWith('top') ? height - boxH - pad : corner === 'center' ? (height - boxH) / 2 : pad;
    // white backing so the code scans on any background
    p.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1) });
    p.drawImage(qr, { x: x + pad * 0.3, y: y + pad * 0.3 + (font ? captionH * 1.8 : 0), width: side, height: side });
    if (font && o.caption) {
      const size = captionH;
      let text = o.caption;
      while (font.widthOfTextAtSize(text, size) > boxW - 4 && text.length > 4) text = text.slice(0, -2);
      const w = font.widthOfTextAtSize(text, size);
      p.drawText(text, { x: x + (boxW - w) / 2, y: y + pad * 0.3 + captionH * 0.4, size, font, color: rgb(0.05, 0.09, 0.15) });
    }
  }
  return doc.save();
}
