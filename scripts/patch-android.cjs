/**
 * CI/local helper: patches the generated Capacitor Android project.
 * Idempotent — safe to run multiple times. Only acts when the related
 * env vars are present, so plain local `npx cap sync` stays untouched.
 *
 * Env:
 *   GOOGLE_SERVICES_JSON_PATH  copy to android/app/google-services.json
 *   APK_VERSION_CODE             e.g. 3
 *   APK_VERSION_NAME             e.g. 0.1.3
 *   APK_KEYSTORE_PATH            stable keystore so every APK shares a signature
 *   ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD
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

// 5. stable debug signing (every APK shares one signature → sideload updates install cleanly)
if (process.env.APK_KEYSTORE_PATH) {
  patchFile(
    APP_GRADLE,
    (s) => {
      if (s.includes("APK_KEYSTORE_PATH")) return s;
      const block = [
        "    signingConfigs {",
        "        debug {",
        '            storeFile file(System.getenv("APK_KEYSTORE_PATH") ?: "debug.keystore")',
        '            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")',
        '            keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "budgetapp"',
        '            keyPassword System.getenv("ANDROID_KEY_PASSWORD")',
        "        }",
        "    }",
        "",
      ].join("\n");
      return s.replace(/(\s*buildTypes\s*\{)/, `${block}$1`);
    },
    "stable debug signing"
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

console.log("android patch complete");
