import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "sources", "catalog.json"), "utf8"),
);
const statsIndex =
  "https://www.ceec.edu.tw/xmdoc?xsmsid=0J018604485538810196";
const subjectStatsOverrides = {
  91: {
    passDisc:
      "https://www.ceec.edu.tw/files/file_pool/1/0J053536931107774930/91%20%E5%AD%B8%E5%B9%B4%E5%BA%A6%E5%AD%B8%E7%A7%91%E8%83%BD%E5%8A%9B%E6%B8%AC%E9%A9%97%E7%A4%BE%E6%9C%83%E7%A7%91%E7%AD%94%E5%B0%8D%E7%8E%87%E5%8F%8A%E9%91%91%E5%88%A5%E6%8C%87%E6%95%B8%E8%A1%A8.pdf",
    optionAnalysis:
      "https://www.ceec.edu.tw/files/file_pool/1/0J053536932741653967/91%20%E5%AD%B8%E5%B9%B4%E5%BA%A6%E5%AD%B8%E7%A7%91%E8%83%BD%E5%8A%9B%E6%B8%AC%E9%A9%97%E7%A4%BE%E6%9C%83%E7%A7%91%E9%81%B8%E6%93%87%E9%A1%8C%E9%81%B8%E9%A0%85%E5%88%86%E6%9E%90.pdf",
  },
};

async function download(url, target) {
  try {
    await fs.access(target);
    return "existing";
  } catch {
    // Continue with the official download.
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, bytes);
  return `${bytes.length} bytes`;
}

function hrefsByText(html, pattern) {
  const matches = [];
  for (const match of html.matchAll(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g)) {
    const text = match[2].replace(/\s+/g, "");
    if (pattern.test(text)) matches.push(match[1]);
  }
  return matches;
}

const statsPages = new Map();
for (const page of [1, 2, 3]) {
  const response = await fetch(`${statsIndex}&page=${page}`);
  const html = await response.text();
  for (const match of html.matchAll(
    /href="([^"]*xmdoc\/cont[^"]+)"[^>]*title="(\d{2,3})學年度學科能力測驗統計(?:圖表|資料)"/g,
  )) {
    const year = Number(match[2]);
    const url = new URL(match[1], "https://www.ceec.edu.tw").href;
    statsPages.set(year, url);
  }
}

for (let year = 110; year >= 90; year -= 1) {
  const entry = catalog.years.find((item) => item.year === year);
  if (!entry) throw new Error(`Catalog lacks ${year}`);
  const sourceDir = path.join(root, "sources", String(year));
  await fs.mkdir(sourceDir, { recursive: true });

  const testPdf = entry.resources.find(
    (item) => item.label === "試題內容" && /\.pdf$/i.test(item.url),
  );
  const testDocument = entry.resources.find(
    (item) => item.label === "試題內容" && /\.(?:docx?|DOCX?)$/i.test(item.url),
  );
  const answers = entry.resources.find((item) => item.label === "選擇題答案");
  if (!testPdf || !testDocument || !answers) {
    throw new Error(`${year} official test/document/answer resource incomplete`);
  }

  const documentExtension = /\.docx$/i.test(testDocument.url) ? "docx" : "doc";
  const baseJobs = [
    [testPdf.url, path.join(sourceDir, "official-test.pdf")],
    [
      testDocument.url,
      path.join(sourceDir, `official-test.${documentExtension}`),
    ],
    [answers.url, path.join(sourceDir, "official-answers.pdf")],
  ];
  for (const [url, target] of baseJobs) {
    console.log(year, path.basename(target), await download(url, target));
  }

  const statsPage = statsPages.get(year);
  if (!statsPage) {
    console.log(year, "official statistics page unavailable");
    continue;
  }
  const statsHtml = await (await fetch(statsPage)).text();
  const override = subjectStatsOverrides[year];
  const passDiscUrls = override
    ? [override.passDisc]
    : hrefsByText(statsHtml, /答對率.*鑑別|鑑別.*答對率/);
  const optionUrls = override
    ? [override.optionAnalysis]
    : hrefsByText(statsHtml, /選擇.*選項分析/);
  if (year === 90 && (!passDiscUrls.length || !optionUrls.length)) {
    console.log(year, "official per-question P/D and option analysis unavailable");
    continue;
  }
  if (!passDiscUrls.length || !optionUrls.length) {
    throw new Error(`${year} statistics links incomplete: ${statsPage}`);
  }
  for (const [urlValue, stem] of [
    [passDiscUrls.at(-1), "official-pass-disc"],
    [optionUrls.at(-1), "official-option-analysis"],
  ]) {
    const url = new URL(urlValue, "https://www.ceec.edu.tw").href;
    const extension = path.extname(new URL(url).pathname).toLowerCase() || ".xls";
    const target = path.join(sourceDir, `${stem}${extension}`);
    console.log(year, path.basename(target), await download(url, target));
  }
}
