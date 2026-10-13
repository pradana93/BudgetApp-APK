// Shared FCM sender for edge functions. Service-account JSON is server-side only.

export type ServiceAccount = {
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

export async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
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

export type FcmResult = { sent: number; dead: string[] };

/** Data-only delivery for custom native rendering (no system tray). */
export async function sendFcmDataOnly(opts: {
  projectId: string;
  accessToken: string;
  tokens: string[];
  fields: Record<string, string>;
}): Promise<FcmResult> {
  let sent = 0;
  const dead: string[] = [];
  for (const token of opts.tokens) {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${opts.projectId}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token, data: opts.fields } }),
      }
    );
    if (res.ok) {
      sent++;
    } else {
      const text = await res.text();
      if (res.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) dead.push(token);
    }
  }
  return { sent, dead };
}

/** Sends a visible notification payload; returns count + tokens to prune. */
export async function sendFcmToTokens(opts: {
  projectId: string;
  accessToken: string;
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<FcmResult> {
  let sent = 0;
  const dead: string[] = [];
  for (const token of opts.tokens) {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${opts.projectId}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: opts.title, body: opts.body },
            data: opts.data ?? {},
          },
        }),
      }
    );
    if (res.ok) {
      sent++;
    } else {
      const text = await res.text();
      if (res.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) dead.push(token);
    }
  }
  return { sent, dead };
}
