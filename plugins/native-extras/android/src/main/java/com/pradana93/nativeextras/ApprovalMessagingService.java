package com.pradana93.nativeextras;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Renders approval requests with Approve / Review actions.
 * Only handles data-only messages tagged kind=approval; every other
 * message keeps the default delivery path (no double notifications).
 */
public class ApprovalMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL = "budgetapp-approvals";

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if (!"approval".equals(d.get("kind"))) return;
        if (isForeground()) return;
        String requestId = d.get("request_id");
        if (requestId == null || requestId.isEmpty()) return;
        String title = d.get("title");
        if (title == null) title = "BudgetApp";
        String body = d.get("body");
        if (body == null) body = "A request needs review.";

        Context ctx = getApplicationContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Approvals", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(ch);
        }

        int code = requestId.hashCode();
        PendingIntent approve = deepLink(ctx, "budgetapp://approve/" + requestId, code * 31 + 1);
        PendingIntent review = deepLink(ctx, "budgetapp://request/" + requestId, code * 31 + 2);
        PendingIntent open = deepLink(ctx, "budgetapp://request/" + requestId, code * 31 + 3);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(open)
                .addAction(0, "Approve", approve)
                .addAction(0, "Review", review);
        nm.notify(code, b.build());
    }

    private PendingIntent deepLink(Context ctx, String uri, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private boolean isForeground() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null || am.getRunningAppProcesses() == null) return false;
            for (ActivityManager.RunningAppProcessInfo p : am.getRunningAppProcesses()) {
                if (p.processName != null && p.processName.equals(getPackageName())) {
                    return p.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    @Override
    public void onNewToken(String token) {
        // Token storage stays with the Capacitor push plugin.
    }
}
