import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import {
  LayoutDashboard, Wallet, Receipt, Bell, NotebookPen, ShieldCheck,
  Settings, LogOut, Menu, Plus, CalendarDays, History, X, ListChecks,
  type LucideIcon,
} from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";
import { titleFor } from "@/components/Layout";
import { tapLight } from "@/lib/haptics";
import { registerDrawerCloser } from "@/lib/nativeUi";
import { parseDeepLink, runDeepLink } from "@/lib/deeplinks";
import { shouldLock, unlockApp, recordUnlock, unlockedSinceBackground, noteInactive, brieflyAway, verifyPin } from "@/lib/applock";
import { UserAvatar } from "@/components/UserAvatar";
import { initialsOf } from "@/lib/avatar";
import { useToast } from "@/components/ui/toast";
import { Fingerprint } from "lucide-react";
import type { StringKey } from "@/i18n/translations";

type Dest = { to: string; key: StringKey; icon: LucideIcon };

const PRIMARY: Dest[] = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/budgets", key: "nav.budgets", icon: Wallet },
  { to: "/requests", key: "nav.requests", icon: Receipt },
];

/**
 * Material shell — rendered INSTEAD of Layout inside the APK.
 * M3 top app bar + navigation bar + FAB + modal drawer.
 * Pages are reused untouched; only the chrome is native.
 */
export function MaterialShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useSession();
  const { t } = useLang();
  const { toast } = useToast();
  const loc = useLocation();
  const nav = useNavigate();
  const [drawer, setDrawer] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const stateRef = React.useRef({ drawer: false, closing: false });
  stateRef.current = { drawer, closing };
  const closeTimer = React.useRef<number | null>(null);

  const closeDrawer = React.useCallback((animated: boolean) => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (!stateRef.current.drawer) return;
    if (animated) {
      setClosing(true);
      closeTimer.current = window.setTimeout(() => {
        setDrawer(false);
        setClosing(false);
        closeTimer.current = null;
      }, 180);
    } else {
      setDrawer(false);
      setClosing(false);
    }
  }, []);

  const closeDrawerRef = React.useRef(closeDrawer);
  closeDrawerRef.current = closeDrawer;

  React.useEffect(
    () =>
      registerDrawerCloser(() => {
        if (!stateRef.current.drawer) return false;
        closeDrawerRef.current(true);
        return true;
      }),
    []
  );

  // Deep links (launcher shortcuts, widget, notification actions).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        // NOTE: no removeAllListeners here — NativeEffects owns the wipe.
        void App.addListener("appUrlOpen", async ({ url }) => {
          if (!alive) return;
          const action = parseDeepLink(url);
          if (!action) return;
          const res = await runDeepLink(action, (to) => nav(to));
          if (res.message) toast({ title: res.message });
          if (!res.ok && res.message) toast({ title: res.message, variant: "destructive" });
        });
      } catch {
        // Deep links unavailable — normal links still work.
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav, toast]);

  // Lock gate on launch + resume (fail-open by design).
  // Loop-proof: an unlock that lands after the last backgrounding means
  // the user just authenticated — never re-lock for that resume.
  // Brief blips (prompt, share sheet) are ignored; real leaves lock.
  React.useEffect(() => {
    let alive = true;
    const gate = async () => {
      const check = await shouldLock();
      if (alive && check.state === "locked") {
        setLockMode(check.mode);
        setLocked(true);
      }
    };
    void gate();
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        sub = (await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            noteInactive();
            return;
          }
          if (unlockedSinceBackground() || brieflyAway()) return;
          void gate();
        })) as unknown as { remove: () => void };
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
      try {
        sub?.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const { data: unread } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile,
  });

  const roleTab: Dest =
    profile?.role === "owner"
      ? { to: "/admin", key: "nav.admin", icon: ShieldCheck }
      : { to: "/space", key: "nav.space", icon: NotebookPen };
  const bar: (Dest & { badge?: number })[] = [
    ...PRIMARY,
    roleTab,
    { to: "/notifications", key: "nav.notifications", icon: Bell, badge: unread ?? 0 },
  ];

  const go = (to: string) => {
    void tapLight();
    closeDrawer(false);
    nav(to);
  };

  const displayName = profile?.display_name || profile?.email || t("nav.userFallback");
  const hideFab = /\/new$/.test(loc.pathname);
  const drawerItems: Dest[] = [
    ...PRIMARY,
    { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
    { to: "/space", key: "nav.space", icon: NotebookPen },
    ...(profile?.role === "owner"
      ? [
          { to: "/triage", key: "admin.queue", icon: ListChecks } as Dest,
          { to: "/admin", key: "nav.admin", icon: ShieldCheck } as Dest,
        ]
      : []),
    { to: "/changelogs", key: "nav.changelogs", icon: History },
    { to: "/notifications", key: "nav.notifications", icon: Bell },
    { to: "/settings", key: "nav.settings", icon: Settings },
  ];

  const [lockFails, setLockFails] = React.useState(0);
  const [lockMode, setLockMode] = React.useState<"biometric" | "pin4" | "pin6">("biometric");
  const [pinEntry, setPinEntry] = React.useState("");
  const [pinError, setPinError] = React.useState("");
  const tryUnlock = async () => {
    setUnlocking(true);
    try {
      const ok = await unlockApp();
      if (ok) {
        recordUnlock();
        setLocked(false);
        setLockFails(0);
      } else {
        setLockFails((n) => n + 1);
      }
    } finally {
      setUnlocking(false);
    }
  };
  const pressPinDigit = (d: string) => {
    setPinError("");
    const len = lockMode === "pin6" ? 6 : 4;
    const next = (pinEntry + d).slice(0, len);
    setPinEntry(next);
    if (next.length === len) {
      void (async () => {
        const ok = await verifyPin(next);
        if (ok) {
          recordUnlock();
          setLocked(false);
          setLockFails(0);
          setPinEntry("");
        } else {
          setLockFails((n) => n + 1);
          setPinError("Wrong PIN — try again.");
          window.setTimeout(() => setPinEntry(""), 350);
        }
      })();
    }
  };

  if (locked) {
    const pinLen = lockMode === "pin6" ? 6 : 4;
    const showPin = lockMode === "pin4" || lockMode === "pin6";
    return (
      <div className="native-app min-h-screen bg-foreground text-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="rounded-2xl bg-background/10 p-4">
          <Fingerprint className="h-10 w-10" />
        </span>
        <h1 className="font-display text-2xl font-semibold">BudgetApp locked</h1>
        <p className="text-sm opacity-70">Confirm it&apos;s you to open your budgets.</p>
        {showPin ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-2.5" aria-label="PIN entry">
              {Array.from({ length: pinLen }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full transition-colors ${
                    i < pinEntry.length ? "bg-background" : "bg-background/25"
                  }`}
                />
              ))}
            </div>
            {pinError && <p className="text-xs text-red-300">{pinError}</p>}
            <div className="grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={k === ""}
                  onClick={() => {
                    if (k === "⌫") setPinEntry((p) => p.slice(0, -1));
                    else if (k !== "") pressPinDigit(k);
                  }}
                  className="m3-press h-16 w-16 rounded-full bg-background/10 text-xl font-semibold disabled:opacity-0"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void tryUnlock()}
            disabled={unlocking}
            className="m3-press rounded-full bg-background px-6 h-12 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            {unlocking ? "…" : "Unlock"}
          </button>
        )}
        {lockFails >= 3 && (
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem("budgetapp-applock", "0");
                localStorage.setItem("budgetapp-applock-mode", "off");
              } catch {
                // ignore
              }
              setLocked(false);
            }}
            className="text-xs opacity-60 underline"
          >
            Turn off app lock
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="native-app min-h-screen bg-background text-foreground flex flex-col">
      {/* M3 small top app bar */}
      <header className="sticky top-0 z-30 bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-1 px-2 h-16">
          <button
            type="button"
            aria-label="Menu"
            onClick={() => { void tapLight(); setDrawer(true); }}
            className="m3-press rounded-full p-3 text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-[22px] leading-7 font-normal tracking-normal truncate px-1">
            {t(titleFor(loc.pathname))}
          </h1>
          <span className="flex-1" />
          <button
            type="button"
            aria-label={t("nav.notifications")}
            onClick={() => go("/notifications")}
            className="m3-press relative rounded-full p-3 text-foreground"
          >
            <Bell className="h-5 w-5" />
            {(unread ?? 0) > 0 && (
              <span className="absolute top-1.5 right-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1 leading-4">
                {unread}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label={t("nav.settings")}
            onClick={() => go("/settings")}
            className="m3-press rounded-full p-1.5"
          >
            {profile ? (
              <UserAvatar userId={profile.id} name={displayName} className="h-8 w-8 text-[11px]" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {initialsOf(displayName)}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pb-40">{children}</main>

      {/* M3 FAB — quick reimbursement request */}
      {!hideFab && (
        <button
          type="button"
          aria-label={t("req.new")}
          onClick={() => go("/requests/new")}
          className="m3-press m3-fab-in fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 rounded-2xl bg-primary px-4 flex items-center gap-2 text-primary-foreground shadow-lg"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium pr-1">{t("req.new")}</span>
        </button>
      )}

      {/* M3 navigation bar */}
      <nav aria-label="Primary" className="fixed bottom-0 inset-x-0 z-40 bg-background">
        <div className="grid grid-cols-5 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {bar.map((tb) => {
            const active = tb.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(tb.to);
            const Icon = tb.icon;
            return (
              <button
                key={tb.to}
                type="button"
                onClick={() => go(tb.to)}
                className="m3-press flex flex-col items-center gap-1 min-w-0"
              >
                <span
                  className={`relative rounded-full px-5 py-1.5 transition-all duration-200 ${
                    active ? "bg-primary/15 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className={`h-6 w-6 transition-transform duration-200 ${active ? "scale-110" : ""}`} strokeWidth={active ? 2.25 : 2} />
                  {!!tb.badge && tb.badge > 0 && (
                    <span className="absolute top-0 right-2 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1 leading-4">
                      {tb.badge}
                    </span>
                  )}
                </span>
                <span className={`text-xs truncate max-w-full ${active ? "font-semibold" : "font-medium"}`}>
                  {t(tb.key)}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* M3 modal navigation drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className={`absolute inset-0 bg-black/40 ${closing ? "m3-scrim-out" : "m3-scrim-in"}`} onClick={() => closeDrawer(true)} />
          <aside className={`absolute left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-background rounded-r-2xl flex flex-col pt-[env(safe-area-inset-top)] ${closing ? "m3-drawer-out" : "m3-drawer-in"}`}>
            <div className="flex items-center gap-3 px-5 h-16">
              <span className="rounded-xl bg-primary p-2 text-primary-foreground">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">BudgetApp</div>
                <div className="text-xs text-muted-foreground truncate">{displayName}</div>
              </div>
              <button type="button" aria-label="Close" onClick={() => closeDrawer(true)} className="m3-press rounded-full p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {drawerItems.map((n, i) => {
                const active = n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <button
                    key={n.to}
                    type="button"
                    onClick={() => go(n.to)}
                    style={{ animationDelay: `${Math.min(i, 8) * 28}ms` }}
                    className={`m3-press m3-item-in w-full flex items-center gap-3 px-4 h-14 rounded-full text-sm ${
                      active ? "bg-primary/15 font-semibold" : "font-medium text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{t(n.key)}</span>
                  </button>
                );
              })}
            </div>
            <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={async () => { await signOut(); closeDrawer(false); nav("/login"); }}
                className="m3-press w-full flex items-center gap-3 px-4 h-14 rounded-full text-sm font-medium text-muted-foreground"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                {t("nav.signOut")}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

