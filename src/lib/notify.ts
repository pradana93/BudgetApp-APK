import { supabase } from "@/lib/supabase";

/**
 * Fire-and-forget push via the send-push edge function.
 * Owner callers can reach anyone; member callers are scoped server-side
 * to their own request's budget owner (include request_id for that path).
 * Never throws — notifications must never break the flow.
 */
export async function notifyUser(
  toUserId: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    if (!toUserId) return;
    const { error } = await supabase.functions.invoke("send-push", {
      body: { user_id: toUserId, title, body, data: data ?? {} },
    });
    if (error) throw error;
  } catch {
    // best-effort
  }
}

/** Short merchant label for notification bodies. */
export function merchantOf(r: { merchant?: string | null; category?: string }): string {
  return r.merchant || r.category || "Request";
}

/**
 * Request lifecycle fan-out: in-app notification row + push.
 * Both best-effort. Callers are owners here; member-scoped sends
 * (comments) go through notifyUser directly with request_id.
 */
export async function notifyRequesterBoth(
  userId: string | null | undefined,
  opts: { type: string; title: string; body: string; link: string; request_id?: string }
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link,
    });
  } catch {
    // best-effort
  }
  await notifyUser(
    userId,
    opts.title,
    opts.body,
    opts.request_id ? { request_id: opts.request_id } : undefined
  );
}
