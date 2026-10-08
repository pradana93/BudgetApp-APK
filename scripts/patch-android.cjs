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

console.log("android patch complete");
