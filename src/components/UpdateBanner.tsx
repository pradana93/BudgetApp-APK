import * as React from "react";
import type { AppUpdate } from "@/lib/updater";
import { canSelfInstall, downloadUpdateApk, openInstallSettings, openUpdateInBrowser } from "@/lib/updater";
import { useLang } from "@/i18n/LanguageContext";

type Stage = null | "downloading" | "installing" | "permission" | "error";

export function UpdateBanner({ update, onDismiss }: { update: AppUpdate; onDismiss: () => void }) {
  const { t } = useLang();
  const [stage, setStage] = React.useState<Stage>(null);
  const [errMsg, setErrMsg] = React.useState("");

  const start = async () => {
    setErrMsg("");
    try {
      if (!(await canSelfInstall())) {
        setStage("permission");
        return;
      }
    } catch {
      // fall through: the download attempt surfaces the real error
    }
    setStage("downloading");
    try {
      await downloadUpdateApk(update.apkUrl, (s) => {
        if (s === "downloading") setStage("downloading");
      });
      // installing: the OS takes over from here; keep the state on.
      setStage("installing");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  const openSettings = async () => {
    // Re-check first: returning from Settings lands back here, and the
    // grant may already be in place.
    try {
      if (await canSelfInstall()) {
        await start();
        return;
      }
      await openInstallSettings();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  };

  const useBrowser = async () => {
    setStage(null);
    await openUpdateInBrowser(update.apkUrl);
  };

  const busy = stage === "downloading" || stage === "installing";

  return (
    <div className="m3-banner-in fixed inset-x-3 bottom-24 md:bottom-3 mb-[env(safe-area-inset-bottom)] z-50 rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="text-sm font-semibold">
        {stage === "permission" ? t("update.needTitle") : stage === "error" ? t("update.failed") : t("update.available", { v: update.versionName })}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {stage === "permission" ? t("update.needDesc") : stage === "error" ? t("update.retry") : t("update.desc")}
      </p>
      {stage === "error" && errMsg !== "" && (
        <p className="mt-1 text-xs text-muted-foreground opacity-70 break-words">{errMsg}</p>
      )}
      {stage === "downloading" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/5 rounded-full bg-primary m3-launch-bar" />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {stage === "permission" ? (
          <button
            type="button"
            onClick={openSettings}
            className="flex-1 rounded-lg bg-primary px-3 py-2 min-h-[44px] text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("update.openSettings")}
          </button>
        ) : stage === "error" ? (
          <button
            type="button"
            onClick={start}
            className="flex-1 rounded-lg bg-primary px-3 py-2 min-h-[44px] text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("update.retry")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="flex-1 rounded-lg bg-primary px-3 py-2 min-h-[44px] text-sm font-medium text-primary-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {stage === "downloading"
              ? t("update.downloading")
              : stage === "installing"
                ? t("update.installing")
                : t("update.cta")}
          </button>
        )}
        {stage === "error" ? (
          <button
            type="button"
            onClick={useBrowser}
            className="rounded-lg border border-border px-3 py-2 min-h-[44px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("update.browserInstead")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-border px-3 py-2 min-h-[44px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("update.later")}
          </button>
        )}
      </div>
    </div>
  );
}
