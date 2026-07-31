import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { window: {} };
for (const filename of fs
  .readdirSync(path.join(root, "data"))
  .filter((name) => /^g\d{2,3}\.js$/.test(name))
  .sort()) {
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "data", filename), "utf8"),
    context,
    { filename: `data/${filename}` },
  );
}

const banks = context.window.BANK;
const refs = new Set();
const issues = [];
let questions = 0;
let selected = 0;
let groups = 0;

for (const bank of banks) {
  groups += Object.keys(bank.groups).length;
  for (const [groupId, group] of Object.entries(bank.groups)) {
    if (/官方題本原頁/.test(group.passage) && !group.image) {
      issues.push(`${bank.year}-${groupId} 缺少共同材料圖片`);
    }
    if (group.image) refs.add(group.image);
  }
  for (const question of bank.questions) {
    questions += 1;
    if (question.type !== "constructed") selected += 1;
    const group = question.group ? bank.groups[question.group] : null;
    if (group?.image && question.image === group.image) {
      issues.push(`${bank.year}-${question.no} 重複引用同一張題組圖片`);
    }
    if (question.image) refs.add(question.image);
    for (const [key, option] of Object.entries(question.options ?? {})) {
      if (
        /第[壹貳參肆]部分|答題卷標示題號|本部分共有|非選擇題作圖部分|切勿使用修正/.test(
          option,
        )
      ) {
        issues.push(`${bank.year}-${question.no}-${key} 混入作答說明`);
      }
      if (/([\u4e00-\u9fff])\1{3}/.test(option)) {
        issues.push(`${bank.year}-${question.no}-${key} 有異常重複 OCR 文字`);
      }
    }
  }
}

for (const ref of refs) {
  if (/\/pages\//.test(ref)) {
    issues.push(`${ref} 仍引用整頁題本`);
    continue;
  }
  const imagePath = path.join(root, ref);
  if (!fs.existsSync(imagePath)) {
    issues.push(`${ref} 圖片不存在`);
    continue;
  }
  const [width, height] = execFileSync(
    "magick",
    ["identify", "-format", "%w %h", imagePath],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\s+/)
    .map(Number);
  if (width < 70 || height < 35) {
    issues.push(`${ref} 裁切範圍過小（${width}x${height}）`);
  }
  if (width > 850 && height > 1100) {
    issues.push(`${ref} 疑似仍為整頁截圖（${width}x${height}）`);
  }
}

if (questions !== 1850 || selected !== 1799 || groups !== 284) {
  issues.push(
    `題庫總數不符：${questions} 題／${selected} 選擇題／${groups} 題組`,
  );
}
if (issues.length) {
  throw new Error(`內容完整性驗證失敗：\n- ${issues.join("\n- ")}`);
}

console.log(
  JSON.stringify(
    {
      years: banks.length,
      questions,
      selected,
      groups,
      referencedImages: refs.size,
      fullPageReferences: 0,
      duplicateImageRendering: 0,
      ocrInstructionContamination: 0,
      status: "VERIFIED",
    },
    null,
    2,
  ),
);
