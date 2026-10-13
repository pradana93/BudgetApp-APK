// push-event — server-side FCM fan-out for the request lifecycle.
// Called by a Supabase Database Webhook (INSERT + UPDATE on
// reimbursement_requests), so pushes land with the app closed.
// Auth: x-push-secret header must equal PUSH_EVENT_SECRET. Nothing else is
// trusted; the caller only supplies the row, recipients come from the DB.
//
// Deploy: supabase functions deploy push-event
// Secrets: PUSH_EVENT_SECRET, FCM_SERVICE_ACCOUNT_JSON (runtime env).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { fcmAccessToken, sendFcmToTokens, sendFcmDataOnly, type ServiceAccount } from "../_shared/fcm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TERMINAL = ["approved", "rejected", "reconciled"] as const;

function idr(n: unknown): string {
  return `Rp ${Number(n ?? 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const expected = Deno.env.get("PUSH_EVENT_SECRET") ?? "";
    if (!expected || req.headers.get("x-push-secret") !== expected) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const event = (await req.json()) as {
      type?: string;
      table?: string;
      record?: Record<string, unknown>;
      old_record?: Record<string, unknown>;
    };
    if (event.table !== "reimbursement_requests" || !event.record?.id) {
      return json({ ok: true, skipped: "not a request event" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const rec = event.record;

    // Never trust the payload alone: re-read the row. A missing row means
    // a malformed event, and sending from it would spam owners with junk.
    const { data: row } = await admin
      .from("reimbursement_requests")
      .select("id,merchant,category,amount,requester_id,budget_id,status")
      .eq("id", String(rec.id))
      .maybeSingle();
    if (!row) return json({ ok: false, error: "request not found" }, 404);

    let toUserId: string | null = null;
    let title = "";
    let body = "";
    const link = `/requests/${String(row.id)}`;

    if (event.type === "INSERT") {
      const requester = String(row.requester_id ?? "");
      // Oldest owner gets the bell (notify_on_request_change); FCM matches.
      const { data: owner } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "owner")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!owner || owner.id === requester || !requester) {
        return json({ ok: true, skipped: "no recipient" });
      }
      toUserId = owner.id;
      const what = `${String(row.merchant ?? row.category ?? "Request")}, ${idr(row.amount)}`;
      title = `New request: ${what}`;
      body = `A member submitted a reimbursement request. / Anggota mengajukan permintaan reimbursement.`;
    } else if (event.type === "UPDATE") {
      const before = String(event.old_record?.status ?? "");
      const after = String(row.status ?? "");
      if (before === after || !(TERMINAL as readonly string[]).includes(after)) {
        return json({ ok: true, skipped: "not a status change" });
      }
      const requester = String(row.requester_id ?? "");
      if (!requester) return json({ ok: true, skipped: "no recipient" });
      toUserId = requester;
      const what = `${String(row.merchant ?? row.category ?? "Request")}, ${idr(row.amount)}`;
      const verb = after === "approved" ? "approved/disetujui" : after === "rejected" ? "rejected/ditolak" : "reconciled/direkonsiliasi";
      title = `Request ${after}: ${what}`;
      body = `Your request was ${verb}. / Permintaan Anda ${verb}.`;
    } else {
      return json({ ok: true, skipped: "ignored event" });
    }

    const { data: rows } = await admin.from("push_tokens").select("token").eq("user_id", toUserId);
    const tokens = [...new Set(((rows ?? []) as { token: string }[]).map((r) => r.token).filter(Boolean))];
    if (tokens.length === 0) return json({ ok: true, sent: 0, reason: "no tokens" });

    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "{}") as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      return json({ ok: false, error: "FCM not configured" }, 500);
    }
    const accessToken = await fcmAccessToken(sa);
    // New requests go data-only so ApprovalMessagingService renders native
    // Approve / Review actions. Status updates keep the stock tray payload.
    const approval = event.type === "INSERT";
    const { sent, dead } = approval
      ? await sendFcmDataOnly({
          projectId: sa.project_id,
          accessToken,
          tokens,
          fields: { kind: "approval", title, body, request_id: String(row.id), link },
        })
      : await sendFcmToTokens({
          projectId: sa.project_id,
          accessToken,
          tokens,
          title,
          body,
          data: { request_id: String(row.id), link },
        });
    if (dead.length > 0) {
      await admin.from("push_tokens").delete().in("token", dead);
    }
    return json({ ok: true, sent, total: tokens.length });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
