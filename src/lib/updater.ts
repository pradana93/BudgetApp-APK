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

export type UpdateStage = "downloading" | "installing";

type Extras = {
  updateApk(o: { url: string; filename: string }): Promise<unknown>;
  canInstallPackages(): Promise<{ value: boolean }>;
  openInstallSettings(): Promise<unknown>;
};

function extras() {
  return Capacitor.registerPlugin<Extras>("NativeExtras");
}

/** Whether the OS currently lets this app install packages. Best-effort true. */
export async function canSelfInstall(): Promise<boolean> {
  try {
    const r = await extras().canInstallPackages();
    return r?.value === true;
  } catch {
    return true;
  }
}

/** Opens this app's "install unknown apps" system screen. */
export async function openInstallSettings(): Promise<void> {
  await extras().openInstallSettings();
}

/** Opens the APK URL in the browser (explicit fallback only). */
export async function openUpdateInBrowser(apkUrl: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: apkUrl });
}

/**
 * One-tap update: downloads inside the app, then opens the package
 * installer straight away. The OS still shows its own Install
 * confirmation (unskippable for sideloads). Throws on failure so the
 * UI can offer retry — never silently detours to the browser.
 */
export async function downloadUpdateApk(
  apkUrl: string,
  onStage?: (s: UpdateStage) => void
): Promise<void> {
  const name =
    apkUrl.split("/").pop()?.split("?")[0] || "budget-app-update.apk";
  onStage?.("downloading");
  await extras().updateApk({ url: apkUrl, filename: name });
  onStage?.("installing");
}
