# Native APK notes (BudgetApp-APK only — web/Vercel repo untouched)

## Auto-update (sideload)
- CI `release-apk.yml` builds a stable-signed APK per tag `apk-v<N>`
  (`versionCode=N`) and attaches it to a GitHub Release.
- The app (`src/lib/updater.ts`) compares its installed build number with
  the latest release tag on launch (native only) and shows `UpdateBanner`.
- "Download & Install" opens the APK in the system browser; the user taps
  the downloaded file once to install (one-time "allow unknown apps").
- All APKs share one signing key (CI secret `ANDROID_KEYSTORE_*`), so
  updates install over the old version without uninstall.

Create a release: `gh workflow run release-apk --repo pradana93/BudgetApp-APK
-f version_code=3 -f version_name=0.1.3 -f notes="..."`,
or push tag `apk-v3`.

## Push notifications (native only)
- FCM via `@capacitor/push-notifications`. Web never registers.
- Token saved to `push_tokens` (`supabase/migrations/0026_push_tokens.sql`).
  Apply it in Supabase Dashboard → SQL editor (needs no CLI token).
- Sending: `supabase/functions/send-push` (owner-only). Deploy with
  `supabase functions deploy send-push` and set secret
  `FCM_SERVICE_ACCOUNT_JSON` (Firebase Console → Project settings →
  Service accounts → Generate new private key).
- `google-services.json` stays out of git (see `.gitignore`); CI restores it
  from secret `GOOGLE_SERVICES_JSON_B64`. Local copy at repo root for builds.
