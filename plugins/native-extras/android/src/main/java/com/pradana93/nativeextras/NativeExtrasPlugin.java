package com.pradana93.nativeextras;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeExtras")
public class NativeExtrasPlugin extends Plugin {
    public static final String PREFS = "BudgetAppWidget";

    @PluginMethod
    public void pushWidgetSnapshot(PluginCall call) {
        String json = call.getString("json", "{}");
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString("snapshot", json).apply();
        BudgetWidgetProvider.pushUpdate(ctx);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /**
     * On-device receipt OCR (ML Kit, Latin script). Reads an image from a
     * file URI and returns its text. Private: nothing leaves the phone.
     */
    @PluginMethod
    public void recognizeText(PluginCall call) {
        String path = call.getString("path", "");
        if (path == null || path.isEmpty()) {
            call.reject("missing path");
            return;
        }
        new Thread(() -> {
            try {
                Context ctx = getContext();
                android.net.Uri uri = android.net.Uri.parse(path);
                com.google.mlkit.vision.common.InputImage image =
                        com.google.mlkit.vision.common.InputImage.fromFilePath(ctx, uri);
                com.google.mlkit.vision.text.TextRecognizer recognizer =
                        com.google.mlkit.vision.text.TextRecognition.getClient(
                                com.google.mlkit.vision.text.latin.TextRecognizerOptions.DEFAULT_OPTIONS);
                recognizer.process(image)
                        .addOnSuccessListener(visionText -> {
                            JSObject ret = new JSObject();
                            ret.put("text", visionText.getText());
                            org.json.JSONArray lines = new org.json.JSONArray();
                            for (com.google.mlkit.vision.text.Text.TextBlock b : visionText.getTextBlocks()) {
                                for (com.google.mlkit.vision.text.Text.Line l : b.getLines()) {
                                    lines.put(l.getText());
                                }
                            }
                            ret.put("lines", lines);
                            call.resolve(ret);
                        })
                        .addOnFailureListener(e -> call.reject(
                                e.getMessage() != null ? e.getMessage() : "recognition failed"));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "recognition failed");
            }
        }).start();
    }

    /**
     * Whether the OS currently allows this app to install packages
     * (Android 8+ unknown-sources consent). Always true below API 26.
     */
    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        boolean ok = true;
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                ok = getContext().getPackageManager().canRequestPackageInstalls();
            }
        } catch (Exception ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("value", ok);
        call.resolve(ret);
    }

    /** Opens this app's "install unknown apps" system screen. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "cannot open settings");
        }
    }

    /**
     * One-tap update: downloads the APK to the app cache, verifies its
     * size, then fires the package installer. The OS still shows its own
     * Install confirmation (unskippable for sideloads) — but there is no
     * browser detour and no file hunting.
     */
    @PluginMethod
    public void updateApk(PluginCall call) {
        String url = call.getString("url", "");
        String filename = call.getString("filename", "budget-app-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("missing url");
            return;
        }
        new Thread(() -> {
            java.io.File out = null;
            try {
                java.net.URL u = new java.net.URL(url);
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "BudgetApp-Updater");
                c.setConnectTimeout(20000);
                c.setReadTimeout(120000);
                c.connect();
                if (c.getResponseCode() / 100 != 2) {
                    throw new java.io.IOException("http " + c.getResponseCode());
                }
                Context ctx = getContext();
                out = new java.io.File(ctx.getCacheDir(), filename);
                if (out.exists() && !out.delete()) {
                    throw new java.io.IOException("cannot clear stale download");
                }
                long expected = c.getContentLengthLong();
                long written = 0;
                try (java.io.InputStream in = c.getInputStream();
                     java.io.FileOutputStream f = new java.io.FileOutputStream(out)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        f.write(buf, 0, n);
                        written += n;
                    }
                }
                if (expected > 0 && written != expected) {
                    throw new java.io.IOException("incomplete download");
                }
                Uri uri = androidx.core.content.FileProvider.getUriForFile(
                        ctx, ctx.getPackageName() + ".fileprovider", out);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (i.resolveActivity(ctx.getPackageManager()) == null) {
                    throw new java.io.IOException("no installer found");
                }
                ctx.startActivity(i);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Exception e) {
                if (out != null && out.exists()) {
                    // Never leave a corrupt partial file behind.
                    // noinspection ResultOfMethodCallIgnored
                    out.delete();
                }
                call.reject(e.getMessage() != null ? e.getMessage() : "download failed");
            }
        }).start();
    }
}
