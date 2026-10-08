/**
 * Shared chart system — pine + bone, no gradients, formatted tooltips.
 * All colors resolve through theme vars so charts adapt to dark mode.
 */

export const ink = {
  primary: "hsl(var(--primary))",
  primarySoft: "hsl(var(--primary) / 0.12)",
  track: "hsl(var(--muted))",
  grid: "hsl(var(--border))",
  muted: "hsl(var(--muted-foreground))",
  faint: "hsl(var(--muted-foreground) / 0.4)",
  card: "hsl(var(--card))",
};

export const slimAxis = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

export const smallTick = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
} as const;

export const barTrack: { fill: string; radius: number } = { fill: "hsl(var(--muted))", radius: 7 };

/** Rounded solid pine bars on a tonal track. */
export const pineBar: { fill: string; radius: number[]; barSize: number } = {
  fill: "hsl(var(--primary))",
  radius: [7, 7, 3, 3],
  barSize: 26,
};

/** Dark-ink tooltip card with serif figures. Never shows raw numbers when a formatter is given. */
export function MoneyTip(props: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
  format?: (v: number) => string;
  title?: string;
}) {
  const { active, payload, label, format, title } = props;
  if (!active || !payload || payload.length === 0) return null;
  const fmt = format ?? ((v: number) => String(v));
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-xl">
      {(title ?? label) != null && (
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title ?? label}
        </div>
      )}
      <div className="mt-1 space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color ?? ink.primary }}
            />
            {p.name != null && <span className="text-muted-foreground">{p.name}</span>}
            <span className="font-display tnum font-semibold">{fmt(Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Muted empty state for charts with no data. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-xl bg-muted/40 px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
