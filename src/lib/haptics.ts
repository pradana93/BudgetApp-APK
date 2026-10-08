import { Capacitor } from "@capacitor/core";

/** Native-only light tap feedback. No-op on web. Never throws. */
export async function tapLight(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Cosmetic only.
  }
}
