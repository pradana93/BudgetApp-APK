import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/i18n/LanguageContext";
import { usePwa } from "@/hooks/usePwa";
import { Download, Fingerprint } from "lucide-react";
import { AVATAR_THEMES, initialsOf, setAvatarTheme, useAvatarTheme, isAcceptedAvatar, prepareAvatar, avatarPublicUrl } from "@/lib/avatar";
import { xpOf, levelOf, type ReqLite } from "@/lib/gamify";
import { formatDate } from "@/lib/datetime";
import { Check, Trophy } from "lucide-react";
import { isNative } from "@/lib/native";
import { initNativePush } from "@/lib/push";
import { notifyUser } from "@/lib/notify";
import { getLockMode, setLockMode, setPin, clearPin, reauthWithPassword, type LockMode } from "@/lib/applock";

function NativePushBlock() {
  const { t } = useLang();
  const { toast } = useToast();
  const { profile } = useSession();
  const [status, setStatus] = React.useState<"checking" | "ready" | "blocked" | "unregistered">("checking");
  const [busy, setBusy] = React.useState(false);
  const [prefs, setPrefs] = React.useState<{ digest: boolean; due: boolean } | null>(null);
  const check = React.useCallback(async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      const { data } = await supabase.from("push_tokens").select("token").limit(1);
      if (perm.receive === "granted" && data && data.length > 0) setStatus("ready");
      else if (perm.receive === "denied") setStatus("blocked");
      else setStatus("unregistered");
    } catch {
      setStatus("unregistered");
    }
  }, []);
  React.useEffect(() => { void check(); }, [check]);
  React.useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("notification_prefs").select("digest_enabled,due_enabled").eq("user_id", user.id).maybeSingle();
        const row = data as { digest_enabled?: boolean; due_enabled?: boolean } | null;
        setPrefs({ digest: row?.digest_enabled ?? true, due: row?.due_enabled ?? true });
      } catch {
        setPrefs({ digest: true, due: true });
      }
    })();
  }, []);
  const enable = async () => {
    setBusy(true);
    try { await initNativePush(); await check(); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      await notifyUser(profile?.id, t("set.testTitle"), t("set.testBody"));
      toast({ title: t("set.testSent") });
    } finally { setBusy(false); }
  };
  const flipPref = async (key: "digest" | "due") => {
    if (!prefs || !profile) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      await supabase.from("notification_prefs").upsert(
        { user_id: profile.id, digest_enabled: next.digest, due_enabled: next.due },
        { onConflict: "user_id" }
      );
    } catch {
      // best-effort; server defaults to on
    }
  };
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        {status === "checking" ? t("common.loading") : status === "ready" ? t("set.pushReady") : status === "blocked" ? t("set.pushBlocked") : t("set.pushDesc")}
      </div>
      <div className="flex flex-wrap gap-2">
        {status !== "ready" && status !== "checking" && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void enable()}>{t("set.enable")}</Button>
        )}
        <Button variant="outline" size="sm" disabled={busy || status !== "ready"} onClick={() => void test()}>{t("set.testPush")}</Button>
      </div>
      {prefs && (
        <div className="space-y-2 pt-1">
          {([["digest", "set.digestTgl"], ["due", "set.dueTgl"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
              <span className="text-sm">{t(label)}</span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[k]}
                onClick={() => void flipPref(k)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${prefs[k] ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[k] ? "left-6" : "left-1"}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Verify account password, then clear a forgotten PIN so a new one can be set. */
function ResetPinBlock() {
  const { t } = useLang();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setError(""); }} className="text-xs text-muted-foreground underline">
        {t("pin.forgot")}
      </button>
    );
  }
  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await reauthWithPassword(password);
      if (!res.ok) {
        if (res.reason === "wrong-password") setError(t("pin.wrongPw"));
        else setError(t("pin.cantVerify"));
        return;
      }
      clearPin();
      setDone(true);
      setOpen(false);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return <p className="text-xs text-emerald-700">{t("pin.cleared")}</p>;
  }
  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-2">
      <div className="text-xs font-medium">{t("pin.confirmTitle")}</div>
      <Input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder={t("pin.pwPh")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); setPassword(""); setError(""); }}>{t("common.cancel")}</Button>
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || password.length === 0}>
          {busy ? "…" : t("pin.verifyClear")}
        </Button>
      </div>
    </div>
  );
}

/** Native-only lock settings: biometric / PIN-4 / PIN-6 + setup. Renders nothing on web. */
function DeviceLockCard() {
  const { t } = useLang();
  const [mode, setModeState] = React.useState<LockMode>("off");
  const [step, setStep] = React.useState<"idle" | "enter" | "confirm">("idle");
  const [first, setFirst] = React.useState("");
  const [entry, setEntry] = React.useState("");
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    setModeState(getLockMode());
  }, []);
  if (!isNative()) return null;

  const wantLen = mode === "pin6" ? 6 : 4;
  const pick = (m: LockMode) => {
    setLockMode(m);
    setModeState(m);
    setStep(m === "pin4" || m === "pin6" ? "enter" : "idle");
    setFirst("");
    setEntry("");
    setError("");
    setSaved(false);
  };
  const press = async (k: string) => {
    setError("");
    let next = entry;
    if (k === "back") next = entry.slice(0, -1);
    else if (/^[0-9]$/.test(k)) next = (entry + k).slice(0, wantLen);
    else return;
    setEntry(next);
    if (next.length === wantLen) {
      if (step === "enter") {
        setFirst(next);
        setEntry("");
        setStep("confirm");
      } else {
        if (next !== first) {
          setError(t("pin.mismatch"));
          setFirst("");
          setEntry("");
          setStep("enter");
        } else {
          const ok = await setPin(next);
          if (ok) {
            setSaved(true);
            setStep("idle");
            setEntry("");
            setFirst("");
            window.setTimeout(() => setSaved(false), 2500);
          } else {
            setError(t("pin.saveFail"));
            setEntry("");
          }
        }
      }
    }
  };

  const options: Array<{ id: LockMode; label: string; desc: string }> = [
    { id: "off", label: t("pin.modeOff"), desc: t("pin.modeOffD") },
    { id: "biometric", label: t("pin.modeBio"), desc: t("pin.modeBioD") },
    { id: "pin4", label: t("pin.modePin4"), desc: t("pin.modePin4D") },
    { id: "pin6", label: t("pin.modePin6"), desc: t("pin.modePin6D") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4" /> {t("pin.lockTitle")}
        </CardTitle>
        <CardDescription>
          {t("pin.lockDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              aria-pressed={mode === o.id}
              className={`rounded-xl border p-3 text-left transition-colors ${
                mode === o.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
              }`}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs text-muted-foreground">{o.desc}</div>
            </button>
          ))}
        </div>
        {(mode === "pin4" || mode === "pin6") && step !== "idle" && (
          <div className="rounded-xl border border-border/60 p-4 text-center">
            <div className="text-sm font-medium">
              {step === "enter" ? t("pin.enterPin", { n: wantLen }) : t("pin.confirmPin")}
            </div>
            <div className="mt-3 flex justify-center gap-2.5">
              {Array.from({ length: wantLen }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full ${i < entry.length ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mx-auto mt-3 grid max-w-[240px] grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((k, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={k === ""}
                  onClick={() => void press(k)}
                  className="h-12 rounded-full bg-muted text-lg font-semibold disabled:opacity-0 active:scale-95 transition-transform"
                >
                  {k === "back" ? "⌫" : k}
                </button>
              ))}
            </div>
          </div>
        )}
        {saved && <p className="text-xs text-emerald-700">{t("pin.saved")}</p>}
        {(mode === "pin4" || mode === "pin6") && step === "idle" && (
          <ResetPinBlock />
        )}
      </CardContent>
    </Card>
  );
}

/** Native APK version (App plugin) + web commit fingerprint. */
function BuildInfo() {
  const [appVer, setAppVer] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isNative()) return;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        setAppVer(`${info.version} (${info.build})`);
      } catch {
        // ignore
      }
    })();
  }, []);
  return (
    <div className="text-xs text-muted-foreground">
      {appVer ? `BudgetApp Android ${appVer}` : null}
      {appVer ? " • " : ""}Build {typeof __GIT_SHA__ !== "undefined" ? __GIT_SHA__.slice(0, 7) : "local"}
    </div>
  );
}

export default function Settings(){
  const { profile, session, refresh } = useSession();
  const { toast } = useToast();
  const { t, lang } = useLang();
  const pwa = usePwa();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = React.useState(profile?.display_name ?? "");
  const [savingName, setSavingName] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [savingPw, setSavingPw] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [imgFailed, setImgFailed] = React.useState(false);
  const [photoVer, setPhotoVer] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const avatarCls = useAvatarTheme(profile?.id);
  const name = profile?.display_name || profile?.email || session?.user.email || t("nav.userFallback");
  const photoSrc = profile?.avatar_url && !imgFailed
    ? `${profile.avatar_url}?v=${photoVer}`
    : null;

  React.useEffect(() => { setDisplayName(profile?.display_name ?? ""); }, [profile?.display_name]);

  const { data: mine } = useQuery({
    queryKey: ["my-stats"],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase.from("reimbursement_requests").select("status,receipt_url").eq("requester_id", profile.id).limit(500);
      if (error) throw error;
      return (data ?? []) as { status: string; receipt_url: string | null }[];
    },
    enabled: !!profile,
  });

  const { data: joinedRow } = useQuery({
    queryKey: ["profile-joined"],
    queryFn: async () => {
      if (!profile) return null;
      const { data, error } = await supabase.from("profiles").select("created_at").eq("id", profile.id).single();
      if (error) throw error;
      return data as { created_at: string } | null;
    },
    enabled: !!profile,
  });

  const lite = (mine ?? []) as unknown as ReqLite[];
  const xp = xpOf(lite, profile?.id ?? "");
  const lvl = levelOf(xp);
  const filed = lite.length;
  const reconciled = lite.filter((r) => r.status === "reconciled").length;
  const decided = lite.filter((r) => r.status !== "pending").length;
  const approvedLike = lite.filter((r) => r.status === "approved" || r.status === "reconciled").length;
  const rate = decided > 0 ? Math.round((approvedLike / decided) * 100) : null;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!profile || trimmed.length === 0 || trimmed.length > 100) {
      toast({ title: t("set.badName"), description: t("set.badNameDesc"), variant: "destructive" });
      return;
    }
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", profile.id);
    setSavingName(false);
    if (error) toast({ title: t("set.saveFailed"), description: error.message, variant: "destructive" });
    else { toast({ title: t("set.updated") }); refresh(); qc.invalidateQueries({ queryKey: ["profile-avatar", profile.id] }); }
  };

  const onPickFile = async (f: File | null) => {
    if (!f || !profile) return;
    if (!isAcceptedAvatar(f)) { toast({ title: t("profile.badType"), variant: "destructive" }); return; }
    setUploading(true);
    try {
      const blob = await prepareAvatar(f);
      const path = `${profile.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: avatarPublicUrl(profile.id) }).eq("id", profile.id);
      if (dbErr) throw dbErr;
      setImgFailed(false);
      setPhotoVer((v) => v + 1);
      refresh();
      qc.invalidateQueries({ queryKey: ["profile-avatar", profile.id] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: t("profile.uploaded") });
    } catch (e) {
      toast({ title: t("profile.uploadFailed"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    if (!profile) return;
    setUploading(true);
    try {
      await supabase.storage.from("avatars").remove([`${profile.id}/avatar.jpg`]);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
      if (error) throw error;
      refresh();
      qc.invalidateQueries({ queryKey: ["profile-avatar", profile.id] });
      toast({ title: t("profile.removed") });
    } catch (e) {
      toast({ title: t("profile.uploadFailed"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: t("set.badPw"), description: t("set.badPwDesc"), variant: "destructive" });
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) toast({ title: t("set.pwFailed"), description: error.message, variant: "destructive" });
    else { setNewPassword(""); toast({ title: t("set.pwUpdated") }); }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const [b, r, l, c] = await Promise.all([
        supabase.from("budgets").select("*"),
        supabase.from("reimbursement_requests").select("*"),
        supabase.from("ledger_entries").select("*").order("created_at", { ascending: true }).limit(1000),
        supabase.from("categories").select("*"),
      ]);
      const err = b.error ?? r.error ?? l.error ?? c.error;
      if (err) throw err;
      const blob = new Blob(
        [JSON.stringify({ exported_at: new Date().toISOString(), budgets: b.data, requests: r.data, ledger: l.data, categories: c.data }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budgetapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("set.exported") });
    } catch (e) {
      toast({ title: t("set.exportFailed"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return <div className="space-y-6 max-w-2xl">
    <div className="rounded-2xl bg-foreground text-background p-6 flex flex-wrap items-center gap-4 shadow-lg overflow-hidden relative">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-primary/25 blur-2xl" />
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={photoSrc ? t("profile.change") : t("profile.upload")}
          className={`group relative block h-20 w-20 overflow-hidden rounded-3xl ring-4 ring-border shadow-xl transition-transform hover:scale-[1.03] active:scale-95 ${photoSrc ? "" : `${avatarCls}`}`}
        >
          {photoSrc
            ? <img src={photoSrc} alt={name} onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-2xl font-bold">{initialsOf(name)}</span>}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {uploading ? t("common.loading") : photoSrc ? t("profile.change") : t("profile.upload")}
          </span>
        </button>
        {photoSrc && !uploading && (
          <button
            type="button"
            onClick={removePhoto}
            aria-label={t("profile.remove")}
            className="absolute -bottom-1 -right-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 shadow-md hover:opacity-90"
          >
            {t("profile.remove")}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="relative min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight truncate">{name}</h1>
        <p className="text-sm text-white/80 truncate">{profile?.email ?? session?.user.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">{profile?.role}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-white/85"><Trophy className="h-3.5 w-3.5" />{t("reward.level", { n: lvl.level })} • {xp} XP</span>
          {joinedRow && <span className="text-xs text-white/70">{t("profile.memberSince")} {formatDate(joinedRow.created_at, lang)}</span>}
        </div>
        <div className="mt-2 h-2 max-w-xs rounded-full bg-white/25 overflow-hidden">
          <div className="h-2 rounded-full bg-white transition-all" style={{ width: `${Math.round((lvl.into / lvl.span) * 100)}%` }} />
        </div>
      </div>
    </div>

    <div className="grid gap-4 grid-cols-3">
      <Card className="card-lift"><CardContent className="pt-5 text-center"><div className="stat-value">{filed}</div><div className="text-xs text-muted-foreground mt-1">{t("profile.filed")}</div></CardContent></Card>
      <Card className="card-lift"><CardContent className="pt-5 text-center"><div className="stat-value">{reconciled}</div><div className="text-xs text-muted-foreground mt-1">{t("profile.reconciled")}</div></CardContent></Card>
      <Card className="card-lift"><CardContent className="pt-5 text-center"><div className="stat-value">{rate === null ? "—" : `${rate}%`}</div><div className="text-xs text-muted-foreground mt-1">{t("profile.approvalRate")}</div></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>{t("profile.customize")}</CardTitle><CardDescription>{t("profile.customizeDesc")}</CardDescription></CardHeader><CardContent>
      <div className="flex flex-wrap gap-3">
        {AVATAR_THEMES.map((th) => {
          const selected = th.cls === avatarCls;
          return (
            <button key={th.id} type="button" title={th.id} aria-label={th.id} aria-pressed={selected}
              onClick={() => { if (profile) setAvatarTheme(profile.id, th.id); }}
              className={`flex h-12 w-12 items-center justify-center rounded-full ${th.cls} text-white shadow-md transition-transform active:scale-95 ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:scale-105"}`}>
              {selected && <Check className="h-5 w-5" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? t("common.loading") : photoSrc ? t("profile.change") : t("profile.upload")}
        </Button>
        {photoSrc && (
          <Button type="button" variant="ghost" size="sm" onClick={removePhoto} disabled={uploading}>{t("profile.remove")}</Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("profile.photoDesc")}</p>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("profile.editTitle")}</CardTitle><CardDescription>{t("set.nameDesc")}</CardDescription></CardHeader><CardContent>
      <form onSubmit={saveName} className="flex flex-col sm:flex-row gap-2">
        <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder={t("set.namePh")} maxLength={100} />
        <Button type="submit" disabled={savingName}>{savingName ? t("set.saving") : t("set.save")}</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{t("profile.security")}</CardTitle><CardDescription>{t("set.pwDesc")}</CardDescription></CardHeader><CardContent>
      <form onSubmit={savePassword} className="flex flex-col sm:flex-row gap-2">
        <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder={t("set.pwPh")} />
        <Button type="submit" disabled={savingPw}>{savingPw ? t("set.updating") : t("set.update")}</Button>
      </form>
    </CardContent></Card>

    <DeviceLockCard />
    <Card><CardHeader><CardTitle>{t("profile.yourData")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("set.storageA")} <code>receipts</code> {t("set.storageB")} <code>{"{user_id}/{request_id}/{filename}"}</code>.
      </p>
      <Button variant="outline" onClick={exportData} disabled={exporting}>{exporting ? t("common.loading") : t("set.export")}</Button>
      <p className="text-xs text-muted-foreground">{t("set.exportDesc")}</p>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>{isNative() ? t("set.push") : t("set.install")}</CardTitle><CardDescription>{isNative() ? t("set.pushDesc") : t("set.installDesc")}</CardDescription></CardHeader><CardContent className="space-y-4">
      {isNative() ? <NativePushBlock /> : (<>
      <div className="flex flex-wrap items-center gap-2">
        {pwa.installed
          ? <Badge variant="approved">{t("set.installed")}</Badge>
          : pwa.canInstall
            ? <Button variant="outline" onClick={pwa.install}><Download className="h-4 w-4 mr-2" />{t("set.install")}</Button>
            : <span className="text-sm text-muted-foreground">{t("set.installLater")}</span>}
      </div>
      <div className="border-t pt-3">
        <div className="text-sm font-medium mb-1">{t("set.push")}</div>
        <p className="text-sm text-muted-foreground mb-2">{t("set.pushDesc")}</p>
        {!pwa.supported
          ? <div className="text-sm text-muted-foreground">{t("set.pushUnsupported")}</div>
          : <Button variant="outline" disabled={pwa.busy} onClick={async () => {
              const turningOff = pwa.subscribed;
              const ok = turningOff ? await pwa.unsubscribe() : await pwa.subscribe();
              if (ok) toast({ title: turningOff ? t("set.pushOff") : t("set.pushOn") });
              else toast({ title: t("set.pushUnsupported"), variant: "destructive" });
            }}>{pwa.subscribed ? t("set.disable") : t("set.enable")}</Button>}
      </div>
      </>)}
    </CardContent></Card>

    <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>{t("set.signOut")}</Button>
    <BuildInfo />
  </div>;
}
