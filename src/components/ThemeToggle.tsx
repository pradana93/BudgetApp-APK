import * as React from "react";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Mode = "light" | "dark" | "system";

function systemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function getInitial(): Mode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("budgetapp-theme");
  if (saved === "dark" || saved === "light" || saved === "system") return saved;
  return "system";
}

function applyMode(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [mode, setMode] = React.useState<Mode>(getInitial);

  React.useEffect(() => {
    applyMode(mode);
    window.localStorage.setItem("budgetapp-theme", mode);
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyMode("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [mode]);

  const cycle = () => setMode((m) => (m === "light" ? "dark" : m === "dark" ? "system" : "light"));

  return (
    <Button variant="ghost" size="sm" onClick={cycle} aria-label="Theme: light, dark, or system">
      {mode === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : mode === "system" ? (
        <MonitorSmartphone className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
