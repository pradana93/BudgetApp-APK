import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

const LAST_FIRE_KEY = "budgetapp-remind-date";
const NOTIF_OVERDUE = 9001;
const NOTIF_DIGEST = 9002;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Native-only daily money reminders: overdue requests + pending approvals.
 * Self-contained (queries with the current session), runs once per day,
 * never throws. No-ops on web.
 */
export async function maybeFireReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (localStorage.getItem(LAST_FIRE_KEY) === todayKey()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    const { data } = await supabase
      .from("reimbursement_requests")
      .select("id,due_date,status,merchant")
      .eq("status", "pending");
    const rows = data ?? [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const overdue = rows.filter((r) => r.due_date && new Date(r.due_date) < now);

    const notes: Array<{ id: number; title: string; body: string }> = [];
    if (overdue.length > 0) {
      notes.push({
        id: NOTIF_OVERDUE,
        title: "Overdue requests",
        body:
          overdue.length === 1
            ? `${overdue[0].merchant ?? "A request"} is past due — tap to review.`
            : `${overdue.length} requests are past due — tap to review.`,
      });
    } else if (rows.length > 0) {
      notes.push({
        id: NOTIF_DIGEST,
        title: "Pending requests",
        body:
          rows.length === 1
            ? "1 request is waiting for review."
            : `${rows.length} requests are waiting for review.`,
      });
    }
    if (notes.length === 0) return;

    await LocalNotifications.schedule({
      notifications: notes.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(Date.now() + 5000) },
      })),
    });
    localStorage.setItem(LAST_FIRE_KEY, todayKey());
  } catch {
    // Reminders are best-effort.
  }
}
