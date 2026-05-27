const { chromium, devices } = require("playwright");
const fs = require("fs");

async function verifyViewport(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".alert-card").length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1200);

  const title = await page.locator("h1").innerText();
  const cards = await page.locator(".alert-card").count();
  const layers = await page.locator(".layer-toggle input").count();
  const startupPopupVisible = await page.locator("#eventPopup:not(.hidden)").count();
  await page.locator(".alert-card").first().click();
  await page.waitForFunction(() => !document.querySelector("#eventPopup")?.classList.contains("hidden"), null, { timeout: 5000 });
  const clickedPopupVisible = await page.locator("#eventPopup:not(.hidden)").count();

  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const points = [
      [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
      [Math.floor(canvas.width * 0.35), Math.floor(canvas.height * 0.42)],
      [Math.floor(canvas.width * 0.65), Math.floor(canvas.height * 0.58)],
    ];
    return points.map(([x, y]) => {
      const data = new Uint8Array(4);
      gl.readPixels(x, canvas.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return Array.from(data);
    });
  });

  const nonBlankPixels = pixels.filter((rgba) => rgba[0] + rgba[1] + rgba[2] + rgba[3] > 0).length;
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
  await context.close();

  if (title !== "Matrix AI Intelligence") throw new Error(`${name}: title mismatch`);
  if (cards < 1) throw new Error(`${name}: alert feed did not render`);
  if (layers < 4) throw new Error(`${name}: layer controls did not render`);
  if (startupPopupVisible !== 0) throw new Error(`${name}: startup popup should stay hidden`);
  if (clickedPopupVisible < 1) throw new Error(`${name}: clicked event popup did not render`);
  if (nonBlankPixels < 2) throw new Error(`${name}: WebGL canvas appears blank: ${JSON.stringify(pixels)}`);
  if (errors.length) throw new Error(`${name}: browser errors: ${errors.join(" | ")}`);

  return { name, cards, layers, startupPopupVisible, clickedPopupVisible, pixels };
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
