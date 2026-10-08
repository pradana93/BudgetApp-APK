import { Capacitor } from "@capacitor/core";

/** True only inside the native APK wrapper. Web/PWA always returns false. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}
