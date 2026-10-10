/**
 * Branded launch gate shown while the session settles on cold start.
 * Pine field, wallet mark, serif wordmark, indeterminate progress —
 * the handoff from the native splash into the app.
 */
export function LaunchScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-5 p-8 text-center"
      style={{ background: "#14532D", color: "#FFFFFF" }}
      role="status"
      aria-label="Loading BudgetApp"
    >
      <span
        className="animate-pop rounded-[28px] p-5"
        style={{ background: "rgba(255,255,255,0.12)" }}
      >
        <svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden>
          <rect x="6" y="12" width="36" height="26" rx="7" stroke="#FFFFFF" strokeWidth="3" />
          <rect x="26" y="20" width="12" height="10" rx="3" fill="#FFFFFF" opacity="0.9" />
          <circle cx="32" cy="25" r="1.8" fill="#14532D" />
        </svg>
      </span>
      <div className="font-display text-3xl font-semibold tracking-tight">
        BudgetApp
      </div>
      <div
        className="w-40 h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.18)" }}
      >
        <div className="m3-launch-bar h-full w-2/5 rounded-full bg-white/90" />
      </div>
    </div>
  );
}
