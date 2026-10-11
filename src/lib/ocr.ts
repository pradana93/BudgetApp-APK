import { Capacitor } from "@capacitor/core";

export type OcrResult = { merchant: string; amount: string };

/**
 * On-device receipt OCR (ML Kit, Latin). Writes the image to cache,
 * recognizes locally, parses merchant + amount. Returns null when
 * unavailable (web, old devices) — callers fall back gracefully.
 */
export async function recognizeReceipt(file: File): Promise<OcrResult | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const saved = await Filesystem.writeFile({
      path: `ocr-${Date.now()}.jpg`,
      data: btoa(bin),
      directory: Directory.Cache,
    });
    const proxy = Capacitor.registerPlugin<{
      recognizeText(o: { path: string }): Promise<{ text: string; lines: string[] }>;
    }>("NativeExtras");
    const res = await proxy.recognizeText({ path: saved.uri });
    try {
      await Filesystem.deleteFile({ path: saved.uri });
    } catch {
      // best-effort cleanup
    }
    return parseReceiptText(res.lines ?? []);
  } catch {
    return null;
  }
}

const AMOUNT_RE = /(\d[\d.,]*)/;

/** Merchant = first texty line; amount = largest numeric figure. */
export function parseReceiptText(lines: string[]): OcrResult | null {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const merchant =
    clean.find((l) => /[A-Za-z]{3,}/.test(l) && l.length <= 40)?.slice(0, 40) ?? "";
  let best = 0;
  for (const l of clean) {
    const m = l.replace(/\s/g, "").match(AMOUNT_RE);
    if (!m) continue;
    const n = Number(m[1].replace(/\./g, "").replace(/,/g, "."));
    if (Number.isFinite(n) && n > best) best = n;
  }
  if (!merchant && best <= 0) return null;
  return {
    merchant,
    amount: best > 0 ? String(Math.round(best)) : "",
  };
}
