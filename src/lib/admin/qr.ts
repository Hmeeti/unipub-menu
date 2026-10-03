import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { createTableToken } from "@/lib/security/table-token";

/** Root URL: the locale is picked from the phone language, the token marks the table. */
export function tableQrUrl(code: string, version: number) {
  const e = env();
  const base = e.APP_URL.replace(/\/+$/, "");
  return `${base}/?t=${encodeURIComponent(createTableToken(e.TABLE_TOKEN_SECRET!, code, version))}`;
}

const QUIET = 4;

function matrix(text: string) {
  return QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
}

/** Crisp vector QR (one path, quiet zone included); safe to inline: only digits in the markup. */
export function qrSvg(text: string, title?: string) {
  const m = matrix(text);
  const size = m.size + QUIET * 2;
  let d = "";
  for (let r = 0; r < m.size; r++)
    for (let c = 0; c < m.size; c++) if (m.get(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  const label = title ? `<title>${title.replace(/[<>&"]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img">${label}<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// A6 portrait in PDF points
const PAGE: [number, number] = [297.64, 419.53];
const PINK = rgb(0.79, 0.06, 0.38);

/**
 * One A6 card per table. Standard PDF fonts have no Cyrillic, so the card text is Latin
 * (table codes are Latin by design); the HTML print page carries the Russian captions.
 */
export async function tablesPdf(rows: { code: string; version: number }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("UNIPUB — table QR codes");
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const [w, h] = PAGE;
  const center = (text: string, font: typeof bold, size: number, y: number, color = rgb(0, 0, 0)) =>
    page.drawText(text, { x: (w - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  let page = doc.addPage(PAGE);
  for (const [i, row] of rows.entries()) {
    if (i > 0) page = doc.addPage(PAGE);
    center("UNIPUB", bold, 26, h - 52, PINK);
    center("MENU  ·  ORDER  ·  KARAOKE", regular, 9, h - 70);
    const m = matrix(tableQrUrl(row.code, row.version));
    const box = 200;
    const cell = box / (m.size + QUIET * 2);
    const x0 = (w - box) / 2;
    const y0 = h - 92 - box;
    for (let r = 0; r < m.size; r++)
      for (let c = 0; c < m.size; c++)
        if (m.get(r, c))
          page.drawRectangle({
            x: x0 + (c + QUIET) * cell,
            y: y0 + box - (r + QUIET + 1) * cell,
            width: cell,
            height: cell,
            color: rgb(0, 0, 0),
          });
    center("TABLE", regular, 11, y0 - 26);
    center(row.code, bold, 44, y0 - 70);
    center("Scan with your phone camera", regular, 9, 28);
  }
  return doc.save();
}
