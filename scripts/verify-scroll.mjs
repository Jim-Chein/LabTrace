/**
 * Reproducible scroll check for the LabTrace layout.
 *
 * The window used to clip long records: `.app` is `overflow: hidden`, and the
 * grid items grew with their content (`min-height: auto`) so `.content` never
 * became a scrollport. Wheel, trackpad, and PageDown then did nothing.
 *
 * Run with the Vite dev server on 127.0.0.1:1420:
 *   node scripts/verify-scroll.mjs
 */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok" : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

async function metrics() {
  return page.evaluate(() => {
    const info = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
    };
    const probe = document.getElementById("scroll-probe");
    return {
      viewport: window.innerHeight,
      app: info(".app"),
      main: info(".main"),
      content: info(".content"),
      topbar: info(".topbar"),
      rail: info(".rail"),
      tree: info(".tree"),
      probeTop: probe ? probe.getBoundingClientRect().top : null,
      tabsTop: document.querySelector(".topbar")?.getBoundingClientRect().top ?? null,
    };
  });
}

await page.setViewport({ width: 1100, height: 500, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:1420/", { waitUntil: "networkidle0" });
await page.waitForSelector(".page-title");
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "eMJ001");
  button?.click();
});
await page.waitForSelector(".lid-text");
await page.evaluate(() => {
  const notes = document.querySelector(".lid-text");
  if (notes) notes.textContent = Array.from({ length: 80 }, (_, index) => `记录行 ${index} 观察`).join("\n");
  const host = document.querySelector(".page");
  const probe = document.createElement("div");
  probe.id = "scroll-probe";
  probe.textContent = "BOTTOM MARKER";
  host?.appendChild(probe);
  for (let index = 0; index < 40; index += 1) {
    const row = document.createElement("button");
    row.className = "tree-row";
    row.textContent = `文件夹 ${index}`;
    document.querySelector(".tree")?.appendChild(row);
  }
});

const before = await metrics();
check("content is the scrollport", before.content && before.content.scrollHeight > before.content.clientHeight + 20, JSON.stringify(before.content));
check("app stays within the viewport", before.app && before.app.clientHeight <= before.viewport + 1, JSON.stringify(before.app));
check("main does not grow past the viewport", before.main && before.main.clientHeight <= before.viewport + 1, JSON.stringify(before.main));
check("bottom starts below the fold", (before.probeTop ?? 0) > before.viewport);

async function wheelAt(x, y, delta) {
  await page.mouse.move(x, y);
  await page.mouse.wheel({ deltaY: delta });
  await new Promise((resolve) => setTimeout(resolve, 150));
}
await wheelAt(760, 280, 700);
const afterWheel = await metrics();
check("wheel scrolls the record", (afterWheel.content?.scrollTop ?? 0) > 40, `scrollTop=${afterWheel.content?.scrollTop}`);
check("tabs stay on screen", (afterWheel.tabsTop ?? 99) < 40 && (afterWheel.tabsTop ?? -1) >= 0, `tabsTop=${afterWheel.tabsTop}`);

const treeBox = await page.$eval(".tree", (el) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + Math.min(40, rect.height / 2), client: el.clientHeight, scroll: el.scrollHeight };
});
const treeBefore = (await metrics()).tree?.scrollTop ?? 0;
await wheelAt(treeBox.x, treeBox.y, 400);
const treeAfter = (await metrics()).tree?.scrollTop ?? 0;
check("sidebar tree scrolls on its own", treeAfter > treeBefore && treeBox.scroll > treeBox.client + 20, `${treeBefore} -> ${treeAfter} box=${JSON.stringify(treeBox)}`);

const contentBeforeKey = (await metrics()).content?.scrollTop ?? 0;
await page.focus(".content");
await page.keyboard.press("PageDown");
const afterKey = await metrics();
check("PageDown scrolls the record", (afterKey.content?.scrollTop ?? 0) > contentBeforeKey + 20, `${contentBeforeKey} -> ${afterKey.content?.scrollTop}`);

await page.click("[data-well='A1']");
const afterFocus = (await metrics()).content?.scrollTop ?? 0;
await page.keyboard.press("PageDown");
await new Promise((resolve) => setTimeout(resolve, 50));
const afterButtonKey = await metrics();
check("PageDown still scrolls when a well button is focused", (afterButtonKey.content?.scrollTop ?? 0) > afterFocus + 20, `${afterFocus} -> ${afterButtonKey.content?.scrollTop}`);

await page.evaluate(() => {
  const content = document.querySelector(".content");
  if (content) content.scrollTop = 0;
});
await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
const plate = await page.$(".plate-grid");
const plateBox = await plate?.boundingBox();
if (plateBox) {
  const beforePlate = (await metrics()).content?.scrollTop ?? 0;
  await wheelAt(plateBox.x + plateBox.width / 2, plateBox.y + plateBox.height / 2, 500);
  const afterPlate = (await metrics()).content?.scrollTop ?? 0;
  check("wheel over the plate still scrolls the record", afterPlate > beforePlate + 20, `${beforePlate} -> ${afterPlate}`);
}

const a1 = await page.$("[data-well='A1']");
const c3 = await page.$("[data-well='C3']");
const a1Box = await a1?.boundingBox();
const c3Box = await c3?.boundingBox();
if (a1Box && c3Box) {
  await page.mouse.move(a1Box.x + a1Box.width / 2, a1Box.y + a1Box.height / 2);
  await page.mouse.down();
  await page.mouse.move(c3Box.x + c3Box.width / 2, c3Box.y + c3Box.height / 2, { steps: 8 });
  await page.mouse.up();
  const band = await page.$(".band");
  check("plate drag still selects a range", !!band);
}

await page.setViewport({ width: 900, height: 360, deviceScaleFactor: 1 });
await page.evaluate(() => {
  const content = document.querySelector(".content");
  if (content) content.scrollTop = 0;
});
const smallBefore = await metrics();
await wheelAt(560, 200, 400);
const smallAfter = await metrics();
check("short window still scrolls", (smallAfter.content?.scrollTop ?? 0) > 20 && (smallBefore.main?.clientHeight ?? 9999) <= 360, `scrollTop=${smallAfter.content?.scrollTop}`);
check("rail stays fixed in a short window", (smallAfter.rail?.scrollTop ?? 1) === 0);

await browser.close();
if (failures.length) {
  console.error(`failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("scroll checks passed");
