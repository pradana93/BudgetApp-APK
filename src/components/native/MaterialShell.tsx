import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import {
  LayoutDashboard, Wallet, Receipt, Bell, NotebookPen, ShieldCheck,
  Settings, LogOut, Menu, Plus, CalendarDays, Trophy, History, X,
  type LucideIcon,
} from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";
import { titleFor } from "@/components/Layout";
import { tapLight } from "@/lib/haptics";
import { registerDrawerCloser } from "@/lib/nativeUi";
import { UserAvatar } from "@/components/UserAvatar";
import { initialsOf } from "@/lib/avatar";
import type { StringKey } from "@/i18n/translations";

type Dest = { to: string; key: StringKey; icon: LucideIcon };

const PRIMARY: Dest[] = [
  { to: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/budgets", key: "nav.budgets", icon: Wallet },
  { to: "/requests", key: "nav.requests", icon: Receipt },
];

const EXTRA: Dest[] = [
  { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { to: "/space", key: "nav.space", icon: NotebookPen },
  { to: "/rewards", key: "nav.rewards", icon: Trophy },
  { to: "/changelogs", key: "nav.changelogs", icon: History },
];

/**
 * Material shell — rendered INSTEAD of Layout inside the APK.
 * M3 top app bar + navigation bar + FAB + modal drawer.
 * Pages are reused untouched; only the chrome is native.
 */
export function MaterialShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useSession();
  const { t } = useLang();
  const loc = useLocation();
  const nav = useNavigate();
  const [drawer, setDrawer] = React.useState(false);
  const drawerRef = React.useRef(false);
  drawerRef.current = drawer;

  React.useEffect(
    () =>
      registerDrawerCloser(() => {
        if (drawerRef.current) {
          setDrawer(false);
          return true;
        }
        return false;
      }),
    []
  );

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
    setDrawer(false);
    nav(to);
  };

  const displayName = profile?.display_name || profile?.email || t("nav.userFallback");
  const hideFab = /\/new$/.test(loc.pathname);
  const drawerItems: Dest[] = [
    ...PRIMARY,
    { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
    { to: "/space", key: "nav.space", icon: NotebookPen },
    ...(profile?.role === "owner"
      ? [{ to: "/admin", key: "nav.admin", icon: ShieldCheck } as Dest]
      : []),
    { to: "/rewards", key: "nav.rewards", icon: Trophy },
    { to: "/changelogs", key: "nav.changelogs", icon: History },
    { to: "/notifications", key: "nav.notifications", icon: Bell },
    { to: "/settings", key: "nav.settings", icon: Settings },
  ];

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
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-[11px] font-bold text-white">
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
          className="m3-press fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 rounded-2xl bg-primary px-4 flex items-center gap-2 text-primary-foreground shadow-lg"
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
                  className={`relative rounded-full px-5 py-1.5 transition-colors ${
                    active ? "bg-primary/15 text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 2} />
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-background rounded-r-2xl flex flex-col pt-[env(safe-area-inset-top)]">
            <div className="flex items-center gap-3 px-5 h-16">
              <span className="rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 p-2 text-white">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">BudgetApp</div>
                <div className="text-xs text-muted-foreground truncate">{displayName}</div>
              </div>
              <button type="button" aria-label="Close" onClick={() => setDrawer(false)} className="m3-press rounded-full p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {drawerItems.map((n) => {
                const active = n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <button
                    key={n.to}
                    type="button"
                    onClick={() => go(n.to)}
                    className={`m3-press w-full flex items-center gap-3 px-4 h-14 rounded-full text-sm ${
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
                onClick={async () => { await signOut(); setDrawer(false); nav("/login"); }}
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

