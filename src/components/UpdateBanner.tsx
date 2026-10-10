import * as React from "react";
import type { AppUpdate } from "@/lib/updater";
import { downloadUpdateApk } from "@/lib/updater";

export function UpdateBanner({ update, onDismiss }: { update: AppUpdate; onDismiss: () => void }) {
  const [stage, setStage] = React.useState<null | "downloading" | "installing">(null);

  const onDownload = async () => {
    try {
      await downloadUpdateApk(update.apkUrl, (s) => {
        if (s === "downloading" || s === "installing") setStage(s);
        else setStage(null);
      });
    } finally {
      // installing: the OS takes over from here; keep the state on.
      setStage((s) => (s === "installing" ? s : null));
    }
  };

  return (
    <div className="m3-banner-in fixed inset-x-3 bottom-24 md:bottom-3 mb-[env(safe-area-inset-bottom)] z-50 rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="text-sm font-semibold">Update available: {update.versionName}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        One tap — downloads inside the app, then opens the installer. Your data is safe.
      </p>
      {stage === "downloading" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/5 rounded-full bg-primary m3-launch-bar" />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={stage !== null}
          onClick={onDownload}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {stage === "downloading"
            ? "Downloading…"
            : stage === "installing"
              ? "Opening installer…"
              : "Download & Install"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          Later
        </button>
      </div>
    </div>
  );
}
