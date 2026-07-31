import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const visualPattern =
  /圖\s*[一二三四五六七八九十\d㈠-㈩]|表\s*[一二三四五六七八九十\d㈠-㈩]|照片\s*[一二三四五六七八九十\d]|下圖|附圖|右圖|左圖|圖中|表中|地圖|示意圖|題圖/;
const report = [];

for (const filename of fs
  .readdirSync(dataDir)
  .filter((name) => /^g\d{2,3}\.js$/.test(name))
  .sort()) {
  const sourcePath = path.join(dataDir, filename);
  const source = fs.readFileSync(sourcePath, "utf8");
  const bank = JSON.parse(
    source.split("window.BANK.push(", 2)[1].replace(/\);\s*$/, ""),
  );
  let changed = false;

  for (const question of bank.questions) {
    if (!question.image) continue;
    const group = question.group ? bank.groups[question.group] : null;
    const questionText = [
      question.stem,
      ...Object.values(question.options ?? {}),
    ].join(" ");
    let reason = "";
    if (group?.image) {
      reason = "題組圖片已涵蓋共同材料";
    } else if (!visualPattern.test(questionText)) {
      reason = "題目文字沒有引用圖片、表格或地圖";
    }
    if (!reason) continue;
    report.push({
      id: `${bank.year}-${question.no}`,
      removed: question.image,
      reason,
    });
    delete question.image;
    changed = true;
  }

  if (changed) {
    const rendered =
      `// ${bank.year} 學測社會：由官方試題、答案、評分原則與統計資料驗證。\n` +
      "window.BANK = window.BANK || [];\n" +
      `window.BANK.push(${JSON.stringify(bank, null, 2)});\n`;
    fs.writeFileSync(sourcePath, rendered);
  }
}

console.log(JSON.stringify({ removed: report.length, questions: report }, null, 2));
