import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLang } from "@/i18n/LanguageContext";

export function QueryError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  return (
    <Card role="alert"><CardContent className="py-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">{t("common.loadFailed")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>{t("common.retry")}</Button>
    </CardContent></Card>
  );
}
