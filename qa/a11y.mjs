import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON ?? `${process.env.HOME}/.claude/skills/gstack/package.json`);
const { chromium } = require("playwright-core");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.argv[2] || "http://localhost:3411";
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "out");
const AXE = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "node_modules/axe-core/axe.min.js"), "utf8");
const PAGES = ["/", "/start", "/add", "/symptoms", "/peptides", "/pills", "/dose", "/profile", "/print", "/tested"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
];
const SAMPLE = JSON.parse(fs.readFileSync(process.env.SAMPLE_ITEMS, "utf8"));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });
const summary = [];
for (const viewport of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
  await ctx.addInitScript((items) => {
    const household = {
      activeId: "me",
      people: [{ id: "me", name: "Me", answeredQuestions: true, cabinet: items, supply: {},
        profile: { ageYears: 67, pregnant: false, breastfeeding: false, drinksThreeOrMoreDaily: true, conditions: ["high_blood_pressure"], allergies: [] } }],
    };
    if (!localStorage.getItem("shelf-check.household.v2")) localStorage.setItem("shelf-check.household.v2", JSON.stringify(household));
  }, SAMPLE);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => msg.type() === "error" && !msg.text().includes("_next/hmr") && consoleErrors.push(msg.text().slice(0, 200)));
  for (const route of PAGES) {
    consoleErrors.length = 0;
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(route === "/" || route === "/print" ? 6000 : 1500);
    await page.addScriptTag({ content: AXE });
    const result = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), summary: v.nodes[0]?.failureSummary?.slice(0, 220) }));
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const smallTargets = viewport.isMobile
      ? await page.evaluate(() => [...document.querySelectorAll("a,button,input,select,summary")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24); }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`))
      : [];
    const file = path.join(OUT, `${viewport.name}${route === "/" ? "-home" : route.replaceAll("/", "-")}.png`);
    await page.screenshot({ path: file, fullPage: viewport.isMobile });
    summary.push({ viewport: viewport.name, route, violations: result, overflow, smallTargets, consoleErrors: [...consoleErrors] });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "a11y.json"), JSON.stringify(summary, null, 1));
for (const row of summary) {
  const v = row.violations.map((x) => `${x.id}(${x.impact},${x.count})`).join(" ");
  console.log(`${row.viewport.padEnd(7)} ${row.route.padEnd(10)} overflow=${row.overflow} ${v || "no axe violations"}${row.smallTargets.length ? " | small: " + row.smallTargets.join(", ") : ""}${row.consoleErrors.length ? " | console: " + row.consoleErrors.length : ""}`);
}
