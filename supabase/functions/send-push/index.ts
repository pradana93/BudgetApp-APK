// send-push — owner-only FCM sender for native APK installs.
// Deploy: supabase functions deploy send-push
// Secrets: FCM_SERVICE_ACCOUNT_JSON (full service-account JSON),
//          SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided by the runtime.
//
// POST { "user_id": "<uuid|all>", "title": "...", "body": "...", "data": {...} }
// Caller must be the owner (checked via profiles.role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const der = Uint8Array.from(
    atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "")),
    (c) => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`oauth token failed: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller } = await admin.auth.getUser(jwt);
    if (!caller.user) return new Response("unauthorized", { status: 401 });

    const { data: profile } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
    if (profile?.role !== "owner") return new Response("forbidden", { status: 403 });

    const { user_id, title, body, data, data_only } = (await req.json()) as {
      user_id: string;
      title: string;
      body: string;
      data?: Record<string, string>;
      data_only?: boolean;
    };
    if (!user_id || !title || !body) return new Response("user_id, title, body required", { status: 400 });

    const tokenQuery = admin.from("push_tokens").select("token");
    const { data: rows } = user_id === "all" ? await tokenQuery : await tokenQuery.eq("user_id", user_id);
    const tokens = [...new Set((rows ?? []).map((r) => r.token).filter(Boolean))];
    if (tokens.length === 0) return Response.json({ sent: 0 });

    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "{}") as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      return new Response("FCM_SERVICE_ACCOUNT_JSON not configured", { status: 500 });
    }
    const accessToken = await fcmAccessToken(sa);

    let sent = 0;
    for (const token of tokens) {
      // data_only skips the notification block so the device renders its own
      // rich notification (e.g. approval actions) instead of doubling up.
      const message = data_only
        ? { token, data: { title, body, ...(data ?? {}) } }
        : { token, notification: { title, body }, data: data ?? {} };
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }
      );
      if (res.ok) {
        sent++;
      } else if (res.status === 404 || (await res.text()).includes("UNREGISTERED")) {
        await admin.from("push_tokens").delete().eq("token", token);
      }
    }
    return Response.json({ sent, targeted: tokens.length });
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
