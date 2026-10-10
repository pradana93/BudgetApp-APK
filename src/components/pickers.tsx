import * as React from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { tapLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type SheetOption = { value: string; label: string; hint?: string };

/**
 * In-app option picker (bottom sheet). Replaces every native <select>
 * spinner so choosing stays inside the app's own UI.
 */
export function SheetSelect({
  label,
  value,
  options,
  onPick,
  placeholder = "Select",
}: {
  label?: string;
  value: string;
  options: SheetOption[];
  onPick: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      {label && <div className="text-sm font-medium mb-1.5">{label}</div>}
      <button
        type="button"
        onClick={() => {
          void tapLight();
          setOpen(true);
        }}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm active:scale-[0.99] transition-transform"
      >
        <span className={current ? "truncate" : "truncate text-muted-foreground"}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <OptionSheet
        open={open}
        title={label ?? placeholder}
        options={options}
        value={value}
        onPick={(v) => {
          onPick(v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function OptionSheet({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  options: SheetOption[];
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-1 max-h-[70vh]">
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                void tapLight();
                onPick(o.value);
              }}
              className={cn(
                "m3-press flex w-full items-center gap-3 rounded-2xl px-4 min-h-[56px] py-2.5 text-left text-sm",
                sel ? "bg-primary/10 font-semibold" : "hover:bg-accent"
              )}
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
              </span>
              {sel && <Check className="h-5 w-5 shrink-0 text-primary" />}
            </button>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Date ----------

function toISODate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseISODate(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

/**
 * In-app calendar sheet (M3 date-picker layout): big serif selection
 * header, month grid, Clear/Cancel/Set footer. No system picker involved.
 */
export function DateSheet({
  open,
  value,
  locale,
  onPick,
  onClose,
}: {
  open: boolean;
  value: string;
  locale: string;
  onPick: (iso: string | null) => void;
  onClose: () => void;
}) {
  const initial = parseISODate(value);
  const today = new Date();
  const [ym, setYm] = React.useState(() => ({
    y: initial?.y ?? today.getFullYear(),
    m: initial?.m ?? today.getMonth(),
  }));
  const [sel, setSel] = React.useState<string>(value);
  React.useEffect(() => {
    if (open) {
      const p = parseISODate(value);
      setSel(value);
      setYm({ y: p?.y ?? today.getFullYear(), m: p?.m ?? today.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const firstDow = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selDate = parseISODate(sel);
  const headDate = selDate ? new Date(selDate.y, selDate.m, selDate.d) : null;
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  const week = ["M", "T", "W", "T", "F", "S", "S"];
  const shift = (d: number) =>
    setYm((v) => {
      const dt = new Date(v.y, v.m + d, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="p-0 overflow-hidden">
        <div className="bg-foreground text-background px-5 pt-5 pb-4">
          <div className="text-xs opacity-70">{selDate ? selDate.y : ym.y}</div>
          <div className="font-display text-3xl font-semibold truncate">
            {headDate
              ? headDate.toLocaleDateString(locale, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : "Pick a date"}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shift(-1)}
              className="m3-press rounded-full p-2.5"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-sm font-semibold capitalize">{monthLabel}</div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shift(1)}
              className="m3-press rounded-full p-2.5"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
            {week.map((w, i) => (
              <div key={i} className="py-1.5 font-medium">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const iso = toISODate(ym.y, ym.m, d);
              const isSel = sel === iso;
              const todayD = new Date();
              const isToday =
                d === todayD.getDate() &&
                ym.m === todayD.getMonth() &&
                ym.y === todayD.getFullYear();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    void tapLight();
                    setSel(iso);
                  }}
                  className="flex items-center justify-center py-0.5"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-sm tnum transition-colors",
                      isSel
                        ? "bg-primary text-primary-foreground font-semibold"
                        : isToday
                          ? "border border-primary text-primary font-semibold"
                          : "hover:bg-accent"
                    )}
                  >
                    {d}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between">
            <button
              type="button"
              onClick={() => {
                onPick(null);
                onClose();
              }}
              className="m3-press rounded-full px-4 h-11 text-sm font-semibold text-primary"
            >
              Clear
            </button>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onClose}
                className="m3-press rounded-full px-4 h-11 text-sm font-semibold text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onPick(sel || null);
                  onClose();
                }}
                className="m3-press rounded-full px-4 h-11 text-sm font-semibold text-primary"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Date field trigger + in-app calendar sheet. Drop-in for input[type=date]. */
export function DateField({
  label,
  value,
  onChange,
  locale,
  placeholder = "Pick a date",
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  locale: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  let shown = placeholder;
  try {
    if (value) {
      const [y, m, d] = value.split("-").map(Number);
      shown = new Date(y, m - 1, d).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  } catch {
    // keep placeholder
  }
  return (
    <>
      {label && <div className="text-sm font-medium mb-1.5">{label}</div>}
      <button
        type="button"
        onClick={() => {
          void tapLight();
          setOpen(true);
        }}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm active:scale-[0.99] transition-transform"
      >
        <span className={value ? "" : "text-muted-foreground"}>{shown}</span>
      </button>
      <DateSheet
        open={open}
        value={value}
        locale={locale}
        onPick={(iso) => onChange(iso ?? "")}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
