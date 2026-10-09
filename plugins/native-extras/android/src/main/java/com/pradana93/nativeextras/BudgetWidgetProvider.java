package com.pradana93.nativeextras;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Home widget: available balance + pending count from the last app sync. */
public class BudgetWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        pushUpdate(ctx);
    }

    public static void pushUpdate(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            if (mgr == null) return;
            ComponentName me = new ComponentName(ctx, BudgetWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(me);
            if (ids == null || ids.length == 0) return;
            SharedPreferences prefs = ctx.getSharedPreferences(NativeExtrasPlugin.PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString("snapshot", "{}");
            String available = "—";
            String pending = "—";
            try {
                JSONObject o = new JSONObject(raw);
                if (o.has("available")) available = o.optString("available", "—");
                if (o.has("pending")) pending = String.valueOf(o.optInt("pending", 0));
            } catch (Exception ignored) {
            }
            for (int id : ids) {
                RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_budget);
                v.setTextViewText(R.id.widget_available, available);
                v.setTextViewText(R.id.widget_pending, pending);
                v.setOnClickPendingIntent(R.id.widget_root, deep(ctx, "budgetapp://dashboard", id * 10 + 1));
                v.setOnClickPendingIntent(R.id.widget_add, deep(ctx, "budgetapp://new-request", id * 10 + 2));
                mgr.updateAppWidget(id, v);
            }
        } catch (Exception ignored) {
        }
    }

    private static PendingIntent deep(Context ctx, String uri, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
