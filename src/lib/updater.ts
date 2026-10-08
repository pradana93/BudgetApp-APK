import { Capacitor } from "@capacitor/core";

const REPO = "pradana93/BudgetApp-APK";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export type AppUpdate = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes: string;
};

async function currentBuildCode(): Promise<number> {
  const { App } = await import("@capacitor/app");
  const info = await App.getInfo();
  const n = parseInt(info.build, 10);
  return Number.isFinite(n) ? n : 0;
}

function codeFromTag(tag: string): number {
  const m = tag.match(/(\d+)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Native-only: compare installed build number against the latest
 * GitHub Release (tag like `apk-v3`). Returns update info or null.
 * Never throws — failures mean "no update".
 */
export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const installed = await currentBuildCode();
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const rel = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const code = codeFromTag(String(rel.tag_name ?? ""));
    if (!code || code <= installed) return null;
    const assets = rel.assets ?? [];
    const apk =
      assets.find((a) => typeof a?.name === "string" && a.name.endsWith(".apk")) ??
      assets[0];
    if (!apk?.browser_download_url) return null;
    return {
      versionCode: code,
      versionName: String(rel.name ?? rel.tag_name ?? `v${code}`),
      apkUrl: apk.browser_download_url,
      notes: String(rel.body ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Native-only: hand the APK URL to the system browser/download manager.
 * The user taps the downloaded file to install (one-time "unknown apps" allow).
 */
export async function downloadUpdateApk(apkUrl: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: apkUrl });
}
