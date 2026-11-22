import { createRequire } from "module";
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON ?? `${process.env.HOME}/.claude/skills/gstack/package.json`);
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
for (const route of ["/start", "/add", "/pills"]) {
  await page.goto("http://localhost:3411" + route, { waitUntil: "networkidle" });
  const stops = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 22);
      return `${el.tagName.toLowerCase()}:${label}${style.outlineStyle === "none" ? " [NO RING]" : ""}`;
    }));
  }
  console.log(route, "->", stops.join(" | "));
}
await browser.close();
