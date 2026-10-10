import { chromium } from "playwright";
import { mkdirSync } from "fs";
const SHOT = "C:\\Users\\PC Jesta\\AppData\\Local\\Temp\\opencode\\shots";
mkdirSync(SHOT, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on("response", (r) => {
  if (r.status() >= 400) console.log("HTTP", r.status(), r.url().slice(-90));
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:5173/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.screenshot({ path: SHOT + "/probe-login.png" });
console.log("ERRORS:", JSON.stringify(errors.slice(0, 5)));
await browser.close();
