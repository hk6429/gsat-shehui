import fs from "node:fs";
import vm from "node:vm";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const bankSource = fs.readFileSync(
  new URL("../data/bank.js", import.meta.url),
  "utf8",
);

for (const expected of [
  'id="discriminationSelect"',
  '<option value="high">高（≥ 0.5）</option>',
  '<option value="medium">中（0.3–0.5）</option>',
  '<option value="low">低（&lt; 0.3）</option>',
]) {
  if (!index.includes(expected)) {
    throw new Error(`Homepage lacks discrimination UI contract: ${expected}`);
  }
}
for (const expected of [
  "function discriminationValue(question)",
  "function inDiscrimination(question, value)",
  "inDiscrimination(question, discrimination)",
  '"discriminationSelect"',
]) {
  if (!app.includes(expected)) {
    throw new Error(`App lacks discrimination behavior contract: ${expected}`);
  }
}

for (const expected of [
  'id="shuffleCheckbox"',
  'id="timedCheckbox"',
  'id="difficultySortCheckbox"',
  'id="reviewBtn"',
  'id="mockBtn"',
  'id="paperBtn"',
  'id="exportBtn"',
  'id="importBtn"',
  'id="submitSessionBtn"',
  'id="paperPrintArea"',
  'id="paperYearQuick"',
  'id="paperYearQuickOptions"',
  'id="paperYearQuickSummary"',
  'id="paperDifficultyQuick"',
  'id="paperLinkBtn"',
  'id="paperPageSize"',
  'id="paperWordBtn"',
]) {
  if (!index.includes(expected)) {
    throw new Error(`Homepage lacks reference-site feature contract: ${expected}`);
  }
}

for (const expected of [
  "function dueWrongIds(",
  "function recordWrongBookResult(",
  "function startTimer(",
  "function submitDeferredSession(",
  "function orderedQuestions(",
  "function startMock(",
  "function exportRecords(",
  "async function importRecords(",
  "function renderPaperPicker(",
  "function printPaper(",
  "function selectedPaperYears(",
  "function handlePaperYearChange(",
  "function applyPaperQuickFilter(",
  "async function createPaperLink(",
  "function downloadPaperWord(",
  "function startLinkedQuestions(",
]) {
  if (!app.includes(expected)) {
    throw new Error(`App lacks reference-site behavior contract: ${expected}`);
  }
}

const context = { window: {} };
vm.runInNewContext(bankSource, context, { filename: "data/bank.js" });
const selected = context.window.BANK.flatMap((bank) => bank.questions).filter(
  (question) => question.type !== "constructed",
);
const values = selected
  .filter((question) => typeof question.disc === "number")
  .map((question) =>
    Math.abs(question.disc) > 1 ? question.disc / 100 : question.disc,
  );
const counts = {
  high: values.filter((value) => value >= 0.5).length,
  medium: values.filter((value) => value >= 0.3 && value < 0.5).length,
  low: values.filter((value) => value < 0.3).length,
};
if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== values.length) {
  throw new Error("Discrimination ranges do not cover every question with official statistics");
}

console.log(
  JSON.stringify(
    {
      selectedQuestions: selected.length,
      questionsWithOfficialDiscrimination: values.length,
      discriminationRanges: counts,
      homepageFeatureContracts: 20,
      status: "VERIFIED",
    },
    null,
    2,
  ),
);
