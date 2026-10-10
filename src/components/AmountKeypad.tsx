import * as React from "react";
import { Delete, X } from "lucide-react";
import { evaluateExpression, hasCalcOps, groupDigits } from "@/lib/calc";
import { tapLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * In-app amount keypad: identical experience everywhere, never at the
 * mercy of the system keyboard. IDR-first: thousand grouping live,
 * 000 key, and inline + / − / = with a live result.
 */
export function AmountKeypad({
  open,
  digits,
  onDigits,
  onClose,
  title = "Amount",
}: {
  open: boolean;
  digits: string;
  onDigits: (digits: string) => void;
  onClose: () => void;
  title?: string;
}) {
  if (!open) return null;

  return (
    <KeypadBody digits={digits} onDigits={onDigits} onClose={onClose} title={title} />
  );
}

function KeypadBody({
  digits,
  onDigits,
  onClose,
  title,
}: {
  digits: string;
  onDigits: (d: string) => void;
  onClose: () => void;
  title: string;
}) {
  const calcOpen = hasCalcOps(digits);
  const lastSegment = digits.split(/([+-])/).pop() || "";
  const liveResult = calcOpen ? evaluateExpression(digits) : null;
  const display = digits === "" ? "0" : calcOpen ? digits : groupDigits(digits);

  const press = (fn: () => void) => () => {
    void tapLight();
    fn();
  };

  const closeAndCollapse = () => {
    if (calcOpen) {
      const r = evaluateExpression(digits);
      if (r !== null) onDigits(r);
    }
    onClose();
  };

  const typeDigit = (d: string) => {
    if (lastSegment === "0" && d !== "0") onDigits(digits.slice(0, -1) + d);
    else if (lastSegment === "0" && d === "0") onDigits(digits);
    else onDigits(digits + d);
  };

  const typeTripleZero = () => {
    if (lastSegment === "" || lastSegment === "0") return;
    onDigits(digits + "000");
  };

  const typeOp = (op: "+" | "-") => {
    if (!digits) return;
    const last = digits[digits.length - 1];
    if (/[0-9]/.test(last)) onDigits(digits + op);
  };

  const equals = () => {
    const r = evaluateExpression(digits);
    if (r !== null) onDigits(r);
  };

  const backspace = () => onDigits(digits.slice(0, -1));

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      onClick={closeAndCollapse}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="m3-banner-in w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-card border border-border/60 shadow-2xl overflow-hidden p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 rounded-full bg-muted-foreground/30 mx-auto sm:hidden" />
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={closeAndCollapse}
            aria-label="Close"
            className="m3-press rounded-full p-2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-foreground text-background px-4 py-3.5">
          <div className="font-display tnum text-3xl font-semibold truncate text-right">
            {display}
          </div>
          <div className="mt-0.5 h-4 text-right text-xs opacity-70 tnum">
            {calcOpen && liveResult !== null ? `= ${groupDigits(liveResult)}` : " "}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
            <Key key={d} label={d} onPress={press(() => typeDigit(d))} />
          ))}
          <Key label="000" onPress={press(typeTripleZero)} accent />
          <Key label="0" onPress={press(() => typeDigit("0"))} />
          <button
            type="button"
            onClick={press(backspace)}
            aria-label="Backspace"
            className="m3-press h-14 rounded-2xl bg-muted text-foreground flex items-center justify-center"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Key label="+" onPress={press(() => typeOp("+"))} accent />
          <Key label="−" onPress={press(() => typeOp("-"))} accent />
          <Key label="=" onPress={press(equals)} accent />
        </div>

        <button
          type="button"
          onClick={closeAndCollapse}
          className="m3-press w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Key({
  label,
  onPress,
  accent,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "m3-press h-14 rounded-2xl text-lg font-bold tnum",
        accent ? "bg-muted text-foreground" : "bg-background border border-border text-foreground"
      )}
    >
      {label}
    </button>
  );
}
