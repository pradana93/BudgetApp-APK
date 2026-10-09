import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { useLang } from "@/i18n/LanguageContext";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/components/ui/toast";
import { approvalRisk } from "@/lib/advisor";
import { notifyRequesterBoth, merchantOf } from "@/lib/notify";
import { PullToRefresh } from "@/components/PullToRefresh";

type Row = {
  id: string;
  budget_id: string;
  requester_id: string;
  merchant: string | null;
  category: string;
  amount: number;
  status: string;
  created_at: string;
  due_date: string | null;
  receipt_url: string | null;
  description: string | null;
};

/**
 * Owner triage: every pending request as a thumb-sized decision card.
 * Same RPCs and notifications as Admin, zero desktop chrome.
 */
export default function Triage() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { profile } = useSession();
  const myId = profile?.id ?? "";
  const [reasons, setReasons] = React.useState<Record<string, string>>({});

  const { data: requests } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: budgets } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("id,name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const budgetName = (id: string) => budgets?.find((b) => b.id === id)?.name ?? "";

  const ping = (r: Row, kind: "approved" | "rejected") => {
    if (r.requester_id === myId) return;
    const title = kind === "approved" ? t("nt.approvedT") : t("nt.rejectedT");
    const body =
      kind === "approved"
        ? t("nt.approvedB", { merchant: merchantOf(r), amount: formatMoney(Number(r.amount)) })
        : t("nt.rejectedB", { merchant: merchantOf(r), amount: formatMoney(Number(r.amount)) });
    void notifyRequesterBoth(r.requester_id, {
      type: kind === "approved" ? "request_approved" : "request_rejected",
      title,
      body,
      link: `/requests/${r.id}`,
      request_id: r.id,
    });
  };

  const approve = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await supabase.rpc("approve_request", { p_request_id: r.id });
      if (error) throw error;
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: t("admin.approvedMsg") });
      ping(r, "approved");
    },
    onError: (e: Error) => toast({ title: t("admin.failApprove"), description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: async (r: Row) => {
      const reason = (reasons[r.id] ?? "").trim();
      if (reason.length < 3) throw new Error(t("admin.reasonPh"));
      const { error } = await supabase.rpc("reject_request", { p_request_id: r.id, p_reason: reason });
      if (error) throw error;
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      setReasons((m) => ({ ...m, [r.id]: "" }));
      toast({ title: t("admin.rejectedMsg") });
      ping(r, "rejected");
    },
    onError: (e: Error) => toast({ title: t("admin.failReject"), description: e.message, variant: "destructive" }),
  });

  const refresh = React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["requests"] });
  }, [qc]);

  const levelVariant = (level: string) =>
    level === "risky" ? ("destructive" as const) : level === "review" ? ("pending" as const) : ("approved" as const);

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("admin.queue")}</h1>
          {(requests?.length ?? 0) > 0 && (
            <span className="text-sm text-muted-foreground tnum">
              {t("admin.waiting", { n: requests?.length ?? 0 })}
            </span>
          )}
        </div>
        {(requests?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="font-display text-xl font-semibold">{t("admin.clear")}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t("dash.noBurn")}</p>
            </CardContent>
          </Card>
        ) : (
          requests!.map((r) => {
            const risk = approvalRisk(
              { merchant: r.merchant, amount: r.amount, category: r.category, status: r.status, created_at: r.created_at, receipt_url: r.receipt_url },
              null,
              [],
              lang
            );
            return (
              <Card key={r.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/requests/${r.id}`} className="font-semibold leading-tight">
                        {merchantOf(r)}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {budgetName(r.budget_id)} • {formatDate(r.created_at, lang)}
                      </div>
                    </div>
                    <div className="font-display tnum text-xl font-semibold whitespace-nowrap">
                      {formatMoney(Number(r.amount))}
                    </div>
                  </div>
                  {r.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{r.description}</p>
                  )}
                  <div className="mt-2">
                    <Badge variant={levelVariant(risk.level)}>{risk.level}</Badge>
                  </div>
                  <Input
                    placeholder={t("admin.reasonPh")}
                    value={reasons[r.id] ?? ""}
                    onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
                    className="mt-3"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => approve.mutate(r)}
                      disabled={approve.isPending}
                      className="h-12 text-base"
                    >
                      {t("admin.approve")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => reject.mutate(r)}
                      disabled={reject.isPending || (reasons[r.id] ?? "").trim().length < 3}
                      className="h-12 text-base"
                    >
                      {t("admin.reject")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </PullToRefresh>
  );
}
