import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

export type PushInitResult = "granted" | "denied" | "unavailable" | "error";

/**
 * Native-only FCM registration. Web/PWA is never touched — this module
 * no-ops unless running inside the APK wrapper.
 *
 * On registration the FCM token is upserted into `push_tokens` so only
 * native installs can ever receive pushes. All failures are swallowed:
 * push must never break the core app.
 */
export async function initNativePush(): Promise<PushInitResult> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return "denied";

    await PushNotifications.register();

    PushNotifications.addListener("registration", (t) => {
      void savePushToken(t.value);
    });
    PushNotifications.addListener("registrationError", () => undefined);
    // Foreground notifications are surfaced by the OS tray; the in-app
    // Notifications page stays the source of truth. No core logic touched.
    PushNotifications.addListener("pushNotificationReceived", () => undefined);
    PushNotifications.addListener("pushNotificationActionPerformed", () => undefined);

    return "granted";
  } catch {
    return "error";
  }
}

async function savePushToken(token: string): Promise<void> {
  try {
    if (!token) return;
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform: Capacitor.getPlatform(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" }
    );
  } catch {
    // Table may not exist yet (migration not applied) — never break the app.
  }
}
