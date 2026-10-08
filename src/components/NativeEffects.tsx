import * as React from "react";
import { isNative } from "@/lib/native";
import { tryCloseDrawer } from "@/lib/nativeUi";
import { checkForAppUpdate, type AppUpdate } from "@/lib/updater";
import { initNativePush } from "@/lib/push";
import { UpdateBanner } from "@/components/UpdateBanner";

/**
 * Mounted once in App. No-ops on web — native-only side effects:
 * shell styling (status bar, back button, splash), update check +
 * FCM registration. Core app logic is never touched.
 */
export function NativeEffects() {
  const [update, setUpdate] = React.useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    void applyNativeShell();
    // Small delay so first paint is never blocked by native checks.
    const t = window.setTimeout(async () => {
      const found = await checkForAppUpdate();
      if (!cancelled && found) setUpdate(found);
      await initNativePush();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  if (!update || dismissed) return null;
  return <UpdateBanner update={update} onDismiss={() => setDismissed(true)} />;
}

/** Status bar matching the active theme, Android back navigation, splash hide. */
async function applyNativeShell(): Promise<void> {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const apply = () => {
      const dark = document.documentElement.classList.contains("dark");
      void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
      void StatusBar.setBackgroundColor({ color: dark ? "#0C1511" : "#F6F2E9" }).catch(() => undefined);
      void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    };
    apply();
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  } catch {
    // Shell styling is cosmetic — never break the app.
  }
  try {
    const { App } = await import("@capacitor/app");
    await App.removeAllListeners();
    void App.addListener("backButton", ({ canGoBack }) => {
      try {
        if (tryCloseDrawer()) return;
      } catch {
        // fall through to history navigation
      }
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });
  } catch {
    // Back button falls back to system default.
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    window.setTimeout(() => void SplashScreen.hide().catch(() => undefined), 800);
  } catch {
    // Auto-hide from config covers this path.
  }
}
