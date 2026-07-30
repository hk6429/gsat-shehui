import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const context = { window: {} };
const genericPatterns = [
  /^官方答案為 [A-E](?:、[A-E])*。作答時應逐項對照題幹的時間、空間與因果條件/,
  /^答案為 [A-E]。題幹的時間、空間與因果條件最符合/,
];

for (const sourceFile of fs
  .readdirSync(dataDir)
  .filter((name) => /^g\d{2,3}\.js$/.test(name))
  .sort()) {
  const source = fs.readFileSync(path.join(dataDir, sourceFile), "utf8");
  vm.runInNewContext(source, context, { filename: `data/${sourceFile}` });
}

const failures = [];
const reports = [];

for (const bank of context.window.BANK.sort((a, b) => a.year - b.year)) {
  const selected = bank.questions.filter(
    (question) => question.type !== "constructed",
  );
  const yearFailures = [];

  for (const question of selected) {
    const explanation = question.explain?.trim() ?? "";
    const optionLabels = Object.keys(question.options);
    const acceptedAnswers = question.acceptedAnswers ?? [
      ...new Set(question.answer.split("")),
    ];
    const officialNoAnswer =
      acceptedAnswers.length === optionLabels.length &&
      acceptedAnswers.every((label) => optionLabels.includes(label));
    const missingLabels = optionLabels.filter(
      (label) =>
        !new RegExp(
          `(?:^|[：；。\\s])${label}(?:[「『（(:：、]|$)`,
        ).test(explanation),
    );
    const reasons = [];

    if (genericPatterns.some((pattern) => pattern.test(explanation))) {
      reasons.push("generic-template");
    }
    if (explanation.length < 60) {
      reasons.push("too-short");
    }
    if (
      officialNoAnswer &&
      !(
        explanation.includes("官方公告") &&
        explanation.includes("無答案") &&
        explanation.includes("全體給分")
      )
    ) {
      reasons.push("official-no-answer-not-explicit");
    } else if (
      !officialNoAnswer &&
      !acceptedAnswers.every(
        (label) =>
          explanation.includes(`答案為 ${label}`) ||
          explanation.includes(`答案為 ${acceptedAnswers.join("、")}`) ||
          explanation.includes(`選 ${label}`) ||
          explanation.includes(`${label} 正確`) ||
          explanation.includes(`${label}：正確`),
      )
    ) {
      reasons.push("answer-not-explicit");
    }
    if (!explanation.includes("選項辨析")) {
      reasons.push("no-option-analysis");
    }
    if (missingLabels.length) {
      reasons.push(`missing-option-reasons:${missingLabels.join("")}`);
    }

    if (reasons.length) {
      const failure = {
        id: `${bank.year}-${question.no}`,
        reasons,
      };
      yearFailures.push(failure);
      failures.push(failure);
    }
  }

  reports.push({
    year: bank.year,
    selected: selected.length,
    passed: selected.length - yearFailures.length,
    failed: yearFailures.length,
  });
}

console.log(JSON.stringify({ years: reports, failures }, null, 2));

if (failures.length) {
  process.exitCode = 1;
}
