/**
 * Thin progress ring (SVG circle, circumference normalized to 100).
 * Used for budget usage where a bar feels webby.
 */
export function HealthRing({
  pct,
  size = 40,
  tone = "primary",
}: {
  pct: number;
  size?: number;
  tone?: "primary" | "amber" | "destructive";
}) {
  const v = Math.min(100, Math.max(0, pct));
  const stroke =
    tone === "amber"
      ? "stroke-amber-500"
      : tone === "destructive"
        ? "stroke-destructive"
        : "stroke-primary";
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className="-rotate-90 shrink-0" role="img">
      <circle cx="18" cy="18" r="15.9155" fill="none" className="stroke-muted" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        className={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${v} 100`}
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.2,0,0,1)" }}
      />
    </svg>
  );
}
