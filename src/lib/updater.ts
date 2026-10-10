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

export type UpdateStage = "downloading" | "installing" | "browser";

/**
 * One-tap update: downloads inside the app, then opens the package
 * installer straight away. The OS still shows its own Install
 * confirmation (unskippable for sideloads) — but there is no browser
 * detour and no file hunting. Falls back to the browser on any failure.
 */
export async function downloadUpdateApk(
  apkUrl: string,
  onStage?: (s: UpdateStage) => void
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const proxy = Capacitor.registerPlugin<{
        updateApk(o: { url: string; filename: string }): Promise<unknown>;
      }>("NativeExtras");
      onStage?.("downloading");
      const name =
        apkUrl.split("/").pop()?.split("?")[0] || "budget-app-update.apk";
      await proxy.updateApk({ url: apkUrl, filename: name });
      onStage?.("installing");
      return;
    } catch {
      // fall through to browser
    }
  }
  onStage?.("browser");
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: apkUrl });
}
