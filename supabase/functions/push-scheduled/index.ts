// push-scheduled — nightly due nudges + Monday digest over FCM.
// Called by pg_cron (07:30 WIB daily), never by clients.
// Auth: x-push-secret header must equal PUSH_EVENT_SECRET.
// Respects notification_prefs (scheduled kinds only; lifecycle pushes
// always send via push-event).
//
// Deploy: supabase functions deploy push-scheduled
// Secrets: PUSH_EVENT_SECRET, FCM_SERVICE_ACCOUNT_JSON,
//          SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (runtime-provided).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { fcmAccessToken, sendFcmToTokens, type ServiceAccount } from "../_shared/fcm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function idr(n: unknown): string {
  return `Rp ${Number(n ?? 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Jakarta wall-clock from a UTC instant (WIB, no DST). */
function jakarta(d = new Date()): Date {
  return new Date(d.getTime() + 7 * 3600 * 1000);
}

type Prefs = { digest: boolean; due: boolean };

async function prefOf(admin: ReturnType<typeof createClient>, userId: string): Promise<Prefs> {
  const { data } = await admin
    .from("notification_prefs")
    .select("digest_enabled,due_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { digest_enabled?: boolean; due_enabled?: boolean } | null;
  return { digest: row?.digest_enabled ?? true, due: row?.due_enabled ?? true };
}

type Admin = ReturnType<typeof createClient>;

/** Period rollover: ended active budgets with a rule get a successor. */
async function runAutopilot(admin: Admin, sa: ServiceAccount, accessToken: string) {
  const today = jakarta().toISOString().slice(0, 10);
  const { data: old } = await admin
    .from("budgets")
    .select("id,owner_id,name,total_amount,available_amount,currency,period_start,period_end,rollover_mode")
    .eq("status", "active")
    .neq("rollover_mode", "off")
    .not("period_end", "is", null)
    .lt("period_end", today);
  const rolled: Array<{ from: string; to: string }> = [];
  for (const b of ((old ?? []) as Record<string, unknown>[])) {
    const { data: kids } = await admin.from("budgets").select("id").eq("rolled_from", String(b.id)).limit(1);
    if (kids && (kids as unknown[]).length > 0) continue;
    const s = new Date(String(b.period_start ?? b.period_end));
    const e = new Date(String(b.period_end));
    const span = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ns = new Date(s);
    ns.setMonth(ns.getMonth() + span);
    const ne = new Date(e);
    ne.setMonth(ne.getMonth() + span);
    const total = b.rollover_mode === "rollover" ? Number(b.available_amount ?? 0) : Number(b.total_amount ?? 0);
    const { data: created, error } = await admin
      .from("budgets")
      .insert({
        name: String(b.name),
        total_amount: total,
        currency: (b.currency as string) ?? "IDR",
        period_start: iso(ns),
        period_end: iso(ne),
        status: "active",
        owner_id: String(b.owner_id),
        rolled_from: String(b.id),
      })
      .select("id")
      .single();
    if (error || !created) continue;
    await admin.from("budgets").update({ status: "closed" }).eq("id", String(b.id));
    rolled.push({ from: String(b.id), to: (created as { id: string }).id });
    const { data: rows } = await admin.from("push_tokens").select("token").eq("user_id", String(b.owner_id));
    const tokens = [...new Set(((rows ?? []) as { token: string }[]).map((r) => r.token).filter(Boolean))];
    if (tokens.length > 0) {
      const { sent, dead } = await sendFcmToTokens({
        projectId: sa.project_id,
        accessToken,
        tokens,
        title: `New period started: ${String(b.name)}`,
        body: `Carry-over ${idr(total)}. / Lanjutan ${idr(total)}.`,
        data: { link: `/budgets/${(created as { id: string }).id}` },
      });
      if (dead.length > 0) await admin.from("push_tokens").delete().in("token", dead);
    }
  }
  return { ok: true, autopilot: { rolled: rolled.length, pairs: rolled } };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
    const expected = Deno.env.get("PUSH_EVENT_SECRET") ?? "";
    if (!expected || req.headers.get("x-push-secret") !== expected) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "{}") as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      return json({ ok: false, error: "FCM not configured" }, 500);
    }
    const accessToken = await fcmAccessToken(sa);

    const body = (await req.json().catch(() => ({}))) as { task?: string };
    if (body.task === "autopilot") return json(await runAutopilot(admin, sa, accessToken));
    const out: Record<string, unknown> = { ok: true };

    async function toUser(userId: string, title: string, body: string, data: Record<string, string>): Promise<number> {
      const { data: rows } = await admin.from("push_tokens").select("token").eq("user_id", userId);
      const tokens = [...new Set(((rows ?? []) as { token: string }[]).map((r) => r.token).filter(Boolean))];
      if (tokens.length === 0) return 0;
      const { sent, dead } = await sendFcmToTokens({
        projectId: sa.project_id,
        accessToken,
        tokens,
        title,
        body,
        data,
      });
      if (dead.length > 0) await admin.from("push_tokens").delete().in("token", dead);
      return sent;
    }

    // Due soon: pending requests due within 24h go to their requester.
    const nowJ = jakarta();
    const tomorrow = new Date(nowJ.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: dueRows } = await admin
      .from("reimbursement_requests")
      .select("id,merchant,category,amount,due_date,requester_id")
      .eq("status", "pending")
      .not("due_date", "is", null)
      .lte("due_date", tomorrow);
    let dueSent = 0;
    for (const r of (dueRows ?? []) as Record<string, unknown>[]) {
      const uid = String(r.requester_id ?? "");
      if (!uid || !(await prefOf(admin, uid)).due) continue;
      const what = `${String(r.merchant ?? r.category ?? "Request")}, ${idr(r.amount)}`;
      dueSent += await toUser(
        uid,
        `Due soon: ${what}`,
        `Due ${String(r.due_date ?? "").slice(0, 10)}. / Jatuh tempo ${String(r.due_date ?? "").slice(0, 10)}.`,
        { request_id: String(r.id), link: `/requests/${String(r.id)}` }
      );
    }
    out.due = { checked: (dueRows ?? []).length, sent: dueSent };

    // Monday digest: 7-day spend + pending load, one per owner.
    if (nowJ.getUTCDay() === 1) {
      const weekAgo = new Date(nowJ.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: realized } = await admin
        .from("reimbursement_requests")
        .select("amount,category")
        .in("status", ["approved", "reconciled"])
        .gte("created_at", weekAgo);
      const rows = (realized ?? []) as { amount: unknown; category: string }[];
      const spend = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const cats = new Map<string, number>();
      for (const r of rows) cats.set(r.category, (cats.get(r.category) ?? 0) + Number(r.amount ?? 0));
      const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
      const { count: pending } = await admin
        .from("reimbursement_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      const { data: owners } = await admin.from("profiles").select("id").eq("role", "owner");
      let digestSent = 0;
      for (const o of ((owners ?? []) as { id: string }[])) {
        if (!(await prefOf(admin, o.id)).digest) continue;
        const line = `${idr(spend)} across ${rows.length} requests` + (top ? `, top ${top[0]}` : "");
        digestSent += await toUser(
          o.id,
          `Weekly digest: ${line}`,
          `${pending ?? 0} pending approval. / ${pending ?? 0} menunggu persetujuan.`,
          { link: "/requests" }
        );
      }
      out.digest = { spend, requests: rows.length, pending: pending ?? 0, sent: digestSent };
    } else {
      out.digest = { skipped: "not Monday" };
    }

    return json(out);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
