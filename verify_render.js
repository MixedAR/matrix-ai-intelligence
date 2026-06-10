const { chromium, devices } = require("playwright");
const fs = require("fs");

const VERIFY_URL = process.env.MATRIX_VERIFY_URL || "http://127.0.0.1:8000/";

async function count(page, selector) {
  return page.locator(selector).count();
}

async function verifyViewport(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(VERIFY_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ops-shell", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("#priorityGrid .intel-card").length >= 1, null, { timeout: 70000 });
  await page.waitForFunction(() => document.querySelectorAll("#newsGrid .queue-feature-card, #newsGrid .queue-card").length >= 1, null, { timeout: 70000 });
  await page.waitForFunction(() => document.querySelectorAll("#videoRail .video-card").length >= 1, null, { timeout: 70000 });
  await page.waitForTimeout(1000);

  const title = await page.locator("h1").innerText();
  const priorityCards = await count(page, "#priorityGrid .intel-card");
  const videoCards = await count(page, "#videoRail .video-card");
  const queueFeature = await count(page, "#newsGrid .queue-feature-card");
  const queueMiniCards = await count(page, "#newsGrid .queue-mini-card");
  const radarBlips = await count(page, "#radarBlips .blip");
  const socialCards = await count(page, "#socialFeed .social-card");
  const pulseCards = await count(page, "#pulseStack .pulse-card");
  const jarvisBlob = await count(page, "#jarvisBlob .blob-core");
  const sourcePanel = await count(page, ".source-panel");
  const tickerText = await page.locator("#tickerTrack").innerText();
  const tsla = await page.locator("#metricTsla").innerText();

  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
  await context.close();

  if (!/^MATRIX/.test(title)) throw new Error(`${name}: title mismatch: ${title}`);
  if (priorityCards < 1) throw new Error(`${name}: priority cards did not render`);
  if (videoCards < 1) throw new Error(`${name}: video cards did not render`);
  if (queueFeature < 1) throw new Error(`${name}: queue feature did not render`);
  if (queueMiniCards < 1) throw new Error(`${name}: queue rail did not render`);
  if (radarBlips < 1) throw new Error(`${name}: radar blips did not render`);
  if (socialCards < 1) throw new Error(`${name}: social feed did not render`);
  if (pulseCards < 1) throw new Error(`${name}: research/model stack did not render`);
  if (jarvisBlob < 1) throw new Error(`${name}: Jarvis blob did not render`);
  if (sourcePanel !== 0) throw new Error(`${name}: old source panel should be removed`);
  if (!tickerText.trim()) throw new Error(`${name}: ticker is empty`);
  if (!tsla.trim() || tsla.trim() === "--") throw new Error(`${name}: TSLA metric is empty`);
  if (errors.length) throw new Error(`${name}: browser errors: ${errors.join(" | ")}`);

  return {
    name,
    priorityCards,
    videoCards,
    queueFeature,
    queueMiniCards,
    radarBlips,
    socialCards,
    pulseCards,
    tsla,
  };
}

(async () => {
  fs.mkdirSync("artifacts", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await verifyViewport(browser, "matrix-desktop", { viewport: { width: 1440, height: 920 } });
    const mobile = await verifyViewport(browser, "matrix-mobile", { ...devices["Pixel 7"] });
    console.log(JSON.stringify({ ok: true, desktop, mobile }, null, 2));
  } finally {
    await browser.close();
  }
})();
