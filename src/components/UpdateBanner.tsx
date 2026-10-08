import * as React from "react";
import type { AppUpdate } from "@/lib/updater";
import { downloadUpdateApk } from "@/lib/updater";

export function UpdateBanner({ update, onDismiss }: { update: AppUpdate; onDismiss: () => void }) {
  const [busy, setBusy] = React.useState(false);

  const onDownload = async () => {
    setBusy(true);
    try {
      await downloadUpdateApk(update.apkUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-24 md:bottom-3 mb-[env(safe-area-inset-bottom)] z-50 rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="text-sm font-semibold">Update available: {update.versionName}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Download the new version and tap the file to install. Your data is safe.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onDownload}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Opening…" : "Download & Install"}
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
