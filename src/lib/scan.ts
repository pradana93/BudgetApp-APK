import { Capacitor } from "@capacitor/core";
import { parseReceiptText } from "@/lib/ocr";
import { tapLight } from "@/lib/haptics";

export const SCAN_DRAFT_KEY = "budgetapp-draft-request";

export type ScanOutcome =
  | { state: "prefilled" }
  | { state: "cancelled" }
  | { state: "unavailable" };

/**
 * Native-only receipt scan: camera → on-device OCR → prefilled request
 * draft (merchant, amount, date, photo) → opens the request form.
 * No-ops on web. Never throws.
 */
export async function startScanFlow(nav: (to: string) => void): Promise<ScanOutcome> {
  if (!Capacitor.isNativePlatform()) return { state: "unavailable" };
  try {
    void tapLight();
    const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 85,
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      saveToGallery: false,
    });
    if (!photo.path) return { state: "cancelled" };

    let merchant = "";
    let amount = "";
    let date = "";
    try {
      const proxy = Capacitor.registerPlugin<{
        recognizeText(o: { path: string }): Promise<{ text: string; lines: string[] }>;
      }>("NativeExtras");
      const res = await proxy.recognizeText({ path: photo.path });
      const parsed = parseReceiptText(res.lines ?? []);
      if (parsed) {
        merchant = parsed.merchant;
        amount = parsed.amount;
        date = parsed.date;
      }
    } catch {
      // OCR failed — form still opens with the photo attached.
    }

    const draft = {
      budget_id: "",
      amount,
      category: "groceries",
      merchant,
      description: "",
      due_date: date,
      _photoPath: photo.path,
    };
    try {
      localStorage.setItem(SCAN_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage unavailable — form opens empty
    }
    nav("/requests/new");
    return { state: "prefilled" };
  } catch {
    return { state: "cancelled" };
  }
}
