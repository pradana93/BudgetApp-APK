import * as React from "react";
import { isNative } from "@/lib/native";
import { checkForAppUpdate, type AppUpdate } from "@/lib/updater";
import { initNativePush } from "@/lib/push";
import { UpdateBanner } from "@/components/UpdateBanner";

/**
 * Mounted once in App. No-ops on web — native-only side effects:
 * update check + FCM registration. Core app logic is never touched.
 */
export function NativeEffects() {
  const [update, setUpdate] = React.useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
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
