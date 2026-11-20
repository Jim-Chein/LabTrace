/**
 * Browser checks for result-file references. The desktop open/reveal commands
 * are covered by the Rust tests; this checks the labels, full path, and that
 * a browser file name is not treated as a path.
 *
 *   node scripts/verify-files.mjs
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:1420/", { waitUntil: "networkidle0" });
await page.waitForSelector(".page-title");
const pathText = "/Users/甲/实验 数据/实验 记录.xlsx";
const saved = await page.evaluate((sourcePath) => {
  const raw = localStorage.getItem("labtrace.snapshot.v1");
  const snap = JSON.parse(raw);
  const block = snap.blocks.find((item) => item.kind === "files");
  snap.attachments.unshift({
    id: "link-demo",
    experimentId: block.experimentId,
    blockId: block.id,
    filename: "实验 记录.xlsx",
    sourcePath,
    size: 4096,
    updatedAt: Date.now(),
  });
  return JSON.stringify(snap);
}, pathText);
await page.evaluateOnNewDocument((value) => localStorage.setItem("labtrace.snapshot.v1", value), saved);
await page.reload({ waitUntil: "networkidle0" });
await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "eMJ001");
  button?.click();
});
await page.waitForSelector(".file-path");
const report = await page.evaluate((sourcePath) => {
  const paths = [...document.querySelectorAll(".file-path")].map((node) => node.textContent.trim());
  const legacy = [...document.querySelectorAll(".ref-tag")].map((node) => node.textContent.trim());
  return {
    paths,
    legacy,
    hasDownload: [...document.querySelectorAll("button")].some((node) => node.textContent.includes("下载")),
    showsPath: paths.includes(sourcePath),
    legacyCopy: legacy.includes("已导入副本") && paths.includes("没有原文件路径"),
  };
}, pathText);
console.log(JSON.stringify(report, null, 2));
if (!report.showsPath || !report.legacyCopy || report.hasDownload) {
  await browser.close();
  process.exit(1);
}
const row = await page.$(".trow.file-cols");
await row?.evaluate((node) => node.scrollIntoView({ block: "center" }));
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.mkdirSync("docs/screenshots", { recursive: true });
await page.screenshot({ path: "docs/screenshots/files.png" });
await page.screenshot({ path: "/opt/cursor/artifacts/files.png" });

await page.evaluate(() => {
  const row = [...document.querySelectorAll(".trow.file-cols")].find((item) => item.textContent.includes("/Users/"));
  row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
});
await page.waitForSelector(".toast", { timeout: 3000 });
const linkedToast = await page.$eval(".toast", (node) => node.textContent);
console.log("linked toast", linkedToast);
if (!linkedToast.includes("浏览器预览不能打开本机文件")) process.exit(1);

await page.click(".toast button");
await page.evaluate(() => {
  const row = [...document.querySelectorAll(".trow.file-cols")].find((item) => item.textContent.includes("已导入副本"));
  row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
});
await page.waitForSelector(".toast", { timeout: 3000 });
const legacyToast = await page.$eval(".toast", (node) => node.textContent);
console.log("legacy toast", legacyToast);
if (!legacyToast.includes("没有原文件路径")) process.exit(1);

await page.click(".toast button");
await page.setViewport({ width: 1100, height: 520, deviceScaleFactor: 1 });
await page.evaluate(() => {
  const notes = document.querySelector(".lid-text");
  if (notes) notes.textContent = Array.from({ length: 50 }, (_, index) => `记录行 ${index} 9/8 14:00 观察`).join("\n");
  const content = document.querySelector(".content");
  if (content) content.scrollTop = 420;
});
await new Promise((resolve) => setTimeout(resolve, 100));
await page.screenshot({ path: "docs/screenshots/scroll.png" });
await page.screenshot({ path: "/opt/cursor/artifacts/scroll.png" });
await browser.close();
console.log("file reference checks passed");
