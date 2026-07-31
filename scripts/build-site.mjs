import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const files = [
  "about.html",
  "app.js",
  "check.html",
  "check.js",
  "favicon.svg",
  "guide.html",
  "index.html",
  "manifest.json",
  "poster.html",
  "privacy.html",
  "report-client.js",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
fs.cpSync(path.join(root, "img"), path.join(output, "img"), { recursive: true });
fs.mkdirSync(path.join(output, "data"), { recursive: true });
fs.copyFileSync(
  path.join(root, "data", "bank.js"),
  path.join(output, "data", "bank.js"),
);

console.log(`dist 建置完成：${files.length} 個頁面／資產檔，加上題庫與圖片。`);
