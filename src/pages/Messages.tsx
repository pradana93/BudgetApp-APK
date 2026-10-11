import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/i18n/LanguageContext";
import { useSession } from "@/hooks/useSession";
import { useRealtime } from "@/hooks/useRealtime";
import { PullToRefresh } from "@/components/PullToRefresh";
import { timeAgo } from "@/lib/datetime";
import { MessageCircle } from "lucide-react";

type RequestRow = {
  id: string;
  merchant: string | null;
  category: string;
  status: string;
  requester_id: string;
  created_at: string;
};
type CommentRow = {
  request_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

/**
 * Messages inbox: every discussion thread across requests, newest first,
 * unread highlighted. The thread itself lives on RequestDetail; opening
 * a thread marks it read.
 */
export default function Messages() {
  useRealtime();
  const { t, lang } = useLang();
  const { profile } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = profile?.id ?? "";

  const { data: requests, isLoading } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("id,merchant,category,status,requester_id,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
    enabled: !!profile,
  });

  const { data: comments } = useQuery({
    queryKey: ["all-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_comments")
        .select("request_id,author_id,body,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
    enabled: !!profile,
  });

  const { data: reads } = useQuery({
    queryKey: ["comment-reads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("comment_reads").select("request_id,last_read_at");
      if (error) throw error;
      return (data ?? []) as Array<{ request_id: string; last_read_at: string }>;
    },
    enabled: !!profile,
  });

  const { data: profiles } = useQuery({
    queryKey: ["msg-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,display_name,email");
      if (error) return [];
      return (data ?? []) as Array<{ id: string; display_name: string | null; email: string }>;
    },
    enabled: !!profile,
  });

  const nameOf = (id: string) => {
    if (id === me) return t("msg.you");
    const p = profiles?.find((x) => x.id === id);
    return p?.display_name || String(p?.email || "").split("@")[0] || t("msg.them");
  };

  const threads = React.useMemo(() => {
    const latest = new Map<string, CommentRow>();
    for (const c of comments ?? []) {
      if (!latest.has(c.request_id)) latest.set(c.request_id, c);
    }
    const readAt = new Map((reads ?? []).map((r) => [r.request_id, r.last_read_at]));
    return (requests ?? [])
      .filter((r) => latest.has(r.id))
      .map((r) => {
        const last = latest.get(r.id)!;
        const seen = readAt.get(r.id);
        const unread = last.author_id !== me && (!seen || last.created_at > seen);
        return { req: r, last, unread };
      })
      .sort((a, b) => {
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        return b.last.created_at.localeCompare(a.last.created_at);
      });
  }, [requests, comments, reads, me]);

  const refresh = React.useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["requests"] }),
      qc.invalidateQueries({ queryKey: ["all-comments"] }),
      qc.invalidateQueries({ queryKey: ["comment-reads"] }),
    ]);
  }, [qc]);

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-4 max-w-2xl">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("msg.title")}</h1>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[76px]" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <div className="font-display mt-3 text-xl font-semibold">{t("msg.empty")}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t("msg.emptySub")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {threads.map(({ req, last, unread }) => (
              <button
                key={req.id}
                type="button"
                onClick={() => nav(`/requests/${req.id}`)}
                className="m3-press flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-sm"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-muted-foreground/25"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>
                      {req.merchant ?? req.category}
                    </span>
                    <Badge variant={req.status === "pending" ? "pending" : req.status === "approved" ? "approved" : req.status === "rejected" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
                      {req.status}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {nameOf(last.author_id)}: {last.body}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(last.created_at, lang)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
