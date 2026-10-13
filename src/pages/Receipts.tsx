import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/i18n/LanguageContext";
import { formatMoney } from "@/lib/money";
import { QueryError } from "@/components/QueryError";
import { Receipt } from "lucide-react";

type Row = {
  id: string;
  merchant: string | null;
  amount: number | string;
  created_at: string;
  receipt_url: string;
};

type Signed = Row & { signed: string | null; image: boolean };

const isImage = (url: string) => /\.(png|jpe?g|webp|gif)$/i.test(url.split("?")[0]);

export default function Receipts() {
  const { t } = useLang();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("id,merchant,amount,created_at,receipt_url")
        .not("receipt_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const out: Signed[] = [];
      for (const r of rows) {
        let signed: string | null = null;
        try {
          const { data: s } = await supabase.storage.from("receipts").createSignedUrl(r.receipt_url, 3600);
          signed = s?.signedUrl ?? null;
        } catch {
          signed = null;
        }
        out.push({ ...r, signed, image: isImage(r.receipt_url) });
      }
      return out;
    },
  });

  if (isError) return <div className="space-y-4"><QueryError onRetry={() => void refetch()} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("nav.receipts")}</h1>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton aspect-square" />)}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center animate-fade-up">
          <span className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-lg"><Receipt className="h-6 w-6" /></span>
          <div className="text-sm text-muted-foreground">{t("rec.empty")}</div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {data?.map((r) => (
            <Link key={r.id} to={`/requests/${r.id}`} className="min-w-0 rounded-xl border bg-card overflow-hidden hover:border-primary/40 transition-colors">
              {r.signed && r.image ? (
                <img src={r.signed} alt={r.merchant ?? ""} loading="lazy" className="aspect-square w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <span className="flex aspect-square w-full items-center justify-center bg-muted"><Receipt className="h-6 w-6 text-muted-foreground" /></span>
              )}
              <span className="block px-2 py-1.5">
                <span className="block truncate text-xs font-medium">{r.merchant ?? "—"}</span>
                <span className="block text-xs text-muted-foreground tabular">{formatMoney(Number(r.amount))}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
