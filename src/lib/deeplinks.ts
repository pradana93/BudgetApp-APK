import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

export type DeepLinkAction =
  | { kind: "dashboard" }
  | { kind: "new-request" }
  | { kind: "request"; id: string }
  | { kind: "budget"; id: string }
  | { kind: "approve"; id: string }
  | { kind: "reject"; id: string };

/** budgetapp://approve/<id> etc. Returns null for foreign URLs. */
export function parseDeepLink(url: string): DeepLinkAction | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "budgetapp:") return null;
    const host = u.hostname.toLowerCase();
    const id = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (host === "dashboard" || host === "") return { kind: "dashboard" };
    if (host === "new-request") return { kind: "new-request" };
    if ((host === "request" || host === "approve" || host === "reject") && id) {
      return { kind: host, id } as DeepLinkAction;
    }
    if (host === "budget" && id) return { kind: "budget", id };
    return null;
  } catch {
    return null;
  }
}

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Executes a deep-link action. Approve runs the owner RPC (server enforces
 * role); everything else is navigation. Returns a human result for toasts.
 */
export async function runDeepLink(
  action: DeepLinkAction,
  nav: (to: string) => void
): Promise<{ ok: boolean; message: string }> {
  try {
    switch (action.kind) {
      case "dashboard":
        nav("/");
        return { ok: true, message: "" };
      case "new-request":
        nav("/requests/new");
        return { ok: true, message: "" };
      case "request":
        nav(`/requests/${action.id}`);
        return { ok: true, message: "" };
      case "budget":
        nav(`/budgets/${action.id}`);
        return { ok: true, message: "" };
      case "approve": {
        const { error } = await supabase.rpc("approve_request", { p_request_id: action.id });
        nav(`/requests/${action.id}`);
        return error
          ? { ok: false, message: error.message }
          : { ok: true, message: "Request approved" };
      }
      case "reject":
        nav(`/requests/${action.id}`);
        return { ok: true, message: "" };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
