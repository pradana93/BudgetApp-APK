import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useLang } from "@/i18n/LanguageContext";
import { useToast } from "@/components/ui/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatMoney, isValidMoney } from "@/lib/money";
import { dateLocale } from "@/lib/datetime";
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, Wallet, ArrowLeftRight, Utensils, Film, Car, Receipt, ShoppingCart, PiggyBank, DollarSign, CreditCard, Landmark, ArrowUpCircle, ArrowDownCircle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeRow } from "@/components/SwipeRow";
import { Download, Tag, Repeat, BarChart3, X, Bookmark, MoreVertical } from "lucide-react";
import { isNative } from "@/lib/native";
import { registerSheetCloser } from "@/lib/nativeUi";
import { NativePortal } from "@/lib/portal";
import { TxTypeTabs, TxFields, TxFooter } from "@/components/SpaceTxForm";
import { SheetSelect, DateField } from "@/components/pickers";
import { PullToRefresh } from "@/components/PullToRefresh";
import { QueryError } from "@/components/QueryError";

type Entry = { id: string; title: string; body: string; amount: number | null; category_id: string | null; direction: "income" | "expense" | "transfer"; entry_date: string; created_at: string; account_id: string | null; transfer_to_account_id: string | null };
type PCat = { id: string; name: string; color: string; monthly_budget: number | null };
type Account = { id: string; name: string; icon: string; color: string; initial_balance: number; created_at: string };
type Tag = { id: string; name: string; color: string };
type Recurring = { id: string; title: string; body: string; amount: number; category_id: string | null; direction: "income" | "expense"; account_id: string | null; frequency: string; next_date: string; last_generated: string | null; active: boolean };
type Template = { title: string; amount: string; category_id: string; direction: "expense" | "income"; account_id: string };

const ICONS: Record<string, React.ElementType> = { wallet: Wallet, cash: DollarSign, bca: CreditCard, bank: Landmark, entertainment: Film, food: Utensils, car: Car, bills: Receipt, shopping: ShoppingCart, investment: PiggyBank, transfer: ArrowLeftRight };
const GRAD: Record<string, string> = { blue: "bg-blue-800", violet: "bg-violet-800", emerald: "bg-emerald-800", amber: "bg-amber-600", rose: "bg-rose-700", slate: "bg-slate-700", cyan: "bg-cyan-800", orange: "bg-orange-700" };
const TAG_COLORS = ["blue","violet","emerald","amber","rose","slate","cyan","orange"];
const FREQUENCIES = [{ value: "weekly", label: "Weekly" }, { value: "biweekly", label: "Biweekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }];

const catIcon = (name?: string | null) => {
  const k = (name ?? "").toLowerCase();
  if (k.includes("entertain")) return Film;
  if (k.includes("food")) return Utensils;
  if (k.includes("transfer")) return ArrowLeftRight;
  if (k.includes("car")) return Car;
  if (k.includes("bill")) return Receipt;
  if (k.includes("shopping")) return ShoppingCart;
  if (k.includes("invest")) return PiggyBank;
  if (k.includes("cash")) return DollarSign;
  return Wallet;
};

export default function Space() {
  const { profile } = useSession();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const freqLabel = (v: string) => v === "weekly" ? t("sp.freqWeekly") : v === "biweekly" ? t("sp.freqBiweekly") : v === "yearly" ? t("sp.freqYearly") : t("sp.freqMonthly");
  const now0 = new Date();
  const [ym, setYm] = React.useState({ y: now0.getFullYear(), m: now0.getMonth() });
  const [q, setQ] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [accFilter, setAccFilter] = React.useState("all");
  const [showAdd, setShowAdd] = React.useState(false);
  const [showAcc, setShowAcc] = React.useState(false);
  const [editing, setEditing] = React.useState<Entry | null>(null);
  const [txType, setTxType] = React.useState<"expense" | "income" | "transfer">("expense");
  const [form, setForm] = React.useState({ title: "", body: "", amount: "", category_id: "", account_id: "", to_account_id: "", entry_date: new Date().toISOString().slice(0,10) });
  const [newAcc, setNewAcc] = React.useState({ name: "", icon: "wallet", color: "blue", initial_balance: "" });
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);
  const [tagFilter, setTagFilter] = React.useState<string>("all");
  const [showTagMgr, setShowTagMgr] = React.useState(false);
  const [newTagName, setNewTagName] = React.useState("");
  const [newTagColor, setNewTagColor] = React.useState("blue");
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [showRecurring, setShowRecurring] = React.useState(false);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [recForm, setRecForm] = React.useState({ title: "", amount: "", category_id: "", direction: "expense" as "expense" | "income", account_id: "", frequency: "monthly", next_date: new Date().toISOString().slice(0,10) });
  const [templates, setTemplates] = React.useState<Template[]>(() => { try { return JSON.parse(localStorage.getItem("space-templates") ?? "[]"); } catch { return []; } });

  const { data: entries, isError: entriesError, refetch: refetchEntries } = useQuery({
    queryKey: ["personal-entries", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_notes").select("id,title,body,amount,category_id,direction,entry_date,created_at,account_id,transfer_to_account_id").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    enabled: !!profile,
  });
  const { data: cats } = useQuery({
    queryKey: ["personal-cats", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_categories").select("id,name,color,monthly_budget").order("created_at");
      if (error) throw error;
      return (data ?? []) as PCat[];
    },
    enabled: !!profile,
  });
  const { data: accounts } = useQuery({
    queryKey: ["personal-accounts", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_accounts").select("id,name,icon,color,initial_balance,created_at").order("created_at");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
    enabled: !!profile,
  });

  const { data: tags } = useQuery({
    queryKey: ["personal-tags", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_tags").select("id,name,color").order("name");
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
    enabled: !!profile,
  });
  const { data: noteTags } = useQuery({
    queryKey: ["personal-note-tags", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_note_tags").select("note_id,tag_id");
      if (error) throw error;
      return (data ?? []) as { note_id: string; tag_id: string }[];
    },
    enabled: !!profile,
  });
  const { data: recurring } = useQuery({
    queryKey: ["personal-recurring", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_recurring").select("*").order("next_date");
      if (error) throw error;
      return (data ?? []) as Recurring[];
    },
    enabled: !!profile,
  });

  React.useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`ledger-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_notes" }, () => qc.invalidateQueries({ queryKey: ["personal-entries", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_accounts" }, () => qc.invalidateQueries({ queryKey: ["personal-accounts", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_categories" }, () => qc.invalidateQueries({ queryKey: ["personal-cats", profile.id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_recurring" }, () => qc.invalidateQueries({ queryKey: ["personal-recurring", profile.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, profile]);

  React.useEffect(() => {
    if (!isNative() || !showAdd) return;
    return registerSheetCloser(() => { setShowAdd(false); return true; });
  }, [showAdd]);

  const accById = (id: string | null) => accounts?.find((a) => a.id === id);
  const catById = (id: string | null) => cats?.find((c) => c.id === id);
  const curKey = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(dateLocale(lang), { month: "long", year: "numeric" });

  const balances = React.useMemo(() => {
    const map = new Map<string, Decimal>();
    for (const a of accounts ?? []) map.set(a.id, new Decimal(a.initial_balance ?? 0));
    for (const e of entries ?? []) {
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "income" && e.account_id) map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).add(amt));
      else if (e.direction === "expense" && e.account_id) map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).sub(amt));
      else if (e.direction === "transfer" && e.account_id && e.transfer_to_account_id) {
        map.set(e.account_id, (map.get(e.account_id) ?? new Decimal(0)).sub(amt));
        map.set(e.transfer_to_account_id, (map.get(e.transfer_to_account_id) ?? new Decimal(0)).add(amt));
      }
    }
    return map;
  }, [accounts, entries]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (entries ?? []).filter((e) => {
      if (e.entry_date.slice(0,7) !== curKey) return false;
      if (catFilter !== "all" && (e.category_id ?? "none") !== catFilter) return false;
      if (accFilter !== "all" && e.account_id !== accFilter && e.transfer_to_account_id !== accFilter) return false;
      if (needle && !`${e.title} ${e.body} ${(cats ?? []).find((c) => c.id === e.category_id)?.name ?? ""}`.toLowerCase().includes(needle)) return false;
      if (tagFilter !== "all") {
        const noteTagIds = (noteTags ?? []).filter(nt => nt.note_id === e.id).map(nt => nt.tag_id);
        if (!noteTagIds.includes(tagFilter)) return false;
      }
      return true;
    });
  }, [entries, curKey, catFilter, accFilter, q, cats, tagFilter, noteTags]);

  const sums = React.useMemo(() => {
    let exp = new Decimal(0), inc = new Decimal(0);
    for (const e of filtered) {
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "expense") exp = exp.add(amt);
      else if (e.direction === "income") inc = inc.add(amt);
    }
    let bal = new Decimal(0);
    for (const a of accounts ?? []) bal = bal.add(new Decimal(a.initial_balance ?? 0));
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) > curKey) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "income") bal = bal.add(amt);
      else if (e.direction === "expense") bal = bal.sub(amt);
    }
    return { exp, inc, bal };
  }, [filtered, entries, accounts, curKey]);

  const monthTotals = React.useMemo(() => {
    let exp = new Decimal(0), inc = new Decimal(0), expN = 0, incN = 0;
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== curKey) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "expense") { exp = exp.add(amt); expN++; }
      else if (e.direction === "income") { inc = inc.add(amt); incN++; }
    }
    return { exp, inc, expN, incN };
  }, [entries, curKey]);

  const tagsForNote = React.useCallback((noteId: string) => {
    const tagIds = (noteTags ?? []).filter(nt => nt.note_id === noteId).map(nt => nt.tag_id);
    return (tags ?? []).filter(t => tagIds.includes(t.id));
  }, [noteTags, tags]);

  const lastMonth = React.useMemo(() => {
    const dt = new Date(ym.y, ym.m - 1, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
    let exp = new Decimal(0), inc = new Decimal(0);
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== key) continue;
      const amt = new Decimal(e.amount ?? 0);
      if (e.direction === "expense") exp = exp.add(amt);
      else if (e.direction === "income") inc = inc.add(amt);
    }
    return { exp, inc };
  }, [entries, ym]);

  const heatmap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== curKey) continue;
      if (e.direction !== "expense") continue;
      const day = e.entry_date.slice(8,10);
      map.set(day, (map.get(day) ?? 0) + Number(e.amount ?? 0));
    }
    return map;
  }, [entries, curKey]);

  const maxHeat = React.useMemo(() => {
    let max = 0;
    for (const v of heatmap.values()) if (v > max) max = v;
    return max;
  }, [heatmap]);

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthReport = React.useMemo(() => {
    const catTotals = new Map<string, number>();
    let total = 0;
    for (const e of entries ?? []) {
      if (e.entry_date.slice(0,7) !== curKey || e.direction !== "expense") continue;
      const a = Number(e.amount ?? 0);
      total += a;
      const catObj = (cats ?? []).find(c => c.id === e.category_id);
      const name = catObj?.name ?? "Other";
      catTotals.set(name, (catTotals.get(name) ?? 0) + a);
    }
    const sorted = [...catTotals.entries()].sort((a,b) => b[1] - a[1]).slice(0,3);
    const avgPerDay = total / Math.max(1, daysInMonth);
    return { total, topCats: sorted, avgPerDay, txCount: entries?.filter(e => e.entry_date.slice(0,7) === curKey && e.direction === "expense").length ?? 0 };
  }, [entries, curKey, cats, ym, daysInMonth]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const k = e.entry_date.slice(0,10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].sort((a,b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const shift = (d: number) => setYm((v) => { const dt = new Date(v.y, v.m + d, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; });
  const openAdd = (type: "expense"|"income"|"transfer" = "expense") => { setTxType(type); setForm({ title: "", body: "", amount: "", category_id: cats?.[0]?.id ?? "", account_id: accounts?.[0]?.id ?? "", to_account_id: accounts?.[1]?.id ?? "", entry_date: new Date().toISOString().slice(0,10) }); setEditing(null); setFormErr(null); setSelectedTagIds([]); setShowAdd(true); };
  const openAddRef = React.useRef(openAdd);
  openAddRef.current = openAdd;
  React.useEffect(() => {
    const h = () => openAddRef.current("expense");
    window.addEventListener("space:new-tx", h);
    return () => window.removeEventListener("space:new-tx", h);
  }, []);
  const openEdit = (e: Entry) => { setEditing(e); setTxType(e.direction as "expense"|"income"|"transfer"); setForm({ title: e.title, body: e.body, amount: e.amount != null ? String(e.amount) : "", category_id: e.category_id ?? "", account_id: e.account_id ?? "", to_account_id: e.transfer_to_account_id ?? "", entry_date: e.entry_date.slice(0,10) }); setFormErr(null); setSelectedTagIds((noteTags ?? []).filter(nt => nt.note_id === e.id).map(nt => nt.tag_id)); setShowAdd(true); };

  const saveTx = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      if (!form.title.trim()) { setFormErr(t("sp.reqTitle")); throw new Error("_validation"); }
      if (!isValidMoney(form.amount) || Number(form.amount) <= 0) { setFormErr(t("sp.reqAmount")); throw new Error("_validation"); }
      if (txType !== "transfer" && !form.account_id) { setFormErr(t("sp.reqLedger")); throw new Error("_validation"); }
      if (txType === "transfer" && (!form.account_id || !form.to_account_id)) { setFormErr(t("sp.reqBoth")); throw new Error("_validation"); }
      if (txType === "transfer" && form.account_id === form.to_account_id) { setFormErr(t("sp.reqDiff")); throw new Error("_validation"); }
      setFormErr(null);
      const payload: Record<string, unknown> = { user_id: profile.id, title: form.title.trim().slice(0,120), body: form.body.slice(0,4000), amount: Number(form.amount), category_id: form.category_id || null, direction: txType, entry_date: form.entry_date, account_id: form.account_id || null, transfer_to_account_id: txType === "transfer" ? form.to_account_id : null };
      if (editing) { const { error } = await supabase.from("personal_notes").update(payload).eq("id", editing.id); if (error) throw error; return { id: editing.id }; }
      else { const { data, error } = await supabase.from("personal_notes").insert(payload).select("id").single(); if (error) throw error; return data; }
    },
    onSuccess: (data) => { if (selectedTagIds.length > 0 && data) { saveNoteTags.mutate({ noteId: (data as { id: string }).id, tagIds: selectedTagIds }); } setShowAdd(false); setEditing(null); setFormErr(null); setSelectedTagIds([]); setSelectedTagIds([]); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); try { navigator.vibrate?.(15); } catch { /* vibrate not supported */ } toast({ title: t("sp.saved") }); },
    onError: (e: Error) => { if (e.message !== "_validation") toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }); },
  });
  const delTx = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_notes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { setConfirmDelete(null); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); try { navigator.vibrate?.([10, 30, 10]); } catch { /* vibrate not supported */ } toast({ title: t("sp.deleted") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });
  const createAcc = useMutation({
    mutationFn: async () => {
      if (!profile || !newAcc.name.trim()) throw new Error(t("sp.nameRequired"));
      const bal = newAcc.initial_balance.trim();
      if (bal && !isValidMoney(bal)) throw new Error(t("sp.invalidBalance"));
      const { error } = await supabase.from("personal_accounts").insert({ user_id: profile.id, name: newAcc.name.trim().slice(0,30), icon: newAcc.icon, color: newAcc.color, initial_balance: bal ? Number(bal) : 0 });
      if (error) throw error;
    },
    onSuccess: () => { setNewAcc({ name: "", icon: "wallet", color: "blue", initial_balance: "" }); setShowAcc(false); qc.invalidateQueries({ queryKey: ["personal-accounts", profile?.id] }); toast({ title: t("sp.accCreated") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });

  const delAcc = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_accounts").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { setConfirmDelete(null); qc.invalidateQueries({ queryKey: ["personal-accounts", profile?.id] }); qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }); toast({ title: t("sp.accDeleted") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });

  const saveTag = useMutation({
    mutationFn: async () => {
      if (!profile || !newTagName.trim()) throw new Error(t("sp.nameRequired"));
      const { error } = await supabase.from("personal_tags").insert({ user_id: profile.id, name: newTagName.trim().slice(0,30), color: newTagColor });
      if (error) throw error;
    },
    onSuccess: () => { setNewTagName(""); setNewTagColor("blue"); qc.invalidateQueries({ queryKey: ["personal-tags", profile?.id] }); toast({ title: t("sp.tagCreated") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });
  const delTag = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_tags").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-tags", profile?.id] }); toast({ title: t("sp.tagDeleted") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });
  const saveNoteTags = useMutation({
    mutationFn: async ({ noteId, tagIds }: { noteId: string; tagIds: string[] }) => {
      await supabase.from("personal_note_tags").delete().eq("note_id", noteId);
      if (tagIds.length > 0) {
        const rows = tagIds.map(tid => ({ note_id: noteId, tag_id: tid }));
        const { error } = await supabase.from("personal_note_tags").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-note-tags", profile?.id] }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });
  const saveRecurring = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("no user");
      if (!recForm.title.trim() || !isValidMoney(recForm.amount)) throw new Error(t("sp.errRecReq"));
      const { error } = await supabase.from("personal_recurring").insert({
        user_id: profile.id, title: recForm.title.trim().slice(0,120), amount: Number(recForm.amount),
        category_id: recForm.category_id || null, direction: recForm.direction,
        account_id: recForm.account_id || null, frequency: recForm.frequency, next_date: recForm.next_date
      });
      if (error) throw error;
    },
    onSuccess: () => { setShowRecurring(false); setRecForm({ title: "", amount: "", category_id: "", direction: "expense", account_id: "", frequency: "monthly", next_date: new Date().toISOString().slice(0,10) }); qc.invalidateQueries({ queryKey: ["personal-recurring", profile?.id] }); toast({ title: t("sp.recCreated") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });
  const delRecurring = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("personal_recurring").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["personal-recurring", profile?.id] }); toast({ title: t("sp.recDeleted") }); },
    onError: (e: Error) => toast({ title: t("sp.failed"), description: e.message, variant: "destructive" }),
  });

  const exportCsv = React.useCallback(() => {
    const rows = [["date","title","amount","direction","category","account","tags"]];
    for (const e of filtered) {
      const cat = cats?.find(c => c.id === e.category_id);
      const acc = accounts?.find(a => a.id === e.account_id);
      const eTags = tagsForNote(e.id).map(t => t.name).join(";");
      rows.push([e.entry_date, e.title, String(e.amount ?? 0), e.direction, cat?.name ?? "", acc?.name ?? "", eTags]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ledger-${curKey}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: t("sp.exportedCsv") });
  }, [filtered, cats, accounts, tagsForNote, curKey, toast]);

  const saveTemplate = React.useCallback((e: Entry) => {
    const tpl: Template = { title: e.title, amount: String(e.amount ?? 0), category_id: e.category_id ?? "", direction: (e.direction as "expense" | "income") ?? "expense", account_id: e.account_id ?? "" };
    const next = [tpl, ...templates.filter(t => t.title !== tpl.title)].slice(0, 10);
    setTemplates(next);
    try { localStorage.setItem("space-templates", JSON.stringify(next)); } catch { /* */ }
    toast({ title: t("sp.tplSaved") });
  }, [templates, toast]);

  const applyTemplate = React.useCallback((tpl: Template) => {
    setTxType(tpl.direction);
    setForm({ title: tpl.title, body: "", amount: tpl.amount, category_id: tpl.category_id, account_id: tpl.account_id, to_account_id: "", entry_date: new Date().toISOString().slice(0,10) });
    setEditing(null); setFormErr(null); setShowAdd(true); setShowTemplates(false);
  }, []);

  const totalBalance = [...balances.values()].reduce((a,b) => a.add(b), new Decimal(0));

  const isLoading = !entries && !cats && !accounts;

  const refresh = React.useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["personal-entries", profile?.id] }), qc.invalidateQueries({ queryKey: ["personal-cats", profile?.id] }), qc.invalidateQueries({ queryKey: ["personal-accounts", profile?.id] })]);
    await new Promise((r) => setTimeout(r, 300));
  }, [qc, profile]);

  if (entriesError) return <div className="space-y-3 overflow-x-clip"><QueryError onRetry={() => void refetchEntries()} /></div>;

  return <PullToRefresh onRefresh={refresh}><div className="space-y-3 overflow-x-clip">
    {/* Page Header — matches Budgets/Requests pattern */}
    <div className="flex flex-wrap justify-between items-center gap-2 overflow-hidden">
      <h1 className="text-2xl font-bold">{t("sp.title")}</h1>
      {isNative() ? (
        <div className="flex gap-2">
          <Button onClick={() => openAdd("expense")} className="h-11"><Plus className="h-4 w-4 mr-1" />{t("sp.transaction")}</Button>
          <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setShowMenu(true)} aria-label={t("sp.moreActions")}><MoreVertical className="h-4 w-4" /></Button>
        </div>
      ) : (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={exportCsv} className="hidden sm:inline-flex"><Download className="h-4 w-4 mr-1" />{t("sp.export")}</Button><Button variant="outline" size="sm" onClick={exportCsv} className="sm:hidden h-11 w-11 p-0"><Download className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)} className="hidden sm:inline-flex"><Bookmark className="h-4 w-4 mr-1" />{t("sp.templates")}</Button><Button variant="outline" size="sm" onClick={() => setShowTemplates(true)} className="sm:hidden h-11 w-11 p-0"><Bookmark className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setShowRecurring(true)} className="hidden sm:inline-flex"><Repeat className="h-4 w-4 mr-1" />{t("sp.recurring")}</Button><Button variant="outline" size="sm" onClick={() => setShowRecurring(true)} className="sm:hidden h-11 w-11 p-0"><Repeat className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setShowAcc(true)} className="hidden sm:inline-flex"><Plus className="h-4 w-4 mr-1" />{t("sp.ledger")}</Button><Button variant="outline" size="sm" onClick={() => setShowAcc(true)} className="sm:hidden h-11 w-11 p-0"><Wallet className="h-4 w-4" /></Button>
        <Button size="sm" onClick={() => openAdd("expense")} className="hidden sm:inline-flex"><Plus className="h-4 w-4 mr-1" />{t("sp.transaction")}</Button><Button size="sm" onClick={() => openAdd("expense")} className="sm:hidden h-11 w-11 p-0"><Plus className="h-4 w-4" /></Button>
      </div>
      )}
    </div>

    {/* Stats Summary — inside Card like Dashboard */}
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">{t("sp.thisMonth")}</CardTitle></CardHeader>
      <CardContent className="pt-2 overflow-hidden">
        <div className="flex items-center gap-2 mb-2 text-xs sm:text-[11px] overflow-hidden">
          {lastMonth.exp.greaterThan(0) ? (() => {
            const pct = monthTotals.exp.sub(lastMonth.exp).div(lastMonth.exp).mul(100);
            const up = pct.greaterThan(0);
            return <span className={cn("font-medium", up ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400")}>{up ? "↑" : "↓"} {Math.abs(pct.toNumber()).toFixed(0)}% {t("sp.vsLastMonth")}</span>;
          })() : <span className="text-muted-foreground">{t("sp.noLastMonth")}</span>}
        </div>
        <div className="mb-3 overflow-hidden">
          <div className="text-xs text-muted-foreground mb-1">{t("sp.daily")}</div>
          <div className="grid grid-cols-7 gap-0.5 mx-auto w-full max-w-[300px]" role="img" aria-label={t("sp.daily")}>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = String(i + 1).padStart(2, "0");
              const val = heatmap.get(day) ?? 0;
              const intensity = maxHeat > 0 ? val / maxHeat : 0;
              const bg = val === 0 ? "bg-muted/30" : intensity < 0.33 ? "bg-primary/20" : intensity < 0.66 ? "bg-primary/50" : "bg-primary";
              return <div key={i} className={cn("aspect-square rounded-[3px]", bg)} title={`${day}: ${formatMoney(val)}`} />;
            })}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground"><span>{formatMoney(0)}</span><span className="h-2 w-2 rounded-[2px] bg-muted/30" /><span className="h-2 w-2 rounded-[2px] bg-primary" /><span>{formatMoney(maxHeat)}</span></div>
        </div>
        <div className="rounded-2xl bg-foreground text-background p-4 space-y-2.5">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-[0.14em] opacity-70">{t("sp.netLedgers", { n: accounts?.length ?? 0 })}</span>
            <div className="font-display tnum font-semibold leading-none break-words text-[clamp(1.7rem,8vw,2rem)]">{formatMoney(sums.bal.toNumber())}</div>
          </div>
          <div className="h-px bg-background/15" />
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-70">{t("sp.spent")} · {t("sp.txCount", { n: monthTotals.expN })}</span>
            <span className="tnum font-semibold text-red-300 dark:text-red-800 shrink-0">{formatMoney(monthTotals.exp.toNumber())}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-70">{t("sp.earned")} · {t("sp.txCount", { n: monthTotals.incN })}</span>
            <span className="tnum font-semibold text-emerald-300 dark:text-emerald-800 shrink-0">{formatMoney(monthTotals.inc.toNumber())}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Accounts — horizontal scroll inside Card */}
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center justify-between">{t("sp.accounts")} <span className="text-xs font-normal text-muted-foreground">{t("sp.tapFilter")}</span></CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setAccFilter("all")} className={cn("snap-start shrink-0 rounded-lg px-2.5 sm:px-3 py-2 text-left min-w-[88px] sm:min-w-[100px] border transition-all", accFilter==="all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-primary/30")}>
            <div className="text-xs font-medium uppercase tracking-wide">{t("sp.all")}</div>
            <div className="font-bold text-sm tabular mt-0.5">{formatMoney(totalBalance.toNumber())}</div>
            <div className="text-[11px] opacity-70 mt-0.5">{t("sp.txCount", { n: filtered.length })}</div>
          </button>
          {accounts?.map((a) => {
            const Icon = ICONS[a.icon] ?? Wallet;
            const bal = balances.get(a.id) ?? new Decimal(0);
            const active = accFilter===a.id;
            return (
              <button key={a.id} onClick={() => setAccFilter(active ? "all" : a.id)} className={cn("snap-start shrink-0 rounded-lg px-2.5 sm:px-3 py-2 text-left min-w-[88px] sm:min-w-[100px] border transition-all relative group/acct", active ? "bg-card border-primary shadow-sm" : "bg-card border-border hover:shadow-sm")}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={cn("h-5 w-5 rounded flex items-center justify-center text-white shrink-0", GRAD[a.color] ?? GRAD.blue)}><Icon className="h-3 w-3" /></span>
                  <span className="font-medium text-xs truncate">{a.name}</span>
                </div>
                <div className="font-bold text-sm text-primary tabular">{formatMoney(bal.toNumber())}</div>
                <button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete("acc:" + a.id); }} className="flex sm:opacity-0 sm:group-hover/acct:opacity-100 sm:group-focus-within/acct:opacity-100 absolute top-1 right-1 h-5 w-5 rounded bg-destructive/10 text-destructive items-center justify-center after:absolute after:-inset-3 after:content-['']"><Trash2 className="h-3 w-3" /></button>
              </button>
            );
          })}
          <button onClick={() => setShowAcc(true)} className="shrink-0 rounded-lg border border-dashed border-border px-3 py-2 min-w-[80px] flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-accent/50 transition-colors">
            <span className="h-6 w-6 rounded bg-primary/10 text-primary flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></span>
            <span className="text-xs font-medium text-muted-foreground">{t("sp.add")}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    {/* Transactions — inside Card like Requests */}
    <Card>
      <CardHeader className="pb-2 overflow-hidden">
        <CardTitle className="text-sm">{t("sp.transactions")}</CardTitle>
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2">
          <div className="relative flex-shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder={t("sp.search")} value={q} onChange={(e)=>setQ(e.target.value)} className="pl-7 h-11 text-xs w-full sm:max-w-[160px]" />
          </div>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-[170px]"><SheetSelect value={catFilter} onPick={setCatFilter} placeholder={t("sp.allCats")} options={[{ value: "all", label: t("sp.allCats") }, { value: "none", label: t("sp.none") }, ...(cats ?? []).map((c) => ({ value: c.id, label: c.name }))]} /></div>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-[150px]"><SheetSelect value={tagFilter} onPick={setTagFilter} placeholder={t("sp.allTags")} options={[{ value: "all", label: t("sp.allTags") }, ...(tags ?? []).map((t) => ({ value: t.id, label: t.name }))]} /></div>
          <div className="flex items-center rounded-full border bg-card p-0.5">
            <Button variant="ghost" size="sm" className="h-11 w-11 p-0 rounded-full" onClick={() => shift(-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="min-w-[90px] text-center text-[11px] font-semibold capitalize">{monthLabel}</span>
            <Button variant="ghost" size="sm" className="h-11 w-11 p-0 rounded-full" onClick={() => shift(1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
          {ym.y !== now0.getFullYear() || ym.m !== now0.getMonth() ? (
            <Button variant="outline" size="sm" className="h-8 rounded-full text-[11px] px-2.5 gap-1" onClick={() => setYm({ y: now0.getFullYear(), m: now0.getMonth() })}><CalendarClock className="h-3 w-3" />{t("sp.now")}</Button>
          ) : null}
          {(q || catFilter !== "all") && (
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => { setQ(""); setCatFilter("all"); setTagFilter("all"); }}>{t("sp.clear")}</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-1.5">{[0,1,2,3].map(i => <div key={i} className="skeleton h-[52px]" />)}</div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center animate-fade-up">
            <span className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-lg"><Wallet className="h-6 w-6" /></span>
            <div className="font-display text-xl font-semibold">{t("sp.noTxMonth")}</div>
            <div className="text-sm text-muted-foreground">{t("sp.noTxMonthSub")}</div>
            <div className="flex gap-2">
              <Button onClick={() => openAdd("expense")} variant="outline" size="sm"><ArrowDownCircle className="h-4 w-4 mr-1" />{t("sp.expense")}</Button>
              <Button onClick={() => openAdd("income")} size="sm" className="bg-emerald-600 hover:bg-emerald-700"><ArrowUpCircle className="h-4 w-4 mr-1" />{t("sp.income")}</Button>
              <Button onClick={() => openAdd("transfer")} variant="secondary" size="sm"><ArrowLeftRight className="h-4 w-4 mr-1" />{t("sp.transfer")}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([date, items]) => {
              const d = new Date(date);
              const label = isNaN(d.getTime()) ? date : d.toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "short", year: "numeric" });
              const dayTotal = items.reduce((s,e) => {
                const a = Number(e.amount ?? 0);
                return s + (e.direction === "expense" ? -a : e.direction === "income" ? a : 0);
              }, 0);
              return (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-1.5 overflow-hidden">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground tabular">{items.length} • {dayTotal >= 0 ? "+" : ""}{formatMoney(Math.abs(dayTotal))}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((e) => {
                      const cat = catById(e.category_id);
                      const acc = accById(e.account_id);
                      const toAcc = accById(e.transfer_to_account_id);
                      const isTransfer = e.direction === "transfer";
                      const Icon = isTransfer ? ArrowLeftRight : catIcon(cat?.name ?? e.title);
                      const iconGrad = isTransfer ? "bg-sky-800" : e.direction === "income" ? "bg-emerald-800" : cat ? GRAD[cat.color] ?? GRAD.slate : "bg-rose-700";
                      const amtColor = isTransfer ? "text-muted-foreground" : e.direction === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                      return (
                        <SwipeRow key={e.id} actions={[{ label: t("sp.edit"), onClick: () => openEdit(e) }, { label: t("sp.delete"), kind: "destructive", onClick: () => setConfirmDelete(e.id) }]}>
                        <div className="flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-muted/30 active:bg-muted/50 transition-colors group cursor-pointer overflow-hidden" onClick={() => openEdit(e)}>
                          <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm", iconGrad)}><Icon className="h-3.5 w-3.5" /></span>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-[13px] truncate">{e.title}</span>
                              {isTransfer && <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">{t("sp.transfer")}</Badge>}{tagsForNote(e.id).map(tg => <Badge key={tg.id} variant="outline" className="text-[8px] h-3.5 px-1 shrink-0">{tg.name}</Badge>)}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              {isTransfer ? (
                                <span className="truncate">{acc?.name ?? "?"} → {toAcc?.name ?? "?"}</span>
                              ) : (
                                <span className="truncate">{cat?.name ?? ""}{cat && acc?.name ? " · " : ""}{acc?.name ?? ""}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn("font-display tnum text-[15px] font-semibold", amtColor)}>{e.direction === "expense" ? "−" : e.direction === "income" ? "+" : ""}{formatMoney(Number(e.amount ?? 0))}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(e.entry_date).toLocaleDateString(dateLocale(lang), { day:"2-digit", month:"short" })}</div>
                          </div>
                          <div className="hidden sm:flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all"><button onClick={(ev) => { ev.stopPropagation(); saveTemplate(e); }} className="relative h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/20 after:absolute after:-inset-2 after:content-['']"><Bookmark className="h-3.5 w-3.5" /></button><button onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(e.id); }} className="relative h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 after:absolute after:-inset-2 after:content-['']"><Trash2 className="h-3.5 w-3.5" /></button></div>
                        </div>
                        </SwipeRow>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Add/Edit Dialog */}
    {!isNative() && (
    <Dialog open={showAdd} onOpenChange={setShowAdd}>
      <DialogHeader>
        <DialogTitle>{editing ? t("sp.editTx") : t("sp.newTx")}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        <TxTypeTabs value={txType} onPick={(k)=>{setTxType(k); setFormErr(null);}} />
        <TxFields form={form} setForm={setForm} txType={txType} cats={cats} accounts={accounts} balances={balances} tags={tags} selectedTagIds={selectedTagIds} toggleTag={(id)=>setSelectedTagIds((prev)=>prev.includes(id) ? prev.filter((x)=>x!==id) : [...prev, id])} onManageTags={()=>setShowTagMgr(true)} locale={dateLocale(lang)} />
        {formErr && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{formErr}</div>}
      </DialogContent>
      <DialogFooter className="[&>*]:flex-1 sm:[&>*]:flex-none">
        <TxFooter editing={!!editing} txType={txType} saving={saveTx.isPending} onCancel={()=>setShowAdd(false)} onSave={()=>saveTx.mutate()} />
      </DialogFooter>
    </Dialog>
    )}
    {isNative() && showAdd && (
      <NativePortal>
      <div className="fixed inset-0 z-50 bg-background flex flex-col" role="dialog" aria-modal="true" aria-label={editing ? t("sp.editTx") : t("sp.newTx")}>
        <header className="shrink-0 border-b border-border/60 bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-1 px-2 h-16">
            <button type="button" aria-label={t("sp.close")} onClick={()=>setShowAdd(false)} className="m3-press rounded-full p-3"><X className="h-5 w-5" /></button>
            <h1 className="text-[22px] leading-7 truncate px-1">{editing ? t("sp.editTx") : t("sp.newTx")}</h1>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="space-y-4 max-w-2xl mx-auto">
            <TxTypeTabs value={txType} onPick={(k)=>{setTxType(k); setFormErr(null);}} />
            <TxFields form={form} setForm={setForm} txType={txType} cats={cats} accounts={accounts} balances={balances} tags={tags} selectedTagIds={selectedTagIds} toggleTag={(id)=>setSelectedTagIds((prev)=>prev.includes(id) ? prev.filter((x)=>x!==id) : [...prev, id])} onManageTags={()=>setShowTagMgr(true)} locale={dateLocale(lang)} />
            {formErr && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">{formErr}</div>}
          </div>
        </div>
        <div className="shrink-0 border-t border-border/60 bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <TxFooter editing={!!editing} txType={txType} saving={saveTx.isPending} onCancel={()=>setShowAdd(false)} onSave={()=>saveTx.mutate()} />
          </div>
        </div>
      </div>
      </NativePortal>
    )}
    <Dialog open={showMenu} onOpenChange={setShowMenu}>
      <DialogHeader><DialogTitle>{t("sp.actions")}</DialogTitle></DialogHeader>
      <DialogContent className="space-y-1">
        {[
          { icon: Download, label: t("sp.exportCsv"), fn: () => { setShowMenu(false); exportCsv(); } },
          { icon: Bookmark, label: t("sp.templates"), fn: () => { setShowMenu(false); setShowTemplates(true); } },
          { icon: Repeat, label: t("sp.recurring"), fn: () => { setShowMenu(false); setShowRecurring(true); } },
          { icon: Wallet, label: t("sp.newLedger"), fn: () => { setShowMenu(false); setShowAcc(true); } },
        ].map((a) => (
          <button key={a.label} type="button" onClick={a.fn} className="m3-press w-full flex items-center gap-3 px-4 h-14 rounded-2xl hover:bg-accent text-sm font-medium">
            <a.icon className="h-5 w-5 text-primary" />{a.label}
          </button>
        ))}
      </DialogContent>
    </Dialog>

    {/* New Account Dialog */}
    <Dialog open={showAcc} onOpenChange={setShowAcc}>
      <DialogHeader>
        <DialogTitle>{t("sp.newAcc")}</DialogTitle>
        <DialogDescription>{t("sp.newAccDesc")}</DialogDescription>
      </DialogHeader>
      <DialogContent className="space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="space-y-3">
          <div><Label>{t("sp.name")}</Label><Input value={newAcc.name} onChange={(e)=>setNewAcc({...newAcc,name:e.target.value})} placeholder={t("sp.namePh")} className="mt-1.5" /></div>
          <div className="grid grid-cols-2 gap-3">
            <SheetSelect label={t("sp.icon")} value={newAcc.icon} onPick={(v)=>setNewAcc({...newAcc,icon:v})} placeholder={t("sp.iconWallet")} options={[{value:"wallet",label:t("sp.iconWallet")},{value:"bca",label:t("sp.iconBca")},{value:"cash",label:t("sp.iconCash")},{value:"bank",label:t("sp.iconBank")},{value:"investment",label:t("sp.iconInvest")}]} />
            <SheetSelect label={t("sp.color")} value={newAcc.color} onPick={(v)=>setNewAcc({...newAcc,color:v})} placeholder={t("sp.colorBlue")} options={[{value:"blue",label:t("sp.colorBlue")},{value:"violet",label:t("sp.colorViolet")},{value:"emerald",label:t("sp.colorEmerald")},{value:"amber",label:t("sp.colorAmber")},{value:"rose",label:t("sp.colorRose")},{value:"slate",label:t("sp.colorSlate")}]} />
          </div>
          <div><Label>{t("sp.initBal")}</Label><Input value={newAcc.initial_balance} onChange={(e)=>setNewAcc({...newAcc,initial_balance:e.target.value})} inputMode="decimal" placeholder="0" className="mt-1.5" /></div>
        </div>
      </DialogContent>
      <DialogFooter className="[&>*]:flex-1 sm:[&>*]:flex-none">
        <Button variant="outline" onClick={()=>setShowAcc(false)} className="h-12">{t("sp.cancel")}</Button>
        <Button onClick={()=>createAcc.mutate()} disabled={createAcc.isPending} className="h-12 text-base">{t("sp.create")}</Button>
      </DialogFooter>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
      <DialogHeader>
        <DialogTitle>{confirmDelete?.startsWith("acc:") ? t("sp.delAcc") : t("sp.delTx")}</DialogTitle>
        <DialogDescription>{confirmDelete?.startsWith("acc:") ? t("sp.delAccDesc") : t("sp.delTxDesc")}</DialogDescription>
      </DialogHeader>
      <DialogContent>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t("sp.cancel")}</Button>
          <Button variant="destructive" onClick={() => {
            if (!confirmDelete) return;
            if (confirmDelete.startsWith("acc:")) { delAcc.mutate(confirmDelete.slice(4)); }
            else { delTx.mutate(confirmDelete); }
          }} disabled={delTx.isPending || delAcc.isPending}>{(delTx.isPending || delAcc.isPending) ? t("sp.deleting") : t("sp.delete")}</Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Monthly Report */}
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><BarChart3 className="h-4 w-4" />{t("sp.report")}</CardTitle></CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="flex justify-between items-baseline"><span className="text-muted-foreground">{t("sp.totalSpent")}</span><span className="font-display tnum text-lg font-semibold">{formatMoney(monthReport.total)}</span></div>
        <div className="flex justify-between items-baseline"><span className="text-muted-foreground">{t("sp.transactions")}</span><span className="font-display tnum text-lg font-semibold">{monthReport.txCount}</span></div>
        <div className="flex justify-between items-baseline"><span className="text-muted-foreground">{t("sp.dailyAvg")}</span><span className="font-display tnum text-lg font-semibold">{formatMoney(monthReport.avgPerDay)}</span></div>
        {monthReport.topCats.length > 0 && <div className="pt-2 border-t"><div className="text-xs text-muted-foreground mb-1">{t("sp.topCats")}</div>
          {monthReport.topCats.map(([name, amt]) => <div key={name} className="flex justify-between text-xs py-0.5"><span>{name}</span><span className="font-medium tnum">{formatMoney(amt)} ({monthReport.total > 0 ? Math.round(amt/monthReport.total*100) : 0}%)</span></div>)}
        </div>}
      </CardContent>
    </Card>

    {/* Tag Manager Dialog */}
    <Dialog open={showTagMgr} onOpenChange={setShowTagMgr}>
      <DialogHeader><DialogTitle>{t("sp.manageTags")}</DialogTitle></DialogHeader>
      <DialogContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={newTagName} onChange={(e)=>setNewTagName(e.target.value)} placeholder={t("sp.tagName")} className="flex-1" maxLength={30} />
          <div className="w-28 shrink-0"><SheetSelect label={t("sp.color")} value={newTagColor} onPick={setNewTagColor} placeholder={t("sp.color")} options={TAG_COLORS.map(c => ({ value: c, label: c }))} /></div>
          <Button size="sm" onClick={()=>saveTag.mutate()} disabled={saveTag.isPending || !newTagName.trim()}>{t("sp.add")}</Button>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
          {(tags ?? []).length === 0 && <span className="text-xs text-muted-foreground">{t("sp.noTagsYet")}</span>}
          {(tags ?? []).map(t => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs group">
                <span className="h-2 w-2 rounded-full bg-primary" />{t.name}
              <button onClick={()=>delTag.mutate(t.id)} className="relative opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 text-destructive after:absolute after:-inset-3 after:content-['']"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      </DialogContent>
    </Dialog>

    {/* Recurring Transactions Dialog */}
    <Dialog open={showRecurring} onOpenChange={setShowRecurring}>
      <DialogHeader><DialogTitle>{t("sp.recurring")}</DialogTitle><DialogDescription>{t("sp.recurringDesc")}</DialogDescription></DialogHeader>
      <DialogContent className="space-y-3">
        <div className="space-y-2">
          <Input value={recForm.title} onChange={(e)=>setRecForm({...recForm,title:e.target.value})} placeholder={t("sp.recTitlePh")} />
          <Input value={recForm.amount} onChange={(e)=>setRecForm({...recForm,amount:e.target.value})} inputMode="decimal" placeholder={t("sp.recAmountPh")} className="font-semibold tabular" />
          <div className="grid grid-cols-2 gap-2">
            <SheetSelect label={t("sp.type")} value={recForm.direction} onPick={(v)=>setRecForm({...recForm,direction:v as "expense"|"income"})} placeholder={t("sp.expense")} options={[{value:"expense",label:t("sp.expense")},{value:"income",label:t("sp.income")}]} />
            <SheetSelect label={t("sp.every")} value={recForm.frequency} onPick={(v)=>setRecForm({...recForm,frequency:v})} placeholder={t("sp.freqMonthly")} options={FREQUENCIES.map(f => ({ value: f.value, label: freqLabel(f.value) }))} />
          </div>
          <SheetSelect label={t("sp.account")} value={recForm.account_id} onPick={(v)=>setRecForm({...recForm,account_id:v})} placeholder={t("sp.account")} options={(accounts ?? []).map(a => ({ value: a.id, label: a.name }))} />
            <DateField label={t("sp.nextDate")} value={recForm.next_date} onChange={(iso)=>setRecForm({...recForm,next_date:iso})} locale={dateLocale(lang)} />
        </div>
        <Button onClick={()=>saveRecurring.mutate()} disabled={saveRecurring.isPending || !recForm.title.trim() || !recForm.amount} className="w-full h-12 text-base">{t("sp.createRecurring")}</Button>
        {(recurring ?? []).length > 0 && <div className="border-t pt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
          {(recurring ?? []).map(r => (
            <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-muted/30 text-sm">
              <div className="min-w-0"><div className="font-medium truncate">{r.title}</div><div className="text-xs text-muted-foreground">{formatMoney(r.amount)} • {freqLabel(r.frequency)} • {t("sp.nextOn", { date: r.next_date })}</div></div>
              <button onClick={()=>delRecurring.mutate(r.id)} className="shrink-0 text-destructive hover:bg-destructive/10 rounded p-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>}
      </DialogContent>
    </Dialog>

    {/* Templates Dialog */}
    <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
      <DialogHeader><DialogTitle>{t("sp.templates")}</DialogTitle><DialogDescription>{t("sp.templatesDesc")}</DialogDescription></DialogHeader>
      <DialogContent>
        {templates.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">{t("sp.noTemplates")}</div>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {templates.map((tpl, i) => (
              <button key={i} onClick={()=>applyTemplate(tpl)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg border hover:bg-muted/30 transition-colors text-sm text-left">
                <div className="min-w-0"><div className="font-medium truncate">{tpl.title}</div><div className="text-xs text-muted-foreground">{tpl.direction === "income" ? t("sp.income") : t("sp.expense")} • {cats?.find(c=>c.id===tpl.category_id)?.name ?? t("sp.noCategory")}</div></div>
                <span className="font-semibold tabular shrink-0 ml-2">{formatMoney(Number(tpl.amount))}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Tag Picker (in add/edit dialog - appended to form) */}
  </div></PullToRefresh>;
}