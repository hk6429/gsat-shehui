import fs from "node:fs";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const html = fs.readFileSync(new URL("index.html", root), "utf8");
const bankSource = fs.readFileSync(new URL("data/bank.js", root), "utf8");
const appSource = fs.readFileSync(new URL("app.js", root), "utf8");

const dom = new JSDOM(html, {
  url: "https://gsat-shehui.test/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
let printed = false;

window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
window.HTMLElement.prototype.scrollIntoView = () => {};
window.alert = () => {};
window.confirm = () => true;
window.print = () => {
  printed = true;
};
window.URL.createObjectURL = () => "blob:records";
window.URL.revokeObjectURL = () => {};

window.eval(bankSource);
window.eval(appSource);

const $ = (id) => window.document.getElementById(id);
const click = (element) =>
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const change = (element) =>
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// 由易到難：即使同時勾著隨機，排序仍優先，且三題順序對應官方答對率。
$("filterBody").hidden = false;
$("countInput").value = "3";
$("difficultySortCheckbox").checked = true;
change($("difficultySortCheckbox"));
click($("startBtn"));
const expectedEasy = window.BANK.flatMap((bank) =>
  bank.questions
    .filter(
      (question) =>
        question.type !== "constructed" && typeof question.pass === "number",
    )
    .map((question) => ({ ...question, year: bank.year })),
)
  .sort((a, b) => b.pass - a.pass || b.year - a.year || a.no - b.no)
  .slice(0, 3)
  .map((question) => `${question.year}－${question.no}.`);
const renderedEasy = [...window.document.querySelectorAll(".question-stem b")].map(
  (node) => node.textContent,
);
assert(
  JSON.stringify(renderedEasy) === JSON.stringify(expectedEasy),
  "由易到難排序未依官方答對率生效",
);

// 計時練習：先選答案、不立即揭曉；交卷後才顯示解析並停止計時。
click($("resetBtn"));
$("difficultySortCheckbox").checked = false;
$("shuffleCheckbox").checked = false;
$("timedCheckbox").checked = true;
$("countInput").value = "2";
click($("startBtn"));
const timedCard = window.document.querySelector(".question-card");
click(timedCard.querySelector(".option"));
assert(timedCard.querySelector(".feedback").hidden, "計時模式作答後不應立即揭曉");
assert(!$("submitSessionBtn").hidden && !$("timerText").hidden, "計時模式缺少交卷或倒數");
click($("submitSessionBtn"));
assert(!timedCard.querySelector(".feedback").hidden, "計時模式交卷後未顯示結果");

// 90 年舊制複選題：可同時選取多個答案，確認後依官方答案 BDE 判分。
click($("resetBtn"));
$("yearSelect").value = "90";
change($("yearSelect"));
$("timedCheckbox").checked = false;
$("countInput").value = "80";
click($("startBtn"));
const multipleCard = [...window.document.querySelectorAll(".question-card")].find(
  (card) => card.querySelector(".question-stem b")?.textContent === "90－51.",
);
assert(multipleCard, "90 年第 51 題複選題未載入");
for (const key of ["B", "D", "E"]) {
  click(multipleCard.querySelector(`.option[data-key="${key}"]`));
}
click(multipleCard.querySelector(".confirm-multiple"));
assert(
  multipleCard.querySelector(".feedback").classList.contains("correct"),
  "90 年複選題未依官方 BDE 答案判分",
);

// 整回模考：指定 114 年後須載入完整 64 題，並使用 110 分鐘倒數。
click($("resetBtn"));
$("yearSelect").value = "114";
change($("yearSelect"));
click($("mockBtn"));
assert(
  window.document.querySelectorAll(".question-card").length === 64,
  "114 年整回模考未載入完整 64 題",
);
assert($("sessionTitle").textContent.includes("114 學年度整回模考"), "模考標題錯誤");
assert($("timerText").textContent.includes("110:00"), "整回模考倒數不是官方 110 分鐘");
click($("submitSessionBtn"));

// 未作答題會進第 1 盒並顯示今日複習入口。
assert(Number($("wrongCount").textContent) > 0, "交卷後錯題未加入錯題本");
assert(!$("reviewBtn").hidden, "有到期錯題時未顯示今日複習");

// 教師出卷：依目前 114 年條件列題、可全選並產生列印題卷與教師答案。
click($("paperBtn"));
const paperCheckboxes = window.document.querySelectorAll(".paper-question-checkbox");
assert(paperCheckboxes.length === 54, "教師出卷未依 114 年選擇題條件列出 54 題");
click($("paperSelectAllBtn"));
assert($("paperCount").textContent === "已選 54 題", "教師出卷全選計數錯誤");
click($("paperPrintBtn"));
assert(printed, "教師出卷未觸發列印");
assert($("paperPrintArea").textContent.includes("教師答案"), "列印內容缺少教師答案");

dom.window.close();

console.log(
  JSON.stringify(
    {
      difficultySort: "VERIFIED",
      timedDeferredGrading: "VERIFIED",
      multipleChoice90: "BDE / VERIFIED",
      mockExam114: "64 questions / 110 minutes",
      dueReview: "VERIFIED",
      teacherPaper: "54 selected questions / answer key",
      status: "VERIFIED",
    },
    null,
    2,
  ),
);
