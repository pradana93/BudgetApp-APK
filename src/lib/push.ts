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

    // Listeners first so no event is missed before register() resolves.
    PushNotifications.addListener("registration", (t) => {
      void report("registration", `token_len=${t.value?.length ?? 0}`);
      void savePushToken(t.value);
    });
    PushNotifications.addListener("registrationError", (e) => {
      void report("registrationError", e?.error ?? "unknown");
    });

    const perm = await PushNotifications.requestPermissions();
    void report("permission", `receive=${perm.receive}`);
    if (perm.receive !== "granted") return "denied";

    try {
      await PushNotifications.register();
      void report("register_called", "ok");
    } catch (e) {
      void report("register_throw", e instanceof Error ? e.message : String(e));
      return "error";
    }
    // Foreground notifications are surfaced by the OS tray; the in-app
    // Notifications page stays the source of truth. Tapping a push opens
    // its link: the router-side PushTapHandler navigates there.
    PushNotifications.addListener("pushNotificationReceived", () => undefined);
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      try {
        const link = (action?.notification as { data?: { link?: string } } | undefined)?.data?.link;
        if (link && link.startsWith("/")) {
          window.dispatchEvent(new CustomEvent("budgetapp:push-tap", { detail: { link } }));
        }
      } catch {
        // best-effort
      }
    });

    return "granted";
  } catch (e) {
    void report("init_throw", e instanceof Error ? e.message : String(e));
    return "error";
  }
}

/** Best-effort self-diagnostics (native only). Never throws. */
async function report(step: string, detail: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("push_diagnostics").insert({
      user_id: data.user?.id ?? null,
      platform: Capacitor.getPlatform(),
      step,
      detail: detail.slice(0, 500),
    });
  } catch {
    // best-effort
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
    // best-effort (table may not exist yet)
  }
}
