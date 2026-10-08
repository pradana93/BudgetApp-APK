import { Wallet, Zap, ShieldCheck, Lock } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

/** Deep-pine brand panel for auth screens. Hidden on small screens. */
export function AuthBrand() {
  const { t } = useLang();
  const feats = [
    { icon: Zap, text: t("auth.f1") },
    { icon: ShieldCheck, text: t("auth.f2") },
    { icon: Lock, text: t("auth.f3") },
  ];
  return (
    <div className="hidden md:flex flex-col justify-between rounded-l-lg bg-foreground text-background p-8 min-h-[540px]">
      <div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-background/10 p-2.5">
            <Wallet className="h-6 w-6" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">BudgetApp</span>
        </div>
        <p className="mt-6 font-display text-2xl font-medium leading-snug">{t("nav.tagline")}</p>
      </div>
      <ul className="space-y-4">
        {feats.map((f) => (
          <li key={f.text} className="flex items-center gap-3 text-sm text-background/90">
            <span className="rounded-full bg-background/15 p-1.5">
              <f.icon className="h-4 w-4" />
            </span>
            {f.text}
          </li>
        ))}
      </ul>
      <p className="text-xs text-background/60">IDR-first • RLS-secured • Realtime</p>
    </div>
  );
}
