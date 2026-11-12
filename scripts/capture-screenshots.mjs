#!/usr/bin/env node
// Capture README screenshots against a locally served DEMO build whose data
// is fully synthetic (see scripts/generate-demo-data.mjs). No real data is used.
//
// Prerequisites:
//   npm run demo:data               (generate data-demo/raw + data-demo/out)
//   npm run build && cp -r dist dist-demo && cp -r data-demo/out dist-demo/data
//   python -m http.server 4174 --bind 127.0.0.1 --directory dist-demo
//   npm run demo:shots
//
// Browser: system Microsoft Edge / Google Chrome. Override with BROWSER_PATH.

import { mkdirSync, existsSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:4174/";
const VIEW = "?lat=23.129&lng=113.264&zoom=12";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Chromium-based browser found. Set BROWSER_PATH to msedge.exe / chrome.exe.");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.warn("[page error]", e.message));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`saved ${OUT}/${name}.png`);
};

const tab = async (i) => page.locator(".tabs button").nth(i).click();
const chip = async (label) => {
  const el = page.locator(".chip").filter({ hasText: label }).first();
  if (await el.count()) await el.click();
};

try {
  // 1) Map: UPC + a few event layers enabled
  await page.goto(`${BASE}${VIEW}`, { waitUntil: "domcontentloaded" });
  await page.locator(".map-stats").waitFor({ timeout: 30000 });
  const boxes = page.locator(".map-ctrl input[type=checkbox]");
  await boxes.nth(0).check(); // UPC
  await boxes.nth(2).check(); // 事件分布
  await page.locator(".chip").first().waitFor({ timeout: 30000 });
  for (const label of ["攻击", "占领", "hack", "插脚", "登录"]) await chip(label);
  await page.waitForTimeout(3500);
  await shot("map");

  // 2) Heatmap
  await tab(1);
  await page.locator(".colorbar").waitFor({ timeout: 20000 });
  await page.waitForTimeout(6000); // heatmap layers attach a few seconds after tab switch
  await page.locator(".onb-status, .map-ctrl").first().waitFor({ timeout: 1000 }).catch(() => {});
  await shot("heatmap");

  // 3) Dashboard (top) + badges section
  await tab(2);
  await page.locator(".chart-card").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot("dashboard");
  const badgeGrid = page.locator(".badge-grid");
  if (await badgeGrid.count()) {
    await badgeGrid.scrollIntoViewIfNeeded();
    // Badge icons are lazy-loaded from ingress.plus — wait until every <img>
    // has actually decoded, otherwise the screenshot shows empty cards.
    await page
      .waitForFunction(
        () => [...document.querySelectorAll(".badge-item img")].every((img) => img.complete && img.naturalWidth > 0),
        { timeout: 30000 },
      )
      .catch(() => console.warn("badge icons did not all load in time"));
    await page.waitForTimeout(500);
    await shot("dashboard-badges");
  }

  // 4) Playback placeholder
  await tab(3);
  await page.locator(".playback-placeholder").waitFor({ timeout: 20000 });
  await shot("playback");

  // 5) Onboarding (forced via ?setup=1)
  await page.goto(`${BASE}?setup=1`, { waitUntil: "domcontentloaded" });
  await page.locator(".onboarding").waitFor({ timeout: 20000 });
  await shot("onboarding");
} finally {
  await browser.close();
}
