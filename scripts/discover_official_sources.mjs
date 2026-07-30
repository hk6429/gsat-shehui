import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const listUrl =
  "https://www.ceec.edu.tw/xmfile?xsmsid=0J052424829869345634";
const output = path.join(root, "sources", "catalog.json");

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

const exams = new Map();

for (let page = 1; page <= 19; page += 1) {
  const response = await fetch(`${listUrl}&page=${page}`);
  if (!response.ok) {
    throw new Error(`Official list page ${page} returned HTTP ${response.status}`);
  }
  const html = await response.text();
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const titleMatch = plainText(row).match(
      /(\d{2,3})學年度學科能力測驗－社會/,
    );
    if (!titleMatch || plainText(row).includes("補考")) continue;
    const year = Number(titleMatch[1]);
    if (year < 90 || year > 114) continue;

    const resources = [];
    for (const anchor of row.matchAll(
      /<a\b[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    )) {
      const href = decodeHtml(anchor[1]);
      if (!href.includes("/files/file_pool/")) continue;
      resources.push({
        label: plainText(anchor[3]),
        title: decodeHtml(anchor[2]).replace(/\s*\(.*?視窗.*?\)\s*$/, ""),
        url: new URL(href, "https://www.ceec.edu.tw").href,
      });
    }
    if (!resources.length) {
      throw new Error(`Official ${year} social row has no downloadable resources`);
    }
    exams.set(year, {
      year,
      exam: "學測",
      subject: "社會",
      officialListPage: `${listUrl}&page=${page}`,
      resources,
    });
  }
}

const missing = [];
for (let year = 90; year <= 114; year += 1) {
  if (!exams.has(year)) missing.push(year);
}
if (missing.length) {
  throw new Error(`Official source discovery missing years: ${missing.join(", ")}`);
}

const payload = {
  source: "大學入學考試中心學測歷年試題及答題卷",
  sourceUrl: listUrl,
  generatedAt: new Date().toISOString(),
  years: [...exams.values()].sort((a, b) => b.year - a.year),
};
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, output)}: ${payload.years.length} years`);
