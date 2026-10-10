import { chromium } from "playwright";
import { readFileSync } from "fs";

const pw = readFileSync("C:\\Users\\PC Jesta\\AppData\\Local\\Temp\\opencode\\shotpw.txt", "utf8");
const SHOT = "C:\\Users\\PC Jesta\\AppData\\Local\\Temp\\opencode\\shots";
const { mkdirSync } = await import("fs");
mkdirSync(SHOT, { recursive: true });

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log("default launch failed, trying bundled chromium-1243");
  browser = await chromium.launch({
    executablePath:
      "C:\\Users\\PC Jesta\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win\\chrome.exe",
  });
}
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("budgetapp-tour-1c7ba854-748b-4009-b347-ea1c4a9f645d", "1");
    localStorage.setItem("budgetapp-changelog-seen", "9.99");
  } catch {}
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m].bind(history);
    history[m] = (...a) => {
      console.log("HISTORY-" + m + ":", JSON.stringify(a[2] ?? a[0] ?? null));
      return orig(...a);
    };
  }
  window.addEventListener("popstate", () => console.log("POPSTATE:", location.pathname));
});
const page = await ctx.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("HISTORY") || t.startsWith("POPSTATE") || m.type() === "error") {
    console.log("PAGE:", t.slice(0, 300));
  }
});
await page.goto("http://127.0.0.1:5173/login", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: SHOT + "/debug-login.png" });
console.log("url:", page.url());
await page.locator("#email").fill("visual.qa@budgetapp.local");
await page.locator("#password").fill(pw);
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(4000);
await page.screenshot({ path: SHOT + "/debug-after-login.png" });
console.log("url after login:", page.url());
await page.waitForURL("**/", { timeout: 20000 });
for (const p of ["/space"]) {
  const resp = await page.goto("http://127.0.0.1:5173" + p, { waitUntil: "commit" });
  console.log(p, "status:", resp && resp.status(), "url-at-commit:", page.url());
  await page.waitForTimeout(2500);
  console.log(p, "url-after-js:", page.url());
}
// dismiss first-run tour if present (backup)
const skip = page.getByRole("button", { name: /^skip$/i });
if ((await skip.count()) > 0) {
  await skip.first().click();
  await page.waitForTimeout(800);
  console.log("tour dismissed");
}
await page.screenshot({ path: SHOT + "/space-top.png" });
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(600);
await page.screenshot({ path: SHOT + "/space-mid.png" });
// open the add dialog via the visible mobile + icon button
const plusBtn = page.locator('h1:has-text("Personal Ledger") + div button.h-8.w-8').last();
console.log("plus visible:", await plusBtn.isVisible());
if (await plusBtn.isVisible()) {
  await plusBtn.click({ force: true });
  await page.waitForTimeout(800);
  const has = await page.evaluate(() => document.body.innerHTML.includes("New Transaction"));
  console.log("dialog in DOM:", has);
  await page.screenshot({ path: SHOT + "/space-add.png" });
} else {
  console.log("NO Transaction button found");
}
await browser.close();
console.log("done");
