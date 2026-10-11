/**
 * CI/local helper: patches the generated Capacitor Android project.
 * Idempotent — safe to run multiple times. Only acts when the related
 * env vars are present, so plain local `npx cap sync` stays untouched.
 *
 * Env:
 *   GOOGLE_SERVICES_JSON_PATH  copy to android/app/google-services.json
 *   APK_VERSION_CODE             e.g. 3
 *   APK_VERSION_NAME             e.g. 0.1.3
 *
 * Stable signing is NOT patched here: CI writes the shared keystore to
 * ~/.android/debug.keystore so stock `assembleDebug` signs every APK
 * identically (sideload updates install cleanly).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ANDROID = path.join(ROOT, "android");
const APP_GRADLE = path.join(ANDROID, "app", "build.gradle");
const ROOT_GRADLE = path.join(ANDROID, "build.gradle");
const MANIFEST = path.join(ANDROID, "app", "src", "main", "AndroidManifest.xml");

function patchFile(file, transform, label) {
  if (!fs.existsSync(file)) {
    console.log(`skip ${label}: ${file} not found`);
    return;
  }
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`patched ${label}`);
  } else {
    console.log(`noop ${label}`);
  }
}

// 1. google-services.json
// 1b. brand icons + splash (committed under assets/, copied every run)
{
  const RES = path.join(ANDROID, "app", "src", "main", "res");
  let n = 0;
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    for (const kind of ["ic_launcher", "ic_launcher_round"]) {
      const src = path.join(ROOT, "assets", "icon", `${kind}_${d}.png`);
      const dest = path.join(RES, `mipmap-${d}`, `${kind}.png`);
      if (fs.existsSync(src) && fs.existsSync(path.dirname(dest))) {
        fs.copyFileSync(src, dest);
        n++;
      }
    }
  }
  const splashSrc = path.join(ROOT, "assets", "splash", "splash.png");
  const splashDest = path.join(RES, "drawable", "splash.png");
  if (fs.existsSync(splashSrc) && fs.existsSync(path.dirname(splashDest))) {
    fs.copyFileSync(splashSrc, splashDest);
    n++;
  }
  // adaptive-icon foreground (anydpi-v26 shadows PNGs on Android 8+)
  // stale Capacitor-default foregrounds must never surface anywhere:
  // overwrite every mipmap foreground with our own mark as well.
  const fg432 = path.join(ROOT, "assets", "icon", "ic_launcher_foreground.png");
  const fgDest = path.join(RES, "drawable", "ic_launcher_foreground.png");
  if (fs.existsSync(fg432) && fs.existsSync(path.dirname(fgDest))) {
    fs.copyFileSync(fg432, fgDest);
    n++;
  }
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const dest = path.join(RES, `mipmap-${d}`, "ic_launcher_foreground.png");
    if (fs.existsSync(fg432) && fs.existsSync(path.dirname(dest))) {
      fs.copyFileSync(fg432, dest);
      n++;
    }
  }
  // launcher background brand blue
  const bgXml = path.join(RES, "values", "ic_launcher_background.xml");
  if (fs.existsSync(bgXml)) {
    fs.writeFileSync(
      bgXml,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14532D</color>\n</resources>\n`
    );
    n++;
  }
  // deterministic adaptive-icon XMLs (API 26+)
  const anydpi = path.join(RES, "mipmap-anydpi-v26");
  const adaptive = (round) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n</adaptive-icon>\n`;
  if (fs.existsSync(anydpi)) {
    fs.writeFileSync(path.join(anydpi, "ic_launcher.xml"), adaptive(false));
    fs.writeFileSync(path.join(anydpi, "ic_launcher_round.xml"), adaptive(true));
    n += 2;
  }
  // app shortcuts artwork
  const scDir = path.join(RES, "drawable");
  for (const sc of ["sc_new", "sc_dash"]) {
    const src = path.join(ROOT, "assets", "shortcuts", `${sc}.png`);
    if (fs.existsSync(src) && fs.existsSync(scDir)) {
      fs.copyFileSync(src, path.join(scDir, `${sc}.png`));
      n++;
    }
  }
  console.log(`brand assets copied (${n} files)`);
}
if (process.env.GOOGLE_SERVICES_JSON_PATH) {
  const src = process.env.GOOGLE_SERVICES_JSON_PATH;
  const dest = path.join(ANDROID, "app", "google-services.json");
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log("copied google-services.json");
  } else {
    console.log(`skip google-services.json: ${src} not found`);
  }
}

// 2. root build.gradle — Google services classpath
patchFile(
  ROOT_GRADLE,
  (s) => {
    if (s.includes("com.google.gms:google-services")) return s;
    return s.replace(
      /(classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"])/,
      `$1\n        classpath 'com.google.gms:google-services:4.4.4'`
    );
  },
  "root google-services classpath"
);

// 3. app/build.gradle — apply plugin
patchFile(
  APP_GRADLE,
  (s) => {
    if (s.includes("com.google.gms.google-services")) return s;
    return s.replace(
      /apply plugin:\s*['"]com\.android\.application['"]/,
      `$&\napply plugin: 'com.google.gms.google-services'`
    );
  },
  "app google-services plugin"
);

// 4. versionCode / versionName
if (process.env.APK_VERSION_CODE) {
  const code = String(parseInt(process.env.APK_VERSION_CODE, 10) || 1);
  patchFile(APP_GRADLE, (s) => s.replace(/versionCode\s+\d+/, `versionCode ${code}`), "versionCode");
}
if (process.env.APK_VERSION_NAME) {
  const name = process.env.APK_VERSION_NAME.replace(/"/g, "");
  patchFile(
    APP_GRADLE,
    (s) => s.replace(/versionName\s+"[^"]*"/, `versionName "${name}"`),
    "versionName"
  );
}

// 6. install-packages + post-notifications permissions
patchFile(
  MANIFEST,
  (s) => {
    let out = s;
    if (!out.includes("REQUEST_INSTALL_PACKAGES")) {
      out = out.replace(
        /<uses-permission([^>]*INTERNET[^>]*)?\/>/,
        `$&\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`
      );
    }
    if (!out.includes("POST_NOTIFICATIONS")) {
      out = out.replace(
        /<uses-permission([^>]*INTERNET[^>]*)?\/>/,
        `$&\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
      );
    }
    return out;
  },
  "native permissions"
);

// 7. keyboard resizes the WebView instead of covering inputs
patchFile(
  MANIFEST,
  (s) => {
    if (s.includes("windowSoftInputMode")) return s;
    return s.replace(
      'android:name=".MainActivity"',
      'android:name=".MainActivity"\n            android:windowSoftInputMode="adjustResize"'
    );
  },
  "adjustResize"
);

// 8. predictive back (Android 14 gesture preview)
patchFile(
  MANIFEST,
  (s) => {
    if (s.includes("enableOnBackInvokedCallback")) return s;
    return s.replace("<application", '<application\n        android:enableOnBackInvokedCallback="true"');
  },
  "predictive back"
);

// 9. app shortcuts (long-press launcher): Dashboard + New request + Scan
{
  const RES = path.join(ANDROID, "app", "src", "main", "res");
  const xmlDir = path.join(RES, "xml");
  const shortcuts = `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n    <shortcut android:shortcutId="dashboard" android:enabled="true" android:icon="@drawable/sc_dash" android:shortcutShortLabel="@string/app_name">\n        <intent android:action="android.intent.action.VIEW" android:targetPackage="com.pradana93.budgetapp" android:targetClass="com.pradana93.budgetapp.MainActivity" android:data="budgetapp://dashboard" />\n    </shortcut>\n    <shortcut android:shortcutId="new-request" android:enabled="true" android:icon="@drawable/sc_new" android:shortcutShortLabel="@string/shortcut_new">\n        <intent android:action="android.intent.action.VIEW" android:targetPackage="com.pradana93.budgetapp" android:targetClass="com.pradana93.budgetapp.MainActivity" android:data="budgetapp://new-request" />\n    </shortcut>\n    <shortcut android:shortcutId="scan-receipt" android:enabled="true" android:icon="@drawable/sc_scan" android:shortcutShortLabel="@string/shortcut_scan">\n        <intent android:action="android.intent.action.VIEW" android:targetPackage="com.pradana93.budgetapp" android:targetClass="com.pradana93.budgetapp.MainActivity" android:data="budgetapp://new-request" />\n    </shortcut>\n</shortcuts>\n`;
  if (fs.existsSync(xmlDir)) {
    fs.writeFileSync(path.join(xmlDir, "shortcuts.xml"), shortcuts);
    console.log("shortcuts.xml written");
  }
  for (const sc of ["sc_dash", "sc_new", "sc_scan"]) {
    const src = path.join(ROOT, "assets", "shortcuts", `${sc}.png`);
    const dest = path.join(RES, "drawable", `${sc}.png`);
    if (fs.existsSync(src) && fs.existsSync(path.dirname(dest))) fs.copyFileSync(src, dest);
  }
  // notif silhouettes live in the library module (its R class references them)
  const modRes = path.join(ROOT, "plugins", "native-extras", "android", "src", "main", "res");
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const src = path.join(ROOT, "assets", "notif", `ic_stat_notify_${d}.png`);
    // library module needs its own copy for R.drawable access
    const modDir = path.join(modRes, `drawable-${d}`);
    if (fs.existsSync(src)) {
      fs.mkdirSync(modDir, { recursive: true });
      fs.copyFileSync(src, path.join(modDir, "ic_stat_notify.png"));
    }
  }
  const monoSrc = path.join(ROOT, "assets", "icon", "ic_launcher_monochrome.png");
  if (fs.existsSync(monoSrc)) {
    fs.copyFileSync(monoSrc, path.join(RES, "drawable", "ic_launcher_monochrome.png"));
  }
  const anydpi = path.join(RES, "mipmap-anydpi-v26");
  const adaptiveMono = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n</adaptive-icon>\n`;
  if (fs.existsSync(anydpi)) {
    fs.writeFileSync(path.join(anydpi, "ic_launcher.xml"), adaptiveMono);
    fs.writeFileSync(path.join(anydpi, "ic_launcher_round.xml"), adaptiveMono);
  }
  // strings for shortcuts + widget
  const stringsXml = path.join(RES, "values", "strings.xml");
  patchFile(
    stringsXml,
    (s) => {
      let out = s;
      const add = (name, value) => {
        if (!out.includes(`name="${name}"`)) {
          out = out.replace("</resources>", `    <string name="${name}">${value}</string>\n</resources>`);
        }
      };
      add("shortcut_new", "New request");
      add("shortcut_scan", "Scan receipt");
      add("widget_desc", "BudgetApp available balance and pending requests");
      return out;
    },
    "strings additions"
  );
  patchFile(
    MANIFEST,
    (s) => {
      if (s.includes("android.app.shortcuts")) return s;
      return s.replace(
        "</activity>",
        '            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />\n        </activity>'
      );
    },
    "shortcuts meta-data"
  );
}

// 10. navigation bar matches light theme (dark icons on white)
{
  const styles = path.join(ANDROID, "app", "src", "main", "res", "values", "styles.xml");
  patchFile(
    styles,
    (s) => {
      let out = s;
      if (!out.includes("navigationBarColor")) {
        out = out.replace(
          /(<style name="AppTheme"[^>]*>)/,
          `$1\n        <item name="android:navigationBarColor">@android:color/white</item>\n        <item name="android:windowLightNavigationBar">true</item>`
        );
      }
      return out;
    },
    "navigation bar theme"
  );
}

// 11. bundled native module (approval service + widget + plugin bridge)
// NOTE: module sources stay under plugins/native-extras (library module).
// Nothing is copied into :app — classes and resources merge automatically.
// (Copying them would duplicate classes and break compilation.)
{

  // settings.gradle include
  const settingsGradle = path.join(ANDROID, "settings.gradle");
  patchFile(
    settingsGradle,
    (s) => {
      if (s.includes("native-extras")) return s;
      return `${s.trimEnd()}\ninclude ':native-extras'\nproject(':native-extras').projectDir = new File(settingsDir, '../plugins/native-extras/android')\n`;
    },
    "settings.gradle include"
  );
  // app dependency — needs a build.gradle inside the module dir
  const modDir = path.join(ROOT, "plugins", "native-extras", "android");
  if (!fs.existsSync(path.join(modDir, "build.gradle"))) {
    fs.writeFileSync(
      path.join(modDir, "build.gradle"),
      `apply plugin: 'com.android.library'\n\nandroid {\n    namespace "com.pradana93.nativeextras"\n    compileSdk 34\n    defaultConfig {\n        minSdkVersion 22\n    }\n}\n\ndependencies {\n    implementation project(':capacitor-android')\n    implementation 'com.google.firebase:firebase-messaging:23.3.1'\n}\n`
    );
  }
  patchFile(
    APP_GRADLE,
    (s) => {
      if (s.includes("project(':native-extras')")) return s;
      return s.replace(/dependencies\s*\{/, `dependencies {\n    implementation project(':native-extras')`);
    },
    "app native-extras dep"
  );
  // MainActivity plugin registration (Capacitor 6 template has an empty activity class)
  const mainActivity = path.join(ANDROID, "app", "src", "main", "java", "com", "pradana93", "budgetapp", "MainActivity.java");
  patchFile(
    mainActivity,
    (s) => {
      if (s.includes("NativeExtrasPlugin")) return s;
      if (/public class MainActivity extends BridgeActivity \{\s*\}/.test(s)) {
        return s
          .replace(
            "import com.getcapacitor.BridgeActivity;",
            "import com.getcapacitor.BridgeActivity;\nimport android.os.Bundle;\nimport com.pradana93.nativeextras.NativeExtrasPlugin;"
          )
          .replace(
            "public class MainActivity extends BridgeActivity {}",
            "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        registerPlugin(NativeExtrasPlugin.class);\n    }\n}"
          );
      }
      console.log("WARN: MainActivity template changed — register NativeExtrasPlugin manually");
      return s;
    },
    "MainActivity registerPlugin"
  );
  // manifest: deep-link scheme + approval service + widget receiver
  patchFile(
    MANIFEST,
    (s) => {
      let out = s;
      if (!out.includes("android:scheme=\"budgetapp\"")) {
        out = out.replace(
          "</activity>",
          '            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="budgetapp" />\n            </intent-filter>\n        </activity>'
        );
      }
      if (!out.includes("ApprovalMessagingService")) {
        out = out.replace(
          "</application>",
          '        <service android:name="com.pradana93.nativeextras.ApprovalMessagingService" android:exported="false">\n            <intent-filter>\n                <action android:name="com.google.firebase.MESSAGING_EVENT" />\n            </intent-filter>\n        </service>\n        <receiver android:name="com.pradana93.nativeextras.BudgetWidgetProvider" android:exported="false">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data android:name="android.appwidget.provider" android:resource="@xml/budget_widget_info" />\n        </receiver>\n    </application>'
        );
      }
      return out;
    },
    "manifest native wiring"
  );
}

console.log("android patch complete");
